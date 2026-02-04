
import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult } from "../types";

interface SongPlayDetails {
    url: string;
    lyric?: string;
    coverUrl?: string; 
    isMv?: boolean;
}

export class ClientSideService {
  private baseHeaders = {
    'Referer': 'https://music.163.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '115.239.211.112', 
    'X-Forwarded-For': '115.239.211.112'
  };
  
  private bilibiliHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/'
  };

  // Browser Simulation Headers for YouTube
  private youtubeHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.youtube.com/',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  // High availability Piped instances list (Public Mirrors)
  private pipedInstances = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.video",
    "https://pipedapi.drg.li", 
    "https://piped-api.lunar.icu",
    "https://api.piped.yt",
    "https://ytapi.dc09.ru",
    "https://pipedapi.system41.cl"
  ];

  private activePipedInstance = this.pipedInstances[0]; // Cache the working instance

  private plugins: any[] = [];
  private guestCookie = '';
  private apiBaseUrl = ''; // Optional backend
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
    this.log(`Streaming Search: "${query}"`);
    
    // 1. Netease (5s Timeout)
    const taskNetease = this.timeoutPromise(this.searchNetease(query), 5000, [])
        .then(songs => { if(songs.length) onProgress(songs); });

    // 2. Bilibili (Fallback Direct, 5s Timeout)
    const taskBilibili = this.timeoutPromise(this.searchBilibili(query), 5000, [])
        .then(songs => { if(songs.length) onProgress(songs); });

    // 3. YouTube (Standalone Piped, 12s Timeout to allow rotation)
    const taskYoutube = this.timeoutPromise(this.searchYouTube(query), 12000, [])
        .then(songs => { if(songs.length) onProgress(songs); });

    // 4. Plugins (8s Timeout)
    const taskPlugins = this.plugins.map(p => 
        this.timeoutPromise(this.searchPlugin(p, query), 8000, [])
            .then(songs => { if(songs.length) onProgress(songs); })
    );

    await Promise.allSettled([taskNetease, taskBilibili, taskYoutube, ...taskPlugins]);
    this.log("All search tasks finished.");
  }

  // --- Search Implementations ---

  private async searchYouTube(keyword: string): Promise<Song[]> {
      // Re-order instances to prioritize the active one
      const sortedInstances = [
          this.activePipedInstance,
          ...this.pipedInstances.filter(i => i !== this.activePipedInstance)
      ];

      for (const instance of sortedInstances) {
          try {
              this.log(`Piped Search: ${instance}`);
              const url = `${instance}/search?q=${encodeURIComponent(keyword)}&filter=music_videos`;
              
              const response = await CapacitorHttp.get({ 
                  url, 
                  connectTimeout: 5000,
                  headers: this.youtubeHeaders
              });

              let data = response.data;
              if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }

              if (data && data.items && Array.isArray(data.items)) {
                  this.activePipedInstance = instance; // Mark as reliable
                  
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
              this.log(`Piped error: ${e.message || e}`);
              // Continue to next instance
          }
      }
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

  // --- Audio Proxy (Local Browser Simulation) ---
  // Downloads the stream chunk by chunk (handled by native OS) and creates a local Blob URL.
  // This bypasses 403 Forbidden because the request comes from the "browser" (Capacitor) 
  // with correct headers, not from an Audio element which is restricted.
  private async getProxiedAudioUrl(url: string, referer: string): Promise<string> {
      try {
          this.log(`Proxying audio: ${url.substring(0, 30)}...`);
          const res = await CapacitorHttp.get({
              url: url,
              responseType: 'blob',
              headers: { 
                  'Referer': referer,
                  'User-Agent': this.youtubeHeaders['User-Agent']
              }
          });
          if (res.data) {
             const base64 = res.data;
             const mime = res.headers['content-type'] || 'audio/mp4';
             const binary = atob(base64);
             const array = new Uint8Array(binary.length);
             for(let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
             const blob = new Blob([array], { type: mime });
             const blobUrl = URL.createObjectURL(blob);
             this.log(`Proxy success: ${blobUrl}`);
             return blobUrl;
          }
      } catch (e) {
          this.log(`Proxy failed: ${e}`);
      }
      return url; // Fallback to original URL
  }

  async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<SongPlayDetails> {
      // --- YOUTUBE STANDALONE (Browser Simulation) ---
      if (song.source === MusicSource.YOUTUBE) {
          const sortedInstances = [
              this.activePipedInstance,
              ...this.pipedInstances.filter(i => i !== this.activePipedInstance)
          ];

          for (const instance of sortedInstances) {
               try {
                   this.log(`Resolving YT: ${instance}`);
                   const res = await CapacitorHttp.get({ 
                       url: `${instance}/streams/${song.id}`, 
                       connectTimeout: 5000,
                       headers: this.youtubeHeaders
                   });
                   
                   let data = res.data;
                   if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }
                   
                   if (data && data.audioStreams && data.audioStreams.length > 0) {
                       this.activePipedInstance = instance;
                       
                       // Select Best Audio
                       const streams = data.audioStreams;
                       const preferredStream = 
                           streams.find((s: any) => s.mimeType === 'audio/mp4' && s.quality === 'highest') ||
                           streams.find((s: any) => s.mimeType === 'audio/mp4') ||
                           streams.sort((a: any, b: any) => b.bitrate - a.bitrate)[0];

                       if (preferredStream) {
                           let finalUrl = preferredStream.url;
                           
                           // CRITICAL: If URL is direct googlevideo.com, Proxy it locally to simulate browser headers.
                           // Otherwise the HTML5 Audio tag will fail with 403.
                           if (finalUrl.includes('googlevideo.com')) {
                               finalUrl = await this.getProxiedAudioUrl(finalUrl, 'https://www.youtube.com/');
                           }
                           
                           return { url: finalUrl };
                       }
                   }
               } catch(e) {
                   // Try next instance
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
              results.push({ name: 'YouTube (Piped)', status: 'ok', latency: Date.now() - pipedStart, message: 'Connected' });
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
