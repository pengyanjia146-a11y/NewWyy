const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Innertube, UniversalCache } = require('youtubei.js'); // 核心库
const { search, song_url } = require('NeteaseCloudMusicApi');

const app = express();
const PORT = 3001;

// 初始化 YouTube 伪装客户端
let yt = null;
(async () => {
    try {
        yt = await Innertube.create({
            cache: new UniversalCache(false),
            generate_session_locally: true // 本地生成 session，无需远程验证
        });
        console.log('[System] YouTube Client Initialized (Android Mock)');
    } catch (e) {
        console.error('[System] YouTube Init Failed:', e);
    }
})();

app.use(cors());
app.use(express.json());

// 1. 聚合搜索接口 (并行处理，失败不报错)
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ songs: [] });

    const tasks = [];

    // 网易云任务
    tasks.push(search({ keywords: q, type: 1, limit: 10 })
        .then(r => r.body.result?.songs?.map(s => ({
            id: String(s.id),
            title: s.name,
            artist: s.ar?.map(a => a.name).join('/') || 'Unknown',
            album: s.al?.name || '',
            coverUrl: s.al?.picUrl || '',
            source: 'NETEASE',
            duration: Math.floor(s.dt / 1000)
        })) || [])
        .catch(() => [])
    );

    // YouTube 任务 (使用 youtubei.js)
    if (yt) {
        tasks.push(yt.search(q, { type: 'video' })
            .then(r => r.videos.map(v => ({
                id: v.id,
                title: v.title.text || v.title,
                artist: v.author?.name || 'Unknown',
                album: 'YouTube',
                coverUrl: v.thumbnails?.[0]?.url,
                source: 'YOUTUBE',
                duration: v.duration?.seconds || 0
            })))
            .catch(e => {
                console.error("YT Search Error:", e.message);
                return [];
            })
        );
    }

    // Bilibili 任务 (后端代理)
    tasks.push(axios.get('https://api.bilibili.com/x/web-interface/search/type', {
        params: { keyword: q, search_type: 'video' },
        headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.bilibili.com/',
            'Cookie': 'buvid3=infoc;' 
        }
    }).then(r => (r.data?.data?.result || []).map(v => ({
        id: v.bvid,
        title: v.title.replace(/<[^>]+>/g, ''),
        artist: v.author,
        album: 'Bilibili',
        coverUrl: v.pic.startsWith('//') ? `https:${v.pic}` : v.pic,
        source: 'BILIBILI',
        duration: 0 // B站时间处理较复杂，暂略
    }))).catch(() => []));

    // 等待所有结果合并
    const results = await Promise.all(tasks);
    const songs = results.flat();
    res.json({ songs });
});

// 2. 播放接口 (YouTube 直链重定向)
app.get('/api/yt/play', async (req, res) => {
    const { id } = req.query;
    if (!yt || !id) return res.status(400).send('Error');
    try {
        const info = await yt.getBasicInfo(id, 'ANDROID'); // 伪装成安卓获取
        const format = info.streaming_data.adaptive_formats
            .filter(f => f.has_audio && !f.has_video)
            .sort((a, b) => b.bitrate - a.bitrate)[0];
        
        if (format?.url) res.redirect(format.url); // 直接重定向，不消耗服务器流量
        else res.status(404).send('No URL');
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// 3. 统一 URL 获取
app.get('/api/url', async (req, res) => {
    const { id, source } = req.query;
    if (source === 'NETEASE') {
        const r = await song_url({ id, level: 'standard' });
        res.json({ url: r.body.data[0].url });
    } else if (source === 'YOUTUBE') {
        // 让前端直接去请求上面的重定向接口
        res.json({ url: `http://${req.headers.host}/api/yt/play?id=${id}` });
    } else {
        res.json({ url: '' }); // B站逻辑暂略
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
