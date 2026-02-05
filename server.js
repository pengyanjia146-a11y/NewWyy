// server.js
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
  user_account
} = require('NeteaseCloudMusicApi');

const app = express();
const PORT = 3001;

// 允许跨域
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// 初始化 YouTube 客户端
let yt = null;
(async () => {
    try {
        yt = await Innertube.create({
            cache: new UniversalCache(false),
            generate_session_locally: true
        });
        console.log('[YouTube] Innertube initialized.');
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

// --- 辅助函数 ---
const getBilibiliStreamUrl = async (bvid) => {
    try {
        // 1. 获取 CID
        const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
        const cid = viewRes.data?.data?.cid;
        if (!cid) throw new Error('No CID found');

        // 2. 获取播放地址 (fnval=16 代表 DASH 格式，通常音质更好且链接更稳定)
        const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=16&platform=html5&high_quality=1`;
        const playRes = await axios.get(playUrl, { 
            headers: { 
                'Cookie': "buvid3=infoc;", // 简单的反爬绕过
                'Referer': 'https://www.bilibili.com/' 
            } 
        });

        // 优先尝试 DASH 音频
        const dashAudio = playRes.data?.data?.dash?.audio?.[0]?.baseUrl;
        if (dashAudio) return dashAudio;

        // 降级尝试普通 MP4/FLV durl
        const durl = playRes.data?.data?.durl?.[0]?.url;
        if (durl) return durl;

        throw new Error('No stream URL found');
    } catch (e) {
        console.error('Bilibili Resolve Error:', e.message);
        return null;
    }
};

const getNeteaseStreamUrl = async (id, cookie) => {
    try {
        let result = await song_url({ id: id, level: 'standard', cookie: cookie || '' });
        let url = result.body?.data?.[0]?.url;
        if (!url) {
             result = await song_url({ id: id, level: 'exhigh', cookie: cookie || '' });
             url = result.body?.data?.[0]?.url;
        }
        return url;
    } catch (e) {
        console.error('Netease Resolve Error:', e.message);
        return null;
    }
};

// --- API 接口 ---

// 1. 核心代理流接口 (解决 403 Forbidden 问题)
app.get('/api/stream', async (req, res) => {
    const { id, source } = req.query;
    const range = req.headers.range;

    if (!id || !source) return res.status(400).send('Missing params');

    let targetUrl = '';
    let headers = {};

    try {
        if (source === 'BILIBILI') {
            targetUrl = await getBilibiliStreamUrl(id);
            headers = { 
                'Referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            };
        } else if (source === 'NETEASE') {
            const cookie = req.query.cookie || '';
            targetUrl = await getNeteaseStreamUrl(id, cookie);
            headers = {
                'Referer': 'https://music.163.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            };
        }

        if (!targetUrl) return res.status(404).send('Stream not found');

        // 发起流请求
        const axiosConfig = {
            url: targetUrl,
            method: 'GET',
            responseType: 'stream',
            headers: { ...headers }
        };

        // 处理 Range 请求 (实现拖拽进度条)
        if (range) {
            axiosConfig.headers['Range'] = range;
        }

        const response = await axios(axiosConfig);

        // 转发响应头
        res.status(response.status);
        const headersToForward = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
        headersToForward.forEach(h => {
            if (response.headers[h]) res.setHeader(h, response.headers[h]);
        });

        // 管道转发数据流
        response.data.pipe(res);

    } catch (error) {
        console.error(`Stream Proxy Error (${source}):`, error.message);
        if (!res.headersSent) res.status(500).send('Stream Error');
    }
});

// 2. 获取播放地址 (现在返回指向本机的代理地址)
app.get('/api/url', async (req, res) => {
    const { id, source } = req.query;
    const host = req.get('host'); 
    const protocol = req.protocol;
    
    // 构建指向本机的流地址
    const proxyUrl = `${protocol}://${host}/api/stream?id=${encodeURIComponent(id)}&source=${source}`;

    if (source === 'BILIBILI' || source === 'NETEASE') {
        // 直接返回代理地址，不再返回原始 403 地址
        return res.json({ url: proxyUrl });
    } 
    else if (source === 'YOUTUBE') {
        // YouTube 保持原有逻辑，或者也走代理
        return res.json({ url: `${protocol}://${host}/api/yt/play?id=${id}` });
    }

    res.status(404).json({ error: 'Source not supported' });
});

// 3. YouTube 播放重定向 (保留)
app.get('/api/yt/play', async (req, res) => {
    const { id } = req.query;
    if(!yt) return res.status(503).send('YouTube client not ready');

    try {
        const info = await yt.getBasicInfo(id, 'ANDROID');
        const streamingData = info.streaming_data;
        if (!streamingData) return res.status(404).send('No streaming data');

        const formats = [...(streamingData.adaptive_formats || []), ...(streamingData.formats || [])];
        const audioFormats = formats.filter(f => f.mime_type.includes('audio'));
        audioFormats.sort((a, b) => b.bitrate - a.bitrate);

        if (audioFormats.length > 0) {
            return res.redirect(audioFormats[0].url);
        } else {
            return res.status(404).send('No audio format found');
        }
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// 4. 搜索接口 (保留原逻辑，稍微精简)
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  const cookie = req.query.cookie || ''; 
  if (!q) return res.status(400).json({ error: 'Query is required' });

  const tasks = [];
  tasks.push(neteaseSearch({ keywords: q, type: 1, limit: 10, cookie })
      .then(data => ({ source: 'NETEASE', data: data.body.result?.songs || [] }))
      .catch(() => ({ source: 'NETEASE', data: [] }))
  );

  if (yt) {
      tasks.push(yt.search(q, { type: 'video' })
          .then(data => ({ source: 'YOUTUBE', data: data.results || [] }))
          .catch(() => ({ source: 'YOUTUBE', data: [] }))
      );
  }

  try {
      const results = await Promise.all(tasks);
      let songs = [];
      results.forEach(r => {
          if (r.source === 'NETEASE') {
              songs = [...songs, ...r.data.map(item => ({
                  id: String(item.id),
                  title: item.name,
                  artist: item.ar ? item.ar.map(a => a.name).join('/') : 'Unknown',
                  album: item.al ? item.al.name : '',
                  coverUrl: item.al ? item.al.picUrl : '',
                  source: 'NETEASE',
                  duration: Math.floor(item.dt / 1000)
              }))];
          } else if (r.source === 'YOUTUBE') {
              songs = [...songs, ...r.data.filter(i => i.type === 'Video').slice(0, 5).map(item => ({
                  id: item.id,
                  title: item.title.text || item.title,
                  artist: item.author?.name || 'Unknown',
                  album: 'YouTube',
                  coverUrl: item.thumbnails?.[0]?.url || '',
                  source: 'YOUTUBE',
                  duration: 0
              }))];
          }
      });
      res.json({ songs });
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// Bilibili Search (保留)
app.get('/api/search/bilibili', async (req, res) => {
    const { q } = req.query;
    try {
        const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(q)}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com/',
                'Cookie': "buvid3=infoc;"
            }
        });
        const songs = response.data?.data?.result?.map(item => ({
            id: item.bvid,
            title: item.title.replace(/<[^>]*>/g, ''),
            artist: item.author,
            album: 'Bilibili',
            coverUrl: item.pic.startsWith('//') ? `https:${item.pic}` : item.pic,
            source: 'BILIBILI',
            duration: 0 // 简化处理
        })) || [];
        return res.json({ songs });
    } catch (e) {
        return res.json({ songs: [] });
    }
});

// Netease Login Endpoints (保留)
app.get('/api/login/qr/key', async (req, res) => { try { const r = await login_qr_key({ timestamp: Date.now() }); res.json(r.body); } catch(e){res.status(500).send(e)} });
app.get('/api/login/qr/create', async (req, res) => { try { const r = await login_qr_create({ key: req.query.key, qrimg: true, timestamp: Date.now() }); res.json(r.body); } catch(e){res.status(500).send(e)} });
app.get('/api/login/qr/check', async (req, res) => { try { const r = await login_qr_check({ key: req.query.key, timestamp: Date.now() }); res.json({...r.body, cookie: r.cookie}); } catch(e){res.status(500).send(e)} });
app.get('/api/login/status', async (req, res) => { try { const r = await user_account({ cookie: req.query.cookie }); res.json(r.body); } catch(e){res.status(500).send(e)} });

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`UniStream Backend Running: http://${ip}:${PORT}`);
  console.log(`[Tips] Make sure your frontend API_BASE_URL points to http://${ip}:${PORT}`);
});
