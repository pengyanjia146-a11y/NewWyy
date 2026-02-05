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
  user_account
} = require('NeteaseCloudMusicApi');

const app = express();
const PORT = 3001;

// Allow CORS and Cookies
app.use(cors({
  origin: true, 
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Initialize YouTube Client
let yt = null;
(async () => {
    try {
        yt = await Innertube.create({
            cache: new UniversalCache(false),
            generate_session_locally: true
        });
        console.log('[YouTube] Innertube initialized successfully.');
    } catch (e) {
        console.error('[YouTube] Initialization failed:', e);
    }
})();

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// --- Mappers ---
const mapNeteaseSong = (item) => ({
  id: String(item.id),
  title: item.name,
  artist: item.ar ? item.ar.map(a => a.name).join('/') : 'Unknown',
  album: item.al ? item.al.name : '',
  coverUrl: item.al ? item.al.picUrl : '',
  source: 'NETEASE',
  duration: Math.floor(item.dt / 1000),
  isGray: false 
});

const mapYoutubeSong = (item) => {
    const title = item.title.text || item.title;
    const author = item.author?.name || item.author?.text || 'Unknown';
    const id = item.id;
    const thumbnails = item.thumbnails || [];
    const coverUrl = thumbnails.length > 0 ? thumbnails[0].url : '';
    let duration = 0;
    if (item.duration && item.duration.seconds) duration = item.duration.seconds;
    
    return {
        id: id,
        title: title,
        artist: author,
        album: 'YouTube',
        coverUrl: coverUrl,
        source: 'YOUTUBE',
        duration: duration,
        isGray: false
    };
};

const mapBiliSong = (item) => {
    const parseDuration = (str) => {
        if (!str) return 0;
        const parts = str.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    };

    return {
        id: item.bvid,
        title: item.title.replace(/<[^>]*>/g, ''),
        artist: item.author,
        album: 'Bilibili',
        coverUrl: item.pic.startsWith('//') ? `https:${item.pic}` : item.pic,
        source: 'BILIBILI',
        duration: parseDuration(item.duration),
        isGray: false
    };
};

// --- API Endpoints ---

// 1. Unified Search API
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  const cookie = req.query.cookie || ''; 
  if (!q) return res.status(400).json({ error: 'Query is required' });

  const tasks = [];

  // Netease
  tasks.push(neteaseSearch({ keywords: q, type: 1, limit: 10, cookie })
      .then(data => ({ source: 'NETEASE', data: data.body.result?.songs || [] }))
      .catch(e => ({ source: 'NETEASE', error: e }))
  );

  // YouTube
  if (yt) {
      tasks.push(yt.search(q, { type: 'video' })
          .then(data => ({ source: 'YOUTUBE', data: data.results || [] }))
          .catch(e => ({ source: 'YOUTUBE', error: e }))
      );
  }

  // Bilibili
  tasks.push(axios.get(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(q)}`, {
      headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': "buvid3=infoc;" 
      }
  }).then(r => ({ source: 'BILIBILI', data: r.data?.data?.result || [] }))
    .catch(e => ({ source: 'BILIBILI', error: e }))
  );

  try {
      const results = await Promise.all(tasks);
      let songs = [];

      results.forEach(r => {
          if (r.source === 'NETEASE' && r.data) {
              songs = [...songs, ...r.data.map(mapNeteaseSong)];
          } else if (r.source === 'YOUTUBE' && r.data) {
              songs = [...songs, ...r.data.filter(i => i.type === 'Video').slice(0, 5).map(mapYoutubeSong)];
          } else if (r.source === 'BILIBILI' && r.data) {
              songs = [...songs, ...r.data.map(mapBiliSong)];
          }
      });

      res.json({ songs });
  } catch (error) {
    console.error('Search Error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// 2. Universal Play URL Resolver
app.get('/api/url', async (req, res) => {
  const { id, source, cookie } = req.query;

  try {
      if (source === 'NETEASE') {
          let result = await song_url({ id: id, level: 'standard', cookie: cookie || '' });
          let url = result.body?.data?.[0]?.url;
          if (!url) {
             result = await song_url({ id: id, level: 'exhigh', cookie: cookie || '' });
             url = result.body?.data?.[0]?.url;
          }
          if (!url) return res.status(404).json({ error: 'Unavailable' });
          return res.json({ url: url }); 

      } else if (source === 'YOUTUBE') {
          if(!yt) return res.status(503).json({error: 'YouTube not ready'});
          const info = await yt.getBasicInfo(id, 'ANDROID');
          const streamingData = info.streaming_data;
          
          const formats = [...(streamingData.adaptive_formats || []), ...(streamingData.formats || [])];
          const audioFormats = formats.filter(f => f.mime_type.includes('audio'));
          audioFormats.sort((a, b) => b.bitrate - a.bitrate);

          if (audioFormats.length > 0) {
              return res.json({ url: audioFormats[0].url });
          }
          return res.status(404).json({ error: 'No audio found' });

      } else if (source === 'BILIBILI') {
          const viewRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${id}`);
          const cid = viewRes.data?.data?.cid;
          if (!cid) return res.status(404).json({ error: 'CID not found' });

          const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${id}&cid=${cid}&qn=64&fnval=16&platform=html5&high_quality=1`;
          const playRes = await axios.get(playUrl, { 
              headers: { 
                  'Referer': 'https://www.bilibili.com/',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' 
              } 
          });
          const realUrl = playRes.data?.data?.durl?.[0]?.url;
          
          if (!realUrl) return res.status(404).json({ error: 'Play URL not found' });
          return res.json({ url: realUrl });
      }
  } catch (e) {
      console.error("Resolve Error:", e.message);
      return res.status(500).json({ error: 'Resolution failed' });
  }

  res.status(404).json({ error: 'Source not supported' });
});

// Netease Login
app.get('/api/login/qr/key', async (req, res) => {
    try { const r = await login_qr_key({ timestamp: Date.now() }); res.json(r.body); } catch(e){res.status(500).send(e)}
});
app.get('/api/login/qr/create', async (req, res) => {
    try { const r = await login_qr_create({ key: req.query.key, qrimg: true, timestamp: Date.now() }); res.json(r.body); } catch(e){res.status(500).send(e)}
});
app.get('/api/login/qr/check', async (req, res) => {
    try { const r = await login_qr_check({ key: req.query.key, timestamp: Date.now() }); res.json({...r.body, cookie: r.cookie}); } catch(e){res.status(500).send(e)}
});
app.get('/api/login/status', async (req, res) => {
    try { const r = await user_account({ cookie: req.query.cookie }); res.json(r.body); } catch(e){res.status(500).send(e)}
});

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`UniStream Backend Running: http://${ip}:${PORT}`);
  console.log(`[Config] Please set this IP in App Settings.`);
});
