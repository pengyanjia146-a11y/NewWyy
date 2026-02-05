// Saved on 2026-02-05
// Original: server.js

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Innertube } = require('youtubei.js');
const NeteaseApi = require('NeteaseCloudMusicApi');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const yt = new Innertube();

app.get('/api/search', async (req, res) => {
  const q = req.query.q || '';
  const source = req.query.source || 'YOUTUBE';
  try {
    if (source === 'YOUTUBE') {
      const results = await yt.search(q, { type: 'video' });
      return res.json({ results: results.items.map(i => ({ id: i.id, title: i.title, thumbnails: i.bestThumbnail?.url })) });
    }
    return res.json({ results: [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/url', async (req, res) => {
  const id = req.query.id;
  const source = req.query.source || 'YOUTUBE';
  try {
    if (!id) return res.status(400).json({ error: 'missing id' });
    if (source === 'YOUTUBE') {
      const info = await yt.getInfo(id);
      const formats = info.streamingData?.formats?.concat(info.streamingData?.adaptiveFormats || []);
      const audio = (formats || []).filter(f => /audio/i.test(f.mimeType)).sort((a,b) => (b.bitrate||0)-(a.bitrate||0))[0];
      if (audio) return res.json({ url: audio.url, type: audio.mimeType });
      if (info.streamingData?.hlsManifestUrl) return res.json({ url: info.streamingData.hlsManifestUrl, type: 'application/x-mpegURL' });
    }
    if (source === 'NETEASE') {
      // NeteaseCloudMusicApi proxy logic: use NeteaseCloudMusicApi or direct endpoints
      const Netease = new NeteaseApi();
      const url = await Netease.getSongUrl(id);
      return res.json({ url });
    }
    return res.status(404).json({ error: 'not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/yt/play', async (req, res) => {
  const id = req.query.id;
  try {
    const info = await yt.getInfo(id);
    const formats = info.streamingData?.formats?.concat(info.streamingData?.adaptiveFormats || []);
    const audio = (formats || []).filter(f => /audio/i.test(f.mimeType)).sort((a,b) => (b.bitrate||0)-(a.bitrate||0))[0];
    if (audio) return res.redirect(audio.url);
    if (info.streamingData?.hlsManifestUrl) return res.redirect(info.streamingData.hlsManifestUrl);
    return res.status(404).send('no playable stream');
  } catch (e) { res.status(500).send(e.message); }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log('Server listening on', port));
