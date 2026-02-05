import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult, MusicPlugin, StreamInfo, Comment } from "../types";

interface SongPlayDetails {
    url: string;
    lyric?: string;
    coverUrl?: string; 
    isMv?: boolean;
}

export class ClientSideService {
  // --- Headers & Config ---
  private neteaseHeaders = {
    'Referer': 'https://music.163.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '115.239.211.112', 
    'X-Forwarded-For': '115.239.211.112'
  };
  
  private bilibiliHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/'
  };

  // 这里的列表对应 NewPipe 的后端节点列表
  private pipedInstances = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.video",
    "https://pipedapi.drg.li",
    "https://piped-api.lunar.icu",
    "https://ytapi.dc09.ru",
    "https://pa.il.ly",
    "https://api.piped.privacy.com.de"
  ];

  private activePipedInstance = "https://pipedapi.kavin.rocks"; 
  private plugins: MusicPlugin[] = [];
  private guestCookie = 'os=pc; appver=2.9.7;';
  private apiBaseUrl = ''; 
  private logs: string[] = [];
  private searchTimeout = 15000;
  
  constructor() {
    this.generateGuestHeaders();
    this.checkBestInstance(); // 启动时自动寻找最快节点
  }

  // --- Logger ---
  public log(msg: string) {
      const time = new Date().toLocaleTimeString();
      const entry = `[${time}] ${msg}`;
      this.logs.unshift(entry);
      if (this.logs.length > 200) this.logs.pop();
      console.log(entry);
  }
  public getLogs() { return this.logs; }
  public clearLogs() { this.logs = []; }

  // --- Config ---
  setApiBaseUrl(url: string) { this.apiBaseUrl = url.replace(/\/$/, ''); }
  setSearchTimeout(ms: number) { this.searchTimeout = ms; }
  setCustomInvidiousUrl(url: string) { 
      if(url && !this.pipedInstances.includes(url)) this.pipedInstances.unshift(url); 
  }

  // --- Helper Methods ---
  private generateGuestHeaders() {
      const r = () => Math.floor(Math.random() * 1e16).toString(16);
      this.guestCookie = `os=pc; appver=2.9.7; NMTID=${r()}; DeviceId=${r()};`;
  }

  private getNeteaseHeaders() {
      const savedUser = localStorage.getItem('unistream_user');
      let cookieStr = this.guestCookie; 
      if (savedUser) {
          try {
              const userData = JSON.parse(savedUser);
              if (userData.cookie && userData.cookie.length > 5) {
                  let targetCookie = userData.cookie;
                  if (!targetCookie.includes('os=pc')) cookieStr = `os=pc; appver=2.9.7; ${targetCookie}`;
                  else cookieStr = targetCookie; 
              }
          } catch(e) {}
      }
      return { ...this.neteaseHeaders, 'Cookie': cookieStr };
  }

  private timeoutPromise<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
      return new Promise((resolve) => {
          const timer = setTimeout(() => resolve(fallbackValue), ms);
          promise
              .then((res) => { clearTimeout(timer); resolve(res); })
              .catch(() => { clearTimeout(timer); resolve(fallbackValue); });
      });
  }

  // 自动检测最快的 Piped 节点
  private async checkBestInstance() {
      for (const instance of this.pipedInstances) {
          try {
              const start = Date.now();
              const res = await CapacitorHttp.head({ url: `${instance}/streams/IsThisVideoIdReal` });
              if (res.status === 200 || res.status === 404) { // 404 means API is reachable
                 this.log(`Switched to fast node: ${instance} (${Date.now() - start}ms)`);
                 this.activePipedInstance = instance;
                 return;
              }
          } catch (e) {}
      }
  }

  // --- Core: Search Music ---
  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
    this.log(`Search Request: "${query}"`);
    
    // 1. YouTube (NewPipe Core Logic) - 优先加载，最稳定
    this.searchYouTubeRobust(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    }).catch(e => this.log(`YouTube Robust failed: ${e}`));

    // 2. Netease
    this.searchNetease(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    }).catch(e => this.log(`Netease failed: ${e}`));

    // 3. Bilibili
    this.searchBilibili(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    }).catch(e => this.log(`Bilibili failed: ${e}`));

    // 4. Plugins
    this.plugins.forEach(async (plugin) => {
        try {
            if (typeof plugin.search === 'function') {
                const results = await this.timeoutPromise(plugin.search(query, 1, 'music'), 10000, []);
                if (Array.isArray(results) && results.length > 0) {
                    onProgress(results.map(r => this.mapPluginSong(r, plugin)));
                }
            }
        } catch(e: any) {}
    });
  }

  // --- YouTube / NewPipe Logic ---
  private async searchYouTubeRobust(query: string): Promise<Song[]> {
      const filters = ['music_videos', 'videos']; // 优先音乐视频
      
      for (const filter of filters) {
          try {
              const songs = await this.fetchPiped(this.activePipedInstance, query, filter);
              if (songs.length > 0) return songs;
          } catch(e: any) {
              // 如果当前节点挂了，尝试切换
              await this.checkBestInstance();
          }
      }
      // 如果所有都失败，尝试通用搜索
      return await this.fetchPiped(this.activePipedInstance, query, 'all');
  }

  private async fetchPiped(instance: string, query: string, filter: string): Promise<Song[]> {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=${filter}`;
      
      const response = await CapacitorHttp.get({ 
          url, 
          connectTimeout: 8000,
          headers: { 'Accept': 'application/json' }
      });

      if (response.status !== 200) throw new Error(`Status ${response.status}`);
      
      let data = response.data;
      if (typeof data === 'string') try { data = JSON.parse(data); } catch(e) {}

      const items = data.items || data;
      if (!Array.isArray(items)) return [];

      return items.map((item: any) => ({
          id: item.url ? item.url.split('/watch?v=')[1] : item.id,
          title: item.title,
          artist: item.uploaderName || item.author?.name || 'Unknown',
          artistId: item.uploaderUrl ? item.uploaderUrl.split('/channel/')[1] : undefined,
          album: 'YouTube',
          coverUrl: item.thumbnail || item.thumbnails?.[0]?.url || '',
          source: MusicSource.YOUTUBE,
          duration: item.duration || 0,
          viewCount: item.views,
          isLive: item.isLive,
          publishDate: item.uploadedDate,
          isGray: false
      })).filter((s: any) => s.id && !s.isGray);
  }

  // --- Advanced Details (NewPipe Feature: Full Stream Extraction) ---
  async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<SongPlayDetails> {
      // 1. YouTube / NewPipe
      if (song.source === MusicSource.YOUTUBE) {
          try {
              const url = `${this.activePipedInstance}/streams/${song.id}`;
              const res = await CapacitorHttp.get({ url });
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

              // 智能选择流 (模仿 NewPipe 的格式选择逻辑)
              let audioStream;
              if (quality === 'lossless' || quality === 'exhigh') {
                   // 尝试找高码率 (webm/opus 通常音质更好)
                   audioStream = data.audioStreams?.find((s: any) => s.mimeType?.includes('webm') && !s.videoOnly);
              }
              if (!audioStream) {
                   // 兼容性优先 (m4a/mp4)
                   audioStream = data.audioStreams?.find((s: any) => s.mimeType?.includes('mp4') && !s.videoOnly);
              }
              // 保底
              if (!audioStream) audioStream = data.audioStreams?.[0];

              // 获取字幕
              const subtitles = data.subtitles?.map((sub: any) => ({
                  url: sub.url,
                  lang: sub.code,
                  label: sub.name
              }));

              // 获取推荐视频作为“相关歌曲”
              if (data.relatedStreams) {
                  song.streamInfo = {
                      audioStreams: data.audioStreams,
                      videoStreams: data.videoStreams,
                      relatedSongs: data.relatedStreams.slice(0, 10).map((r: any) => ({
                          id: r.url.split('v=')[1],
                          title: r.title,
                          artist: r.uploaderName,
                          coverUrl: r.thumbnail,
                          source: MusicSource.YOUTUBE,
                          duration: r.duration
                      })),
                      subtitles: subtitles || [],
                      description: data.description
                  };
              }

              return { 
                  url: audioStream?.url || '',
                  lyric: undefined, // YouTube 字幕需另外解析为 LRC，暂留空
                  coverUrl: data.thumbnailUrl
              };
          } catch(e) { 
              this.log(`YT Stream failed, retrying...`); 
          }
      }

      // 2. Plugin
      if (song.source === MusicSource.PLUGIN && song.pluginId) {
          const plugin = this.plugins.find(p => p.id === song.pluginId);
          if (plugin && plugin.getMediaUrl) {
              try {
                  const res = await plugin.getMediaUrl(song);
                  return { 
                      url: typeof res === 'string' ? res : res.url,
                      lyric: typeof res === 'object' ? res.lyric : undefined
                  };
              } catch(e) {}
          }
      }

      // 3. Netease
      if (song.source === MusicSource.NETEASE) {
          const br = quality === 'lossless' ? 999000 : 320000;
          try {
              const res = await CapacitorHttp.post({
                  url: 'https://music.163.com/api/song/enhance/player/url',
                  headers: this.getNeteaseHeaders(),
                  data: `ids=[${song.id}]&br=${br}`
              });
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
              if (data.data?.[0]?.url) return { url: data.data[0].url };
          } catch(e) {}
      }

      return { url: song.audioUrl || '' };
  }

  // --- NewPipe Feature: Comments ---
  async getComments(song: Song): Promise<Comment[]> {
      if (song.source !== MusicSource.YOUTUBE) return [];
      
      try {
          const url = `${this.activePipedInstance}/comments/${song.id}`;
          const res = await CapacitorHttp.get({ url });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          
          if (data.comments) {
              return data.comments.map((c: any) => ({
                  id: c.commentId,
                  author: c.author,
                  authorAvatar: c.thumbnail,
                  content: c.commentText,
                  time: c.commentedTime,
                  likes: c.likeCount,
                  replyCount: c.replyCount
              }));
          }
      } catch(e) {}
      return [];
  }

  // --- NewPipe Feature: Channel Details ---
  async getChannelDetails(channelId: string): Promise<{artist: Artist, songs: Song[]}> {
      try {
          // 处理 ID 格式，有些是 UC 开头，有些是 handle
          const url = `${this.activePipedInstance}/channel/${channelId}`;
          const res = await CapacitorHttp.get({ url });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

          const artist: Artist = {
              id: data.id,
              name: data.name,
              coverUrl: data.avatarUrl,
              description: data.description,
              subscriberCount: data.subscriberCount,
              bannerUrl: data.bannerUrl
          };

          const songs = data.relatedStreams.map((item: any) => ({
              id: item.url.split('v=')[1],
              title: item.title,
              artist: data.name,
              artistId: data.id,
              album: 'YouTube Channel',
              coverUrl: item.thumbnail,
              source: MusicSource.YOUTUBE,
              duration: item.duration,
              viewCount: item.views,
              publishDate: item.uploadedDate
          }));

          return { artist, songs };
      } catch(e) {
          // Fallback to Netease logic if failed
          return this.getArtistDetailNetease(channelId);
      }
  }

  // --- Netease Implementations ---
  private async searchNetease(keyword: string): Promise<Song[]> {
      try {
          const url = 'https://music.163.com/api/cloudsearch/pc';
          const data = `s=${encodeURIComponent(keyword)}&type=1&offset=0&limit=20&total=true`;
          const response = await CapacitorHttp.post({ url, headers: this.getNeteaseHeaders(), data, connectTimeout: 5000 });
          const resData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          if (resData?.result?.songs) {
              return resData.result.songs.map((item: any) => this.mapNeteaseSong(item));
          }
      } catch (e) {}
      return [];
  }

  private mapNeteaseSong(item: any): Song {
      return {
          id: String(item.id),
          title: item.name,
          artist: item.ar ? item.ar.map((a: any) => a.name).join('/') : (item.artists ? item.artists.map((a: any) => a.name).join('/') : 'Unknown'),
          artistId: item.ar ? String(item.ar[0].id) : undefined,
          album: item.al ? item.al.name : (item.album ? item.album.name : ''),
          coverUrl: item.al?.picUrl ? item.al.picUrl : (item.album?.picUrl ? item.album.picUrl : ''),
          source: MusicSource.NETEASE,
          duration: Math.floor(item.dt / 1000),
          isGray: false
      };
  }

  private async getArtistDetailNetease(artistId: string): Promise<{artist: Artist, songs: Song[]}> {
      try {
          const res = await CapacitorHttp.get({
              url: `https://music.163.com/api/artist/songs?id=${artistId}&limit=50&offset=0`,
              headers: this.getNeteaseHeaders()
          });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          return {
              artist: { id: artistId, name: 'Artist', coverUrl: '' },
              songs: data.songs ? data.songs.map((t: any) => this.mapNeteaseSong(t)) : []
          };
      } catch(e) {}
      return { artist: {id: artistId, name:'Unknown', coverUrl:''}, songs: [] };
  }

  // --- Bilibili Logic ---
  private async searchBilibili(keyword: string): Promise<Song[]> {
      try {
          const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}`;
          const response = await CapacitorHttp.get({ url, headers: this.bilibiliHeaders, connectTimeout: 5000 });
          if (response.status === 200) {
              const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
              if (data.data?.result) {
                  return data.data.result.map((item: any) => ({
                      id: item.bvid,
                      title: item.title.replace(/<[^>]*>/g, ''),
                      artist: item.author,
                      album: 'Bilibili',
                      coverUrl: item.pic.startsWith('//') ? `https:${item.pic}` : item.pic,
                      source: MusicSource.BILIBILI,
                      duration: this.parseBiliDuration(item.duration),
                      isGray: false
                  }));
              }
          }
      } catch (e) {}
      return [];
  }

  private parseBiliDuration(str: string): number {
      if (!str) return 0;
      const parts = str.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return 0;
  }

  // --- Plugin System ---
  async importPlugin(code: string): Promise<boolean> {
      try {
          const bridgeFetch = async (url: string, options: any = {}) => {
              const res = await CapacitorHttp.request({
                  url,
                  method: options.method || 'GET',
                  headers: options.headers,
                  data: options.body,
                  connectTimeout: 10000
              });
              return {
                  ok: res.status >= 200 && res.status < 300,
                  status: res.status,
                  text: async () => (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)),
                  json: async () => (typeof res.data === 'object' ? res.data : JSON.parse(res.data)),
                  headers: { get: (k: string) => res.headers[k] || res.headers[k.toLowerCase()] }
              };
          };

          const sandbox = { module: { exports: {} }, fetch: bridgeFetch, console: console };
          const run = new Function('module', 'exports', 'fetch', 'console', code);
          run(sandbox.module, sandbox.module.exports, sandbox.fetch, sandbox.console);

          const plugin = sandbox.module.exports as any;
          const pid = plugin.platform || plugin.id;
          
          const normalized: MusicPlugin = {
              id: pid,
              name: plugin.name || pid || 'Unknown',
              version: plugin.version || '0.0.1',
              author: plugin.author || 'Unknown',
              sources: [pid],
              status: 'active',
              search: plugin.search,
              getMediaUrl: plugin.getMediaUrl || plugin.play 
          };

          this.plugins = this.plugins.filter(p => p.id !== normalized.id);
          this.plugins.push(normalized);
          return true;
      } catch(e: any) {
          return false;
      }
  }

  async installPluginFromUrl(url: string): Promise<boolean> {
      try {
          const res = await CapacitorHttp.get({ url });
          const code = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
          return await this.importPlugin(code);
      } catch(e) { return false; }
  }

  getPlugins() { return this.plugins; }
  private mapPluginSong(r: any, plugin: MusicPlugin): Song {
      return {
          id: String(r.id),
          title: r.title || r.name || 'Unknown',
          artist: r.artist || r.author || 'Unknown',
          album: r.album || plugin.name,
          coverUrl: r.artwork || r.cover || '',
          source: MusicSource.PLUGIN,
          duration: r.duration || 0,
          pluginId: plugin.id,
          isGray: false
      };
  }

  // --- Other Stubs ---
  async getMvUrl(song: Song): Promise<string | null> { return null; }
  
  async runDiagnostics(): Promise<DiagnosticResult[]> {
      const results: DiagnosticResult[] = [];
      const start = Date.now();
      try {
          await this.fetchPiped(this.activePipedInstance, "test", "music_videos");
          results.push({ name: 'YouTube Core (Piped)', status: 'ok', latency: Date.now() - start, message: `Node: ${this.activePipedInstance}` });
      } catch(e: any) {
          results.push({ name: 'YouTube Core (Piped)', status: 'error', latency: Date.now() - start, message: e.message });
      }
      return results;
  }

  async getUserPlaylists(userId: string): Promise<Playlist[]> { return []; }
  async importNeteasePlaylist(playlistId: string): Promise<Song[]> { return []; }
  async getArtistDetail(artistId: string): Promise<{artist: Artist, songs: Song[]}> {
      // 智能路由：如果是纯数字ID通常是网易云，如果是哈希字符串通常是 YouTube
      if (artistId.length > 15 || artistId.startsWith('UC')) {
          return this.getChannelDetails(artistId);
      }
      return this.getArtistDetailNetease(artistId);
  }
  async getDailyRecommendSongs(): Promise<Song[]> { return []; }
  async getUserStatus(cookieInput: string): Promise<any> { return { code: 200 }; }
}

export const musicService = new ClientSideService();
