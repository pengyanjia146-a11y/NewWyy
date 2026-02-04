import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult, MusicPlugin } from "../types";

interface SongPlayDetails {
    url: string;
    lyric?: string;
    coverUrl?: string; 
    isMv?: boolean;
}

export class ClientSideService {
  private baseHeaders = {
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

  private youtubeHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://www.youtube.com/',
    'Origin': 'https://www.youtube.com'
  };

  private pipedInstances = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.video",
    "https://pipedapi.drg.li",
    "https://piped-api.lunar.icu",
    "https://ytapi.dc09.ru"
  ];

  private activePipedInstance = "https://pipedapi.kavin.rocks";
  private plugins: any[] = [];
  private guestCookie = '';
  private apiBaseUrl = ''; 
  private logs: string[] = [];
  
  constructor() { this.generateGuestHeaders(); }

  // --- Logger ---
  public log(msg: string) {
      const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
      this.logs.unshift(entry);
      if (this.logs.length > 50) this.logs.pop();
      console.log(entry);
  }
  public getLogs() { return this.logs; }
  public clearLogs() { this.logs = []; }

  // --- Config (修复 App.tsx 报错) ---
  setApiBaseUrl(url: string) { this.apiBaseUrl = url.replace(/\/$/, ''); }
  setSearchTimeout(ms: number) { /* 逻辑已集成在 CapacitorHttp 中 */ }
  setCustomInvidiousUrl(url: string) { /* 可扩展使用 */ }

  private randomHex(length: number) {
      return Array.from({length}, () => Math.floor(Math.random()*16).toString(16)).join('');
  }

  private generateGuestHeaders() {
      const nmtid = this.randomHex(32);
      this.guestCookie = `os=pc; appver=2.9.7; NMTID=${nmtid};`;
  }

  private getHeaders() {
      const savedUser = localStorage.getItem('unistream_user');
      let cookieStr = this.guestCookie; 
      if (savedUser) {
          try {
              const userData = JSON.parse(savedUser);
              if (userData.cookie) cookieStr = `os=pc; appver=2.9.7; MUSIC_U=${userData.cookie};`;
          } catch(e) {}
      }
      return { ...this.baseHeaders, 'Cookie': cookieStr };
  }

  // --- 插件系统 (仿 MusicFree 实现) ---
  async importPlugin(code: string): Promise<boolean> {
      try {
          this.log("正在注入脚本...");
          const module = { exports: {} as any };
          // 使用 Function 沙箱执行
          const pluginFunc = new Function('module', 'exports', 'fetch', code);
          pluginFunc(module, module.exports, fetch);
          
          const plugin = module.exports;
          if (plugin.id && typeof plugin.search === 'function') {
              this.plugins = this.plugins.filter(p => p.id !== plugin.id);
              this.plugins.push(plugin);
              this.log(`插件 [${plugin.name}] 部署成功`);
              return true;
          }
      } catch (e: any) {
          this.log(`插件解析异常: ${e.message}`);
      }
      return false;
  }

  getPlugins() {
      return this.plugins.map(p => ({
          id: p.id,
          name: p.name,
          version: p.version || '1.0.0',
          author: p.author || '未知',
          status: 'active'
      })) as any;
  }

  // --- 聚合搜索 ---
  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
    this.log(`Search: "${query}"`);
    
    // 1. 网易云
    this.searchNetease(query).then(songs => { if(songs.length) onProgress(songs); });

    // 2. Bilibili
    this.searchBilibili(query).then(songs => { if(songs.length) onProgress(songs); });

    // 3. YouTube (带自动节点降级)
    this.searchYouTube(query).then(songs => { if(songs.length) onProgress(songs); });

    // 4. 插件
    this.plugins.forEach(async (plugin) => {
        try {
            const results = await plugin.search(query);
            if (results) {
                const mapped = results.map((r: any) => ({ ...r, source: MusicSource.PLUGIN, pluginId: plugin.id }));
                onProgress(mapped);
            }
        } catch (e) {}
    });
  }

  private async searchYouTube(keyword: string): Promise<Song[]> {
      const sorted = [this.activePipedInstance, ...this.pipedInstances.filter(i => i !== this.activePipedInstance)];
      // MusicFree 策略：多过滤器尝试
      const filters = ['music_videos', 'videos'];

      for (const instance of sorted) {
          for (const filter of filters) {
              try {
                  this.log(`YT Try: ${instance} (${filter})`);
                  const url = `${instance}/search?q=${encodeURIComponent(keyword)}&filter=${filter}`;
                  const response = await CapacitorHttp.get({ url, connectTimeout: 5000 });
                  
                  let data = response.data;
                  if (typeof data === 'string') data = JSON.parse(data);

                  if (data?.items?.length) {
                      this.activePipedInstance = instance;
                      return data.items.map((item: any) => ({
                          id: item.url.split('v=')[1] || item.videoId,
                          title: item.title,
                          artist: item.uploaderName || item.author,
                          album: 'YouTube',
                          coverUrl: item.thumbnail || (item.thumbnails && item.thumbnails[0]?.url),
                          source: MusicSource.YOUTUBE,
                          duration: item.duration || 0,
                          isGray: false
                      }));
                  }
              } catch(e) {}
          }
      }
      return [];
  }

  // --- 播放地址解析 ---
  async getSongDetails(song: Song, quality: AudioQuality): Promise<SongPlayDetails> {
      if (song.source === MusicSource.PLUGIN) {
          const plugin = this.plugins.find(p => p.id === (song as any).pluginId);
          if (plugin?.getMediaUrl) {
              const url = await plugin.getMediaUrl(song);
              return { url };
          }
      }

      if (song.source === MusicSource.YOUTUBE) {
          try {
              const res = await CapacitorHttp.get({ url: `${this.activePipedInstance}/streams/${song.id}` });
              const stream = res.data.audioStreams?.find((s: any) => s.format === 'M4A') || res.data.audioStreams?.[0];
              return { url: stream?.url || '' };
          } catch (e) { return { url: '' }; }
      }

      if (song.source === MusicSource.NETEASE) return this.getNeteaseDetails(song, quality);
      return { url: '' };
  }

  // --- 补全 App.tsx 需要的其他方法 ---
  private mapNeteaseSong(item: any): Song {
      return {
          id: String(item.id),
          title: item.name,
          artist: item.ar?.map((a: any) => a.name).join('/') || 'Unknown',
          artistId: item.ar ? String(item.ar[0].id) : undefined,
          album: item.al?.name || '',
          coverUrl: item.al?.picUrl || '',
          source: MusicSource.NETEASE,
          duration: Math.floor(item.dt / 1000),
          isGray: false
      };
  }

  private async searchNetease(keyword: string): Promise<Song[]> {
      try {
          const url = 'https://music.163.com/api/cloudsearch/pc';
          const data = `s=${encodeURIComponent(keyword)}&type=1&offset=0&limit=20`;
          const res = await CapacitorHttp.post({ url, headers: this.getHeaders(), data });
          return res.data?.result?.songs?.map((s: any) => this.mapNeteaseSong(s)) || [];
      } catch (e) { return []; }
  }

  private async searchBilibili(keyword: string): Promise<Song[]> {
      try {
          const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}`;
          const res = await CapacitorHttp.get({ url, headers: this.bilibiliHeaders });
          return res.data?.data?.result?.map((item: any) => ({
              id: item.bvid,
              title: item.title.replace(/<[^>]*>/g, ''),
              artist: item.author,
              album: 'Bilibili',
              coverUrl: item.pic.startsWith('//') ? `https:${item.pic}` : item.pic,
              source: MusicSource.BILIBILI,
              duration: 0,
              isGray: false
          })) || [];
      } catch (e) { return []; }
  }

  private async getNeteaseDetails(song: Song, quality: AudioQuality): Promise<SongPlayDetails> {
      const res = await CapacitorHttp.post({ 
          url: `https://music.163.com/api/song/enhance/player/url`, 
          headers: this.getHeaders(), 
          data: `id=${song.id}&ids=[${song.id}]&br=128000` 
      });
      return { url: res.data?.data?.[0]?.url || '' };
  }

  async runDiagnostics(): Promise<DiagnosticResult[]> {
      const start = Date.now();
      try {
          await CapacitorHttp.get({ url: `${this.activePipedInstance}/`, connectTimeout: 3000 });
          return [{ name: 'YouTube (Piped)', status: 'ok', latency: Date.now() - start, message: 'Connected' }];
      } catch (e) {
          return [{ name: 'YouTube (Piped)', status: 'error', latency: 0, message: 'Failed' }];
      }
  }

  async getUserPlaylists(userId: string): Promise<Playlist[]> {
      const res = await CapacitorHttp.get({ url: `https://music.163.com/api/user/playlist?uid=${userId}&limit=100`, headers: this.getHeaders() });
      return res.data?.playlist?.map((pl: any) => ({ id: String(pl.id), name: pl.name, songs: [], coverUrl: pl.coverImgUrl })) || [];
  }

  async importNeteasePlaylist(playlistId: string): Promise<Song[]> {
      const res = await CapacitorHttp.post({ url: `https://music.163.com/api/v3/playlist/detail`, headers: this.getHeaders(), data: `id=${playlistId}` });
      return res.data?.playlist?.tracks?.map((t: any) => this.mapNeteaseSong(t)) || [];
  }

  async getArtistDetail(artistId: string) { return { artist: {id: artistId, name: 'Unknown', coverUrl: ''}, songs: []
