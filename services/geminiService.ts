
import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult } from "../types";

interface SongPlayDetails {
    url: string;
    lyric?: string;
    coverUrl?: string; 
    isMv?: boolean;
}

export class ClientSideService {
  // 1. 基础请求头 - 模拟 PC 浏览器访问网易云
  private baseHeaders = {
    'Referer': 'https://music.163.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '115.239.211.112', 
    'X-Forwarded-For': '115.239.211.112'
  };
  
  // 2. Bilibili 伪装头
  private bilibiliHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/'
  };

  // 3. YouTube 深度伪装头 - 模拟真实 Chrome 浏览器的媒体请求
  // 关键：Sec-Fetch-* 头能极大降低被判定为机器人的概率
  private youtubeHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://www.youtube.com/',
    'Origin': 'https://www.youtube.com',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'audio',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache'
  };

  // 4. 高可用公共 Piped 镜像池 (持续更新)
  private pipedInstances = [
    "https://pipedapi.kavin.rocks",     // 官方主节点，稳定但较慢
    "https://api.piped.video",          // 备用主节点
    "https://pipedapi.drg.li",          // 欧洲节点，速度快
    "https://piped-api.lunar.icu",      // 亚洲优化
    "https://api.piped.yt",
    "https://ytapi.dc09.ru",
    "https://pipedapi.system41.cl",
    "https://piped-api.garudalinux.org"
  ];

  private activePipedInstance = this.pipedInstances[0]; // 记住当前好用的节点

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
  setCustomInvidiousUrl(url: string) { /* No-op */ }

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

  private getHeaders() {
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
      return { ...this.baseHeaders, 'Cookie': cookieStr };
  }

  // --- Timeout Wrapper ---
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

  // --- Streaming Search ---
  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
    this.log(`Search Start: "${query}"`);
    
    // 1. Netease (Fast)
    const taskNetease = this.timeoutPromise(this.searchNetease(query), 5000, [])
        .then(songs => { if(songs.length) onProgress(songs); });

    // 2. Bilibili (Medium)
    const taskBilibili = this.timeoutPromise(this.searchBilibili(query), 6000, [])
        .then(songs => { if(songs.length) onProgress(songs); });

    // 3. YouTube (Slow - Needs Rotation)
    // Give it more time (15s) because it might fail on 2-3 nodes before finding a working one
    const taskYoutube = this.timeoutPromise(this.searchYouTube(query), 15000, [])
        .then(songs => { if(songs.length) onProgress(songs); });

    // 4. Plugins
    const taskPlugins = this.plugins.map(p => 
        this.timeoutPromise(this.searchPlugin(p, query), 8000, [])
            .then(songs => { if(songs.length) onProgress(songs); })
    );

    await Promise.allSettled([taskNetease, taskBilibili, taskYoutube, ...taskPlugins]);
    this.log("Search Complete.");
  }

  // --- Search Implementations ---

  private async searchYouTube(keyword: string): Promise<Song[]> {
      // 智能排序：优先使用上次成功的节点，其次是其他节点
      const sortedInstances = [
          this.activePipedInstance,
          ...this.pipedInstances.filter(i => i !== this.activePipedInstance)
      ];

      for (const instance of sortedInstances) {
          try {
              this.log(`YT Try: ${instance}`);
              const url = `${instance}/search?q=${encodeURIComponent(keyword)}&filter=music_videos`;
              
              // 使用 CapacitorHttp 发送原生请求，绕过浏览器 CORS 限制
              const response = await CapacitorHttp.get({ 
                  url, 
                  connectTimeout: 5000,
                  headers: {
                      'User-Agent': this.youtubeHeaders['User-Agent'] // 简单的 UA 即可用于 API 搜索
                  }
              });

              let data = response.data;
              if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }

              if (data && data.items && Array.isArray(data.items)) {
                  this.activePipedInstance = instance; // 标记该节点为“健康”
                  this.log(`YT Success: ${instance}`);
                  
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
          } catch(e: any) {
              // 当前节点失败，静默继续下一个
          }
      }
      this.log(`YT All Failed`);
      return [];
  }

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
          const response = await CapacitorHttp.post({ url, headers: this.getHeaders(), data, connectTimeout: 4000 });
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

  private async searchPlugin(plugin: any, query: string): Promise<Song[]> {
      try {
          if (plugin.search) {
              const results = await plugin.search(query);
              return results.map((r: any) => ({ ...r, source: MusicSource.PLUGIN, pluginId: plugin.id, isGray: false }));
          }
      } catch (e) {}
      return [];
  }

  // --- 本地音频代理 (核心黑科技) ---
  // 原理：直接播放 googlevideo.com 链接会被 403。
  // 我们使用 CapacitorHttp (Native HTTP) 下载音频数据块，并在本地生成 Blob URL。
  // 这样对于 Google 来说，这就是一个正常的浏览器下载请求。
  private async getProxiedAudioUrl(url: string, referer: string): Promise<string> {
      try {
          this.log(`Proxying: ${url.substring(0, 25)}...`);
          
          const res = await CapacitorHttp.get({
              url: url,
              responseType: 'blob', // 关键：告诉 Native 层返回二进制数据
              headers: this.youtubeHeaders // 注入完整的 Chrome 伪装头
          });

          if (res.data) {
             const base64 = res.data;
             const mime = res.headers['content-type'] || 'audio/mp4';
             
             // Base64 -> Uint8Array -> Blob
             const binary = atob(base64);
             const array = new Uint8Array(binary.length);
             for(let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
             const blob = new Blob([array], { type: mime });
             
             // 生成本地内存地址 (blob:http://localhost/...)
             const blobUrl = URL.createObjectURL(blob);
             this.log(`Proxy OK: ${blobUrl.substring(0, 20)}...`);
             return blobUrl;
          }
      } catch (e: any) {
          this.log(`Proxy Fail: ${e.message || e}`);
      }
      return url; // 如果代理失败，尝试返回原链接（死马当活马医）
  }

  async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<SongPlayDetails> {
      // --- YOUTUBE 本地解析逻辑 ---
      if (song.source === MusicSource.YOUTUBE) {
          const sortedInstances = [
              this.activePipedInstance,
              ...this.pipedInstances.filter(i => i !== this.activePipedInstance)
          ];

          for (const instance of sortedInstances) {
               try {
                   this.log(`Resolving: ${instance}`);
                   const res = await CapacitorHttp.get({ 
                       url: `${instance}/streams/${song.id}`, 
                       connectTimeout: 6000, // 稍微放宽超时
                       headers: {
                           'User-Agent': this.youtubeHeaders['User-Agent']
                       }
                   });
                   
                   let data = res.data;
                   if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
                   
                   if (data && data.audioStreams && data.audioStreams.length > 0) {
                       this.activePipedInstance = instance;
                       
                       // 优先选择 m4a (兼容性最好)，其次是高质量流
                       const streams = data.audioStreams;
                       const preferredStream = 
                           streams.find((s: any) => s.mimeType === 'audio/mp4' && s.quality === 'highest') ||
                           streams.find((s: any) => s.mimeType === 'audio/mp4') ||
                           streams.sort((a: any, b: any) => b.bitrate - a.bitrate)[0];

                       if (preferredStream) {
                           let finalUrl = preferredStream.url;
                           
                           // 核心逻辑：检测是否为 Google 视频源
                           // 如果是，必须走本地代理下载，否则会被 403
                           if (finalUrl.includes('googlevideo.com')) {
                               finalUrl = await this.getProxiedAudioUrl(finalUrl, 'https://www.youtube.com/');
                           }
                           
                           return { url: finalUrl };
                       }
                   }
               } catch(e) {
                   // 当前节点解析失败，自动尝试下一个
               }
          }
          return { url: '' };
      }
      
      // 2. Bilibili (With Proxy)
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
              // Always proxy Bilibili to handle Referer
              const proxied = await this.getProxiedAudioUrl(url, 'https://www.bilibili.com/');
              return { url: proxied };
          }
          return { url: '' };
      }

      // 3. Fallbacks / Netease
      if (song.source === MusicSource.NETEASE) return this.getNeteaseDetails(song, quality);
      else if (song.source === MusicSource.PLUGIN && (song as any).pluginId) {
          const plugin = this.plugins.find(p => p.id === (song as any).pluginId);
          if (plugin && plugin.getMediaUrl) { const url = await plugin.getMediaUrl(song); return { url }; }
      } else if (song.source === MusicSource.LOCAL && song.audioUrl) { return { url: song.audioUrl }; }
      return { url: '' };
  }

  // Netease details
  private async getNeteaseDetails(song: Song, quality: AudioQuality): Promise<SongPlayDetails> {
      try {
           let br = 128000; let level = 'standard';
           if (quality === 'exhigh') { br = 320000; level = 'exhigh'; }
           if (quality === 'lossless') { br = 999000; level = 'lossless'; }
           const response = await CapacitorHttp.post({ 
               url: `https://music.163.com/api/song/enhance/player/url`, 
               headers: this.getHeaders(), 
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
                   const lr = await CapacitorHttp.get({ url: `https://music.163.com/api/song/lyric?id=${song.id}&lv=1&kv=1&tv=-1`, headers: this.getHeaders() });
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
      const pipedStart = Date.now();
      try {
          const res = await CapacitorHttp.get({ url: `${this.activePipedInstance}/`, connectTimeout: 3000 });
          if (res.status === 200) {
              results.push({ name: 'YouTube (Piped)', status: 'ok', latency: Date.now() - pipedStart, message: this.activePipedInstance });
          } else throw new Error();
      } catch(e) {
          results.push({ name: 'YouTube (Piped)', status: 'error', latency: 0, message: 'Failed' });
      }
      return results;
  } 

  async getUserPlaylists(userId: string): Promise<Playlist[]> { 
      try {
          const url = `https://music.163.com/api/user/playlist?uid=${userId}&limit=100`;
          const response = await CapacitorHttp.get({ url, headers: this.getHeaders() });
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
          const response = await CapacitorHttp.post({ url, headers: this.getHeaders(), data: `id=${playlistId}&n=1000` });
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
              headers: { ...this.baseHeaders, 'Cookie': testHeader },
              connectTimeout: 8000
          });
          let resData = response.data;
          if (typeof resData === 'string') { try { resData = JSON.parse(resData); } catch(e) {} }
          if (resData && resData.code === 200) { resData._cleanedCookie = finalCookie; }
          return resData;
      } catch(e) { return { code: 500 }; }
  }
  async installPluginFromUrl(url: string): Promise<boolean> { return false; }
  async importPlugin(code: string): Promise<boolean> { return false; }
  getPlugins() { return this.plugins; }
}

export const musicService = new ClientSideService();
