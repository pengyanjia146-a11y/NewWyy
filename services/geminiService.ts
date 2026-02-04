
import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult } from "../types";

// Polyfill-like helper for Promise.any
function customPromiseAny<T>(promises: Promise<T>[]): Promise<T> {
    return new Promise((resolve, reject) => {
        let errors: any[] = [];
        let pending = promises.length;
        if (pending === 0) return reject(new Error("No promises"));

        promises.forEach(p => {
            Promise.resolve(p).then(resolve).catch(e => {
                errors.push(e);
                pending--;
                if (pending === 0) reject(new Error("All promises rejected"));
            });
        });
    });
}

interface SongPlayDetails {
    url: string;
    lyric?: string;
    coverUrl?: string; 
    isMv?: boolean;
}

export class ClientSideService {
  // 1. 网易云 Headers
  private neteaseHeaders = {
    'Referer': 'https://music.163.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '115.239.211.112', 
    'X-Forwarded-For': '115.239.211.112'
  };
  
  // 2. Bilibili Headers
  private bilibiliHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/'
  };

  // 3. YouTube 播放专用头 (严格伪装)
  private youtubePlaybackHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://www.youtube.com/',
    'Accept': '*/*',
    'Sec-Fetch-Mode': 'navigate' 
  };

  // 4. YouTube API 搜索专用头 (轻量伪装，避免 API 网关拦截)
  private youtubeSearchHeaders = {
     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
     'Accept': 'application/json'
  };

  // 5. Piped 节点池 (主要用于播放，偶尔用于搜索)
  private pipedInstances = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.video",
    "https://pipedapi.drg.li",
    "https://piped-api.lunar.icu",
    "https://ytapi.dc09.ru",
    "https://piped-api.garudalinux.org"
  ];

  // 6. Invidious 节点池 (搜索能力更强，作为强力补充)
  private invidiousInstances = [
      "https://inv.tux.pizza",
      "https://invidious.drg.li",
      "https://vid.puffyan.us",
      "https://invidious.fdn.fr",
      "https://inv.zzls.xyz",
      "https://yt.artemislena.eu"
  ];

  private activePipedInstance = "https://pipedapi.kavin.rocks"; 
  private plugins: any[] = [];
  private guestCookie = '';
  private apiBaseUrl = ''; 
  private logs: string[] = [];
  
  constructor() {
    this.generateGuestHeaders();
  }

  // --- Logger ---
  public log(msg: string) {
      const time = new Date().toLocaleTimeString();
      const entry = `[${time}] ${msg}`;
      this.logs.unshift(entry);
      if (this.logs.length > 100) this.logs.pop();
      console.log(entry);
  }
  public getLogs() { return this.logs; }
  public clearLogs() { this.logs = []; }

  // --- Config ---
  setApiBaseUrl(url: string) { this.apiBaseUrl = url.replace(/\/$/, ''); }
  setSearchTimeout(ms: number) { /* No-op */ }
  setCustomInvidiousUrl(url: string) { 
      if(url) this.invidiousInstances.unshift(url); 
  }

  private randomHex(length: number) {
      let result = '';
      const characters = '0123456789abcdef';
      for (let i = 0; i < length; i++) {
          result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      return result;
  }

  private generateGuestHeaders() {
      const nmtid = this.randomHex(32);
      const deviceId = this.randomHex(16);
      this.guestCookie = `os=pc; appver=2.9.7; NMTID=${nmtid}; DeviceId=${deviceId};`;
  }

  private getNeteaseHeaders() {
      const savedUser = localStorage.getItem('unistream_user');
      let cookieStr = this.guestCookie; 
      if (savedUser) {
          try {
              const userData = JSON.parse(savedUser);
              if (userData.cookie && userData.cookie.length > 5) {
                  let targetCookie = userData.cookie;
                  if (targetCookie.includes('MUSIC_U=')) {
                       if (!targetCookie.includes('os=pc')) cookieStr = `os=pc; appver=2.9.7; ${targetCookie}`;
                       else cookieStr = targetCookie; 
                  } else {
                       cookieStr = `os=pc; appver=2.9.7; MUSIC_U=${targetCookie};`;
                  }
              }
          } catch(e) {}
      }
      return { ...this.neteaseHeaders, 'Cookie': cookieStr };
  }

  private timeoutPromise<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
      return new Promise((resolve) => {
          const timer = setTimeout(() => {
              resolve(fallbackValue);
          }, ms);
          promise
              .then((res) => { clearTimeout(timer); resolve(res); })
              .catch(() => { clearTimeout(timer); resolve(fallbackValue); });
      });
  }

  // --- Search Logic ---
  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
    this.log(`Searching: "${query}"`);
    
    // 1. Netease
    const taskNetease = this.timeoutPromise(this.searchNetease(query), 5000, [])
        .then(songs => { if(songs.length) onProgress(songs); });

    // 2. Bilibili
    const taskBilibili = this.timeoutPromise(this.searchBilibili(query), 6000, [])
        .then(songs => { if(songs.length) onProgress(songs); });

    // 3. YouTube Hybrid Race (Piped + Invidious)
    const taskYoutube = this.searchYouTubeHybrid(query)
        .then(songs => { if(songs.length) onProgress(songs); })
        .catch(() => { this.log("YouTube Search All Failed"); });

    // 4. Plugins
    const taskPlugins = this.plugins.map(p => 
        this.timeoutPromise(this.searchPlugin(p, query), 8000, [])
            .then(songs => { if(songs.length) onProgress(songs); })
    );

    await Promise.allSettled([taskNetease, taskBilibili, taskYoutube, ...taskPlugins]);
  }

  // --- Hybrid Search Engine (Piped + Invidious) ---
  
  private async searchYouTubeHybrid(keyword: string): Promise<Song[]> {
      const tasks: Promise<Song[]>[] = [];

      // Pick top 3 Piped Instances
      this.pipedInstances.slice(0, 3).forEach(inst => {
          tasks.push(this.fetchFromPiped(inst, keyword));
      });

      // Pick top 3 Invidious Instances
      this.invidiousInstances.slice(0, 3).forEach(inst => {
          tasks.push(this.fetchFromInvidious(inst, keyword));
      });

      try {
          const result = await customPromiseAny(tasks);
          this.log(`Search success via one of the nodes`);
          return result;
      } catch (e) {
          this.log(`Hybrid search completely failed.`);
          return [];
      }
  }

  // Method 1: Piped Search
  private async fetchFromPiped(instance: string, keyword: string): Promise<Song[]> {
      const url = `${instance}/search?q=${encodeURIComponent(keyword)}&filter=music_videos`;
      try {
          const response = await CapacitorHttp.get({ 
              url, 
              connectTimeout: 6000,
              headers: this.youtubeSearchHeaders
          });

          let data = response.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }

          if (data && data.items && Array.isArray(data.items) && data.items.length > 0) {
              this.activePipedInstance = instance; // Mark as healthy
              this.log(`Piped Winner: ${instance}`);
              return data.items.map((item: any) => ({
                  id: item.url.split('/watch?v=')[1],
                  title: item.title,
                  artist: item.uploaderName,
                  album: 'YouTube',
                  coverUrl: item.thumbnail,
                  source: MusicSource.YOUTUBE,
                  duration: item.duration,
                  isGray: false
              }));
          }
          throw new Error("Empty Piped");
      } catch(e: any) {
          throw e; 
      }
  }

  // Method 2: Invidious Search (Fallback)
  private async fetchFromInvidious(instance: string, keyword: string): Promise<Song[]> {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(keyword)}&type=video&sort_by=relevance`;
      try {
          const response = await CapacitorHttp.get({
              url,
              connectTimeout: 6000,
              headers: this.youtubeSearchHeaders
          });
          
          let data = response.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }

          if (Array.isArray(data) && data.length > 0) {
              this.log(`Invidious Winner: ${instance}`);
              return data.map((item: any) => ({
                  id: item.videoId,
                  title: item.title,
                  artist: item.author,
                  album: 'YouTube',
                  coverUrl: item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
                  source: MusicSource.YOUTUBE,
                  duration: item.lengthSeconds,
                  isGray: false
              }));
          }
          throw new Error("Empty Invidious");
      } catch (e: any) {
          throw e;
      }
  }

  // --- Netease & Bilibili Logic ---
  
  private mapNeteaseSong(item: any): Song {
      return {
          id: String(item.id),
          title: item.name,
          artist: item.ar ? item.ar.map((a: any) => a.name).join('/') : (item.artists ? item.artists.map((a: any) => a.name).join('/') : 'Unknown'),
          artistId: item.ar ? String(item.ar[0].id) : (item.artists ? String(item.artists[0].id) : undefined),
          album: item.al ? item.al.name : (item.album ? item.album.name : ''),
          coverUrl: item.al?.picUrl ? item.al.picUrl.replace(/^http:/, 'https:') : (item.album?.picUrl ? item.album.picUrl.replace(/^http:/, 'https:') : ''),
          source: MusicSource.NETEASE,
          duration: Math.floor(item.dt / 1000),
          isGray: false,
          fee: item.fee,
          mvId: item.mv ? String(item.mv) : undefined
      };
  }

  private async searchNetease(keyword: string): Promise<Song[]> {
      try {
          const url = 'https://music.163.com/api/cloudsearch/pc';
          const data = `s=${encodeURIComponent(keyword)}&type=1&offset=0&limit=20&total=true`;
          const response = await CapacitorHttp.post({ url, headers: this.getNeteaseHeaders(), data, connectTimeout: 4000 });
          let resData = response.data;
          if (typeof resData === 'string') { try { resData = JSON.parse(resData); } catch(e) {} }
          if (resData?.result?.songs) {
              return resData.result.songs.map((item: any) => this.mapNeteaseSong(item));
          }
      } catch (e) {}
      return [];
  }

  private async searchBilibili(keyword: string): Promise<Song[]> {
      if (this.apiBaseUrl) {
          try {
              const url = `${this.apiBaseUrl}/api/search/bilibili?q=${encodeURIComponent(keyword)}`;
              const response = await CapacitorHttp.get({ url, connectTimeout: 4000 });
              let data = response.data;
              if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
              if (data && Array.isArray(data.songs)) return data.songs;
          } catch(e) { }
      }
      try {
          const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}`;
          const response = await CapacitorHttp.get({ url, headers: this.bilibiliHeaders, connectTimeout: 4000 });
          if (response.status === 200 && response.data?.data?.result) {
              return response.data.data.result.map((item: any) => ({
                  id: item.bvid,
                  title: item.title.replace(/<[^>]*>/g, ''),
                  artist: item.author,
                  album: 'Bilibili',
                  coverUrl: item.pic.startsWith('//') ? `https:${item.pic}` : item.pic,
                  source: MusicSource.BILIBILI,
                  duration: this.parseBiliDuration(item.duration),
                  isGray: false,
                  mvId: item.bvid 
              }));
          }
      } catch (e) {}
      return [];
  }

  private parseBiliDuration(durationStr: string): number {
      if (!durationStr) return 0;
      const parts = durationStr.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return 0;
  }

  // --- Plugin Logic ---

  private async searchPlugin(plugin: any, query: string): Promise<Song[]> {
      try {
          if (plugin.search) {
              // Support both async and sync
              const results = await plugin.search(query);
              if (Array.isArray(results)) {
                  return results.map((r: any) => ({ 
                      ...r, 
                      source: MusicSource.PLUGIN, 
                      pluginId: plugin.id, 
                      isGray: false 
                  }));
              }
          }
      } catch (e) {
          this.log(`Plugin ${plugin.name} search error: ${e}`);
      }
      return [];
  }

  async importPlugin(code: string): Promise<boolean> {
      try {
          // Emulate a CommonJS environment for MusicFree-style plugins
          const wrapper = new Function('module', 'exports', 'require', `
              ${code};
              return module.exports;
          `);
          
          const module = { exports: {} };
          const exports = module.exports;
          const require = () => { throw new Error("Require is not supported in browser environment"); };
          
          const pluginInstance = wrapper(module, exports, require);
          
          // Validate plugin structure
          if (!pluginInstance) throw new Error("No export found");
          
          // Normalize structure
          const plugin = {
              id: pluginInstance.id || pluginInstance.platform || `plugin_${Date.now()}`,
              name: pluginInstance.name || pluginInstance.platform || 'Unknown Plugin',
              version: pluginInstance.version || '0.0.1',
              author: pluginInstance.author || 'Unknown',
              source: 'PLUGIN',
              search: pluginInstance.search, // The critical function
              getMediaUrl: pluginInstance.getMediaUrl || pluginInstance.play, // Some use play, some getMediaUrl
              originalCode: code
          };
          
          if (!plugin.search) throw new Error("Plugin missing search function");

          // Remove existing if same ID
          this.plugins = this.plugins.filter(p => p.id !== plugin.id);
          this.plugins.push(plugin);
          
          this.log(`Plugin Loaded: ${plugin.name} v${plugin.version}`);
          return true;
      } catch (e) {
          console.error("Plugin Import Error:", e);
          this.log(`Plugin Error: ${e}`);
          return false;
      }
  }

  async installPluginFromUrl(url: string): Promise<boolean> {
      try {
          const res = await CapacitorHttp.get({ url });
          if (res.data) {
              // Handle string or object data
              const code = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
              return await this.importPlugin(code);
          }
      } catch(e) {
          this.log(`Install URL failed: ${e}`);
      }
      return false;
  }
  
  getPlugins() { return this.plugins; }

  // --- Audio Proxy (Local Blob) ---
  private async getProxiedAudioUrl(url: string, referer: string): Promise<string> {
      try {
          this.log(`Proxy: ${url.substring(0, 20)}...`);
          
          const res = await CapacitorHttp.get({
              url: url,
              responseType: 'blob', 
              headers: this.youtubePlaybackHeaders,
              connectTimeout: 20000,
              readTimeout: 20000
          });

          if (res.status === 200 && res.data) {
             const base64 = res.data;
             const mime = res.headers['content-type'] || 'audio/mp4';
             const binary = atob(base64);
             const array = new Uint8Array(binary.length);
             for(let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
             const blob = new Blob([array], { type: mime });
             const blobUrl = URL.createObjectURL(blob);
             this.log(`Proxy OK: ${(blob.size/1024/1024).toFixed(2)}MB`);
             return blobUrl;
          } else {
              throw new Error(`Status ${res.status}`);
          }
      } catch (e: any) {
          this.log(`Proxy Fail: ${e.message}`);
      }
      return url; 
  }

  async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<SongPlayDetails> {
      // --- YOUTUBE PLAYBACK ---
      if (song.source === MusicSource.YOUTUBE) {
          let instance = this.activePipedInstance;
          let streamData = await this.fetchPipedStreams(instance, song.id);
          
          if (!streamData) {
              this.log("Piped retry...");
              const backup = this.pipedInstances[Math.floor(Math.random() * this.pipedInstances.length)];
              streamData = await this.fetchPipedStreams(backup, song.id);
              if (streamData) instance = backup;
          }

          if (streamData && streamData.audioStreams) {
              this.activePipedInstance = instance;
              
              const streams = streamData.audioStreams;
              const preferredStream = 
                  streams.find((s: any) => s.mimeType === 'audio/mp4' && s.quality === 'highest') ||
                  streams.find((s: any) => s.mimeType === 'audio/mp4') ||
                  streams.sort((a: any, b: any) => b.bitrate - a.bitrate)[0];

              if (preferredStream) {
                  let finalUrl = preferredStream.url;
                  if (finalUrl.includes('googlevideo.com')) {
                      finalUrl = await this.getProxiedAudioUrl(finalUrl, 'https://www.youtube.com/');
                  }
                  return { url: finalUrl };
              }
          }
          return { url: '' };
      }
      
      // 2. Bilibili
      if (song.source === MusicSource.BILIBILI) {
          let url = '';
          if (this.apiBaseUrl) {
              try {
                  const res = await CapacitorHttp.get({ url: `${this.apiBaseUrl}/api/url?id=${song.id}&source=BILIBILI`, connectTimeout: 5000 });
                  if (res.status === 200 && res.data?.url) url = res.data.url;
              } catch(e) {}
          }
          if (!url) url = await this.getBilibiliUrl(song.id);
          
          if (url) {
              const proxied = await this.getProxiedAudioUrl(url, 'https://www.bilibili.com/');
              return { url: proxied };
          }
          return { url: '' };
      }

      // 3. Fallbacks
      if (song.source === MusicSource.NETEASE) return this.getNeteaseDetails(song, quality);
      else if (song.source === MusicSource.PLUGIN && (song as any).pluginId) {
          // Plugin Details Fetch
          const plugin = this.plugins.find(p => p.id === (song as any).pluginId);
          if (plugin && plugin.getMediaUrl) { 
              try {
                  const result = await plugin.getMediaUrl(song);
                  // Support returning string or object
                  const url = typeof result === 'string' ? result : result.url;
                  const lyric = typeof result === 'object' ? result.lyric : undefined;
                  return { url, lyric };
              } catch(e) {
                  this.log(`Plugin media error: ${e}`);
              }
          }
      } else if (song.source === MusicSource.LOCAL && song.audioUrl) { return { url: song.audioUrl }; }
      return { url: '' };
  }

  private async fetchPipedStreams(instance: string, id: string): Promise<any> {
      try {
          const res = await CapacitorHttp.get({ 
              url: `${instance}/streams/${id}`, 
              connectTimeout: 5000,
              headers: this.youtubePlaybackHeaders
          });
          let data = res.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
          return data;
      } catch(e) {
          return null;
      }
  }

  // --- Netease Details ---
  private async getNeteaseDetails(song: Song, quality: AudioQuality): Promise<SongPlayDetails> {
      try {
           let br = 128000; let level = 'standard';
           if (quality === 'exhigh') { br = 320000; level = 'exhigh'; }
           if (quality === 'lossless') { br = 999000; level = 'lossless'; }
           const response = await CapacitorHttp.post({ 
               url: `https://music.163.com/api/song/enhance/player/url`, 
               headers: this.getNeteaseHeaders(), 
               data: `id=${song.id}&ids=[${song.id}]&br=${br}&level=${level}`, 
               connectTimeout: 5000 
           });
           let resData = response.data;
           if (typeof resData === 'string') { try { resData = JSON.parse(resData); } catch(e) {} }
           const songData = resData?.data?.[0];
           if (response.status === 200 && songData) {
               if (!songData.url || songData.code !== 200 || songData.freeTrialInfo) throw new Error("VIP_REQUIRED");
               
               let lyric = '';
               try {
                   const lr = await CapacitorHttp.get({ url: `https://music.163.com/api/song/lyric?id=${song.id}&lv=1&kv=1&tv=-1`, headers: this.getNeteaseHeaders() });
                   let ld = lr.data;
                   if (typeof ld === 'string') try { ld = JSON.parse(ld); } catch(e){}
                   lyric = ld?.lrc?.lyric || '';
               } catch(e){}
               return { url: songData.url.replace(/^http:/, 'https:'), lyric };
           }
      } catch (e: any) { if (e.message === "VIP_REQUIRED") throw e; }
      return { url: '' };
  }

  private async getBilibiliUrl(bvid: string): Promise<string> {
      try {
          const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
          const viewRes = await CapacitorHttp.get({ url: viewUrl, headers: this.bilibiliHeaders });
          const cid = viewRes.data?.data?.cid;
          if (!cid) return '';
          const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=1&platform=html5&high_quality=1`;
          const playRes = await CapacitorHttp.get({ url: playUrl, headers: this.bilibiliHeaders });
          if (playRes.data?.data?.durl && playRes.data.data.durl.length > 0) return playRes.data.data.durl[0].url;
      } catch(e) {}
      return '';
  }
  
  async getMvUrl(song: Song): Promise<string | null> {
     if (song.source === MusicSource.BILIBILI) return this.getBilibiliUrl(song.id);
     return null; 
  }

  // --- Helpers ---
  async runDiagnostics(): Promise<DiagnosticResult[]> { 
      const results: DiagnosticResult[] = [];
      const start = Date.now();
      try {
          // Check Invidious connectivity
          const candidates = this.invidiousInstances.slice(0, 3);
          const promises = candidates.map(url => CapacitorHttp.get({ url: `${url}/api/v1/stats`, connectTimeout: 3000 }).then(() => url));
          const winner = await customPromiseAny(promises);
          
          results.push({ name: 'YouTube (Hybrid)', status: 'ok', latency: Date.now() - start, message: `Active: ${winner}` });
      } catch(e) {
          results.push({ name: 'YouTube (Hybrid)', status: 'error', latency: 0, message: 'Connection Failed' });
      }
      return results;
  } 

  async getUserPlaylists(userId: string): Promise<Playlist[]> { 
      try {
          const url = `https://music.163.com/api/user/playlist?uid=${userId}&limit=100`;
          const response = await CapacitorHttp.get({ url, headers: this.getNeteaseHeaders() });
          let data = response.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
          if (data && data.code === 200 && data.playlist) {
              return data.playlist.map((pl: any) => ({
                  id: String(pl.id), name: pl.name, description: pl.description,
                  coverUrl: pl.coverImgUrl ? pl.coverImgUrl.replace(/^http:/, 'https:') : '',
                  songs: [], isSystem: false
              }));
          }
      } catch (e) {}
      return [];
  }
  async getArtistDetail(artistId: string): Promise<{artist: Artist, songs: Song[]}> { return { artist: {id: artistId, name: 'Unknown', coverUrl: ''}, songs: [] }; }
  async importNeteasePlaylist(playlistId: string): Promise<Song[]> { 
      try {
          const url = `https://music.163.com/api/v3/playlist/detail`;
          const response = await CapacitorHttp.post({ url, headers: this.getNeteaseHeaders(), data: `id=${playlistId}&n=1000` });
          let data = response.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
          if (data && data.playlist && data.playlist.tracks) {
               return data.playlist.tracks.map((item: any) => this.mapNeteaseSong(item));
          }
      } catch(e) {}
      return [];
  }
  async getDailyRecommendSongs(): Promise<Song[]> { return []; }
  async getUserStatus(cookieInput: string): Promise<any> { 
      try {
          let finalCookie = cookieInput.trim();
          const musicUMatch = cookieInput.match(/MUSIC_U=([0-9a-zA-Z]+)/);
          if (musicUMatch) finalCookie = musicUMatch[1]; 
          else if (cookieInput.length > 50 && !cookieInput.includes('=')) finalCookie = cookieInput;
          const testHeader = `os=pc; appver=2.9.7; MUSIC_U=${finalCookie};`;
          const response = await CapacitorHttp.post({
              url: 'https://music.163.com/api/w/nuser/account/get',
              headers: { ...this.neteaseHeaders, 'Cookie': testHeader },
              connectTimeout: 8000
          });
          let resData = response.data;
          if (typeof resData === 'string') { try { resData = JSON.parse(resData); } catch(e) {} }
          if (resData && resData.code === 200) { resData._cleanedCookie = finalCookie; }
          return resData;
      } catch(e) { return { code: 500 }; }
  }
}

export const musicService = new ClientSideService();
