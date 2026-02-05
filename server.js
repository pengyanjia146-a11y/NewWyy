// 文件路径: server.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const os = require('os');
const axios = require('axios');
const { Innertube, UniversalCache } = require('youtubei.js');
const { 
  search: neteaseSearch, 
  song_url, 
  login_qr_key, 
  login_qr_create, 
  login_qr_check,
  user_account,
  // [新增] 引入歌单相关 API
  user_playlist,
  playlist_track_all
} = require('NeteaseCloudMusicApi');

const app = express();
const PORT = 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// 1. 初始化 YouTube 客户端 (模拟 Android App)
let yt = null;
(async () => {
    try {
        yt = await Innertube.create({
            cache: new UniversalCache(false),
            generate_session_locally: true,
            location: 'US', // 模拟美区以获得更全曲库
            lang: 'en'
        });
        console.log('[YouTube] Innertube (Android Client) initialized.');
    } catch (e) {
        console.error('[YouTube] Init failed:', e);
    }
})();

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// --- [新增] 获取用户歌单 API ---
app.get('/api/user/playlists', async (req, res) => {
    const { uid, cookie } = req.query;
    if (!uid) return res.status(400).json({ error: 'UID required' });
    
    try {
        const result = await user_playlist({
            uid: uid,
            limit: 30, // 获取前30个歌单
            offset: 0,
            cookie: cookie || ''
        });
        
        const playlists = result.body.playlist.map(pl => ({
            id: String(pl.id),
            name: pl.name,
            description: pl.description || '',
            coverUrl: pl.coverImgUrl,
            trackCount: pl.trackCount,
            isSystem: false,
            creator: pl.creator.nickname,
            source: 'NETEASE' // 标记来源
        }));
        
        res.json({ playlists });
    } catch (e) {
        console.error('Fetch Playlist Error:', e);
        res.status(500).json({ error: 'Failed to fetch playlists' });
    }
});

// --- [新增] 获取歌单详情 (歌单内的歌曲) API ---
app.get('/api/playlist/detail', async (req, res) => {
    const { id, cookie } = req.query;
    try {
        const result = await playlist_track_all({
            id: id,
            limit: 1000,
            cookie: cookie || ''
        });
        
        const songs = result.body.songs.map(s => ({
            id: String(s.id),
            title: s.name,
            artist: s.ar.map(a => a.name).join('/'),
            album: s.al.name,
            coverUrl: s.al.picUrl,
            source: 'NETEASE',
            duration: Math.floor(s.dt / 1000),
            fee: s.fee
        }));
        
        res.json({ songs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- API: 获取播放链接 (含代理逻辑) ---
app.get('/api/url', async (req, res) => {
  const { id, source, cookie, type } = req.query; // type: 'audio' | 'video'
  const host = req.get('host');
  const protocol = req.protocol;

  try {
      // === 网易云音乐 ===
      if (source === 'NETEASE') {
          let result = await song_url({ id, level: 'lossless', cookie: cookie || '' });
          let url = result.body?.data?.[0]?.url;
          if (!url) { // 降级
             result = await song_url({ id, level: 'standard', cookie: cookie || '' });
             url = result.body?.data?.[0]?.url;
          }
          if (url) return res.json({ url }); 
          return res.status(404).json({ error: 'Netease URL failed' });

      // === YouTube ===
      } else if (source === 'YOUTUBE') {
          if(!yt) return res.status(503).json({error: 'YouTube not ready'});
          
          const info = await yt.getBasicInfo(id, 'ANDROID');
          const formats = [...(info.streaming_data?.adaptive_formats || []), ...(info.streaming_data?.formats || [])];
          
          let targetFormat;
          if (type === 'video') {
              targetFormat = formats.find(f => f.has_video && f.has_audio);
              if (!targetFormat) targetFormat = formats.filter(f => f.has_video).sort((a,b) => b.bitrate - a.bitrate)[0];
          } else {
              const audioFormats = formats.filter(f => f.has_audio);
              targetFormat = audioFormats.find(f => f.container === 'm4a') || audioFormats[0];
          }

          if (targetFormat) {
              const proxyUrl = `${protocol}://${host}/api/proxy?url=${encodeURIComponent(targetFormat.url)}`;
              return res.json({ url: proxyUrl, original: targetFormat.url });
          }
          return res.status(404).json({ error: 'No suitable format found' });

      // === Bilibili ===
      } else if (source === 'BILIBILI') {
          const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${id}`);
          const cid = viewRes.data?.data?.cid;
          if (!cid) return res.status(404).json({ error: 'CID not found' });
          const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${id}&cid=${cid}&qn=64&fnval=16&platform=html5&high_quality=1`;
          const playRes = await axios.get(playUrl, { headers: { 'Referer': 'https://www.bilibili.com/' } });
          const realUrl = playRes.data?.data?.durl?.[0]?.url;
          
          if (realUrl) {
              const proxyUrl = `${protocol}://${host}/api/proxy?url=${encodeURIComponent(realUrl)}&referer=https://www.bilibili.com/`;
              return res.json({ url: proxyUrl });
          }
      }
  } catch (e) {
      console.error("Resolve Error:", e.message);
      return res.status(500).json({ error: 'Resolution failed' });
  }
  res.status(404).json({ error: 'Source not supported' });
});

// --- 万能流媒体代理 ---
app.get('/api/proxy', async (req, res) => {
    const { url, referer } = req.query;
    if (!url) return res.status(400).send('URL required');

    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
                ...(referer ? { 'Referer': referer } : {})
            }
        });

        if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
        if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
        if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);

        response.data.pipe(res);
    } catch (e) {
        console.error('Proxy Error:', e.message);
        res.status(502).send('Proxy Stream Failed');
    }
});

// --- Search API ---
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });
    
    const tasks = [];
    if(yt) tasks.push(yt.search(q, { type: 'video' }).then(d=>({source:'YOUTUBE', data: d.results})).catch(e=>({source:'YOUTUBE', error:e})));
    
    // 网易云搜索
    tasks.push(neteaseSearch({ keywords: q, limit: 10 }).then(d=>({source:'NETEASE', data: d.body.result?.songs})).catch(e=>({source:'NETEASE', error:e})));

    try {
        const results = await Promise.all(tasks);
        let songs = [];
        results.forEach(r => {
             if(r.source === 'YOUTUBE' && r.data) {
                 songs = [...songs, ...r.data.filter(i=>i.type==='Video').map(item => ({
                     id: item.id,
                     title: item.title.text||item.title,
                     artist: item.author?.name||'Unknown',
                     coverUrl: item.thumbnails?.[0]?.url||'',
                     source: 'YOUTUBE',
                     duration: item.duration?.seconds||0
                 }))];
             } else if (r.source === 'NETEASE' && r.data) {
                 songs = [...songs, ...r.data.map(item => ({
                     id: String(item.id),
                     title: item.name,
                     artist: item.artists?.[0]?.name || 'Unknown',
                     coverUrl: item.album?.artist?.img1v1Url || '', 
                     source: 'NETEASE',
                     duration: Math.floor(item.duration / 1000)
                 }))];
             }
        });
        res.json({ songs });
    } catch(e) { res.status(500).json({error:e}); }
});

// Netease Login Endpoints
app.get('/api/login/qr/key', async (req, res) => { try { const r = await login_qr_key({ timestamp: Date.now() }); res.json(r.body); } catch(e){res.status(500).send(e)} });
app.get('/api/login/qr/create', async (req, res) => { try { const r = await login_qr_create({ key: req.query.key, qrimg: true, timestamp: Date.now() }); res.json(r.body); } catch(e){res.status(500).send(e)} });
app.get('/api/login/qr/check', async (req, res) => { try { const r = await login_qr_check({ key: req.query.key, timestamp: Date.now() }); res.json({...r.body, cookie: r.cookie}); } catch(e){res.status(500).send(e)} });
app.get('/api/login/status', async (req, res) => { try { const r = await user_account({ cookie: req.query.cookie }); res.json(r.body); } catch(e){res.status(500).send(e)} });

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`UniStream Backend: http://${ip}:${PORT}`);
});
