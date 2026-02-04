
import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult, MusicPlugin } from "../types";

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
  // 1. Headers & Config
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

  private pipedInstances = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.video",
    "https://pipedapi.drg.li",
    "https://piped-api.lunar.icu",
    "https://ytapi.dc09.ru"
  ];

  private activePipedInstance = "https://pipedapi.kavin.rocks"; 
  private plugins: MusicPlugin[] = [];
  private guestCookie = 'os=pc; appver=2.9.7;';
  private apiBaseUrl = ''; 
  private logs: string[] = [];
  private searchTimeout = 15000;
  
  constructor() {
    this.generateGuestHeaders();
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

  // --- Private Helpers ---
  private generateGuestHeaders() {
      // Simple random ID generation for guest access
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

  // --- Core: Search Music ---
  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
    this.log(`Search Request: "${query}"`);
    
    // 1. Netease
    this.searchNetease(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    }).catch(e => this.log(`Netease failed: ${e}`));

    // 2. Bilibili
    this.searchBilibili(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    }).catch(e => this.log(`Bilibili failed: ${e}`));

    // 3. YouTube (Robust)
    this.searchYouTubeRobust(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    }).catch(e => this.log(`YouTube Robust failed: ${e}`));

    // 4. Plugins
    this.plugins.forEach(async (plugin) => {
        try {
            if (typeof plugin.search === 'function') {
                this.log(`Plugin [${plugin.name}] searching...`);
                const results = await this.timeoutPromise(plugin.search(query, 1, 'music'), 10000, []);
                if (Array.isArray(results) && results.length > 0) {
                    const mapped = results.map(r => this.mapPluginSong(r, plugin));
                    this.log(`Plugin [${plugin.name}] found ${mapped.length}`);
                    onProgress(mapped);
                } else {
                    this.log(`Plugin [${plugin.name}] returned 0 results`);
                }
            }
        } catch(e: any) {
            this.log(`Plugin [${plugin.name}] error: ${e.message}`);
        }
    });
  }

  // --- YouTube Robust Search Logic ---
  private async searchYouTubeRobust(query: string): Promise<Song[]> {
      const filters = ['music_videos', 'videos', 'all']; // Fallback strategy
      
      // Phase 1: Try active instance with fallbacks
      for (const filter of filters) {
          try {
              const songs = await this.fetchPiped(this.activePipedInstance, query, filter);
              if (songs.length > 0) {
                  this.log(`YT Success: ${this.activePipedInstance} (${filter})`);
                  return songs;
              }
          } catch(e: any) {
              this.log(`YT Attempt Failed (${this.activePipedInstance}, ${filter}): ${e.message}`);
          }
      }

      // Phase 2: Rotate Instances if active failed
      for (const instance of this.pipedInstances) {
          if (instance === this.activePipedInstance) continue;
          
          for (const filter of filters) {
              try {
                  this.log(`YT Rotating to ${instance} (${filter})...`);
                  const songs = await this.fetchPiped(instance, query, filter);
                  if (songs.length > 0) {
                      this.activePipedInstance = instance; // Update healthy node
                      this.log(`YT Node Recovered: ${instance}`);
                      return songs;
                  }
              } catch(e: any) {
                  this.log(`YT Node Failed (${instance}): ${e.message}`);
              }
          }
      }
      
      return [];
  }

  private async fetchPiped(instance: string, query: string, filter: string): Promise<Song[]> {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=${filter}`;
      const response = await CapacitorHttp.get({ 
          url, 
          connectTimeout: 5000,
          headers: { 'Accept': 'application/json' }
      });

      if (response.status !== 200) throw new Error(`Status ${response.status}`);
      
      let data = response.data;
      if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch(e) { throw new Error("JSON Parse Error"); }
      }

      const items = data.items || data; // Piped API variation
      if (!Array.isArray(items)) throw new Error("Invalid response format: Not an array");

      return items.map((item: any) => ({
          id: item.url ? item.url.split('/watch?v=')[1] : item.id,
          title: item.title,
          artist: item.uploaderName || item.author?.name || 'Unknown',
          album: 'YouTube',
          coverUrl: item.thumbnail || item.thumbnails?.[0]?.url || '',
          source: MusicSource.YOUTUBE,
          duration: item.duration || 0,
          isGray: false
      })).filter((s: any) => s.id && !s.isGray);
  }

  // --- Netease Logic ---
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

  // --- Plugin System (Sandbox) ---
  async importPlugin(code: string): Promise<boolean> {
      try {
          this.log("Initializing plugin sandbox...");
          
          // Sandbox Bridge
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

          const sandbox = {
              module: { exports: {} },
              fetch: bridgeFetch,
              console: console
          };

          // Execute
          const run = new Function('module', 'exports', 'fetch', 'console', code);
          run(sandbox.module, sandbox.module.exports, sandbox.fetch, sandbox.console);

          const plugin = sandbox.module.exports as any;
          if (!plugin.platform && !plugin.id) throw new Error("Missing 'platform' or 'id'");
          if (typeof plugin.search !== 'function') throw new Error("Missing 'search' function");

          const normalized: MusicPlugin = {
              id: plugin.platform || plugin.id,
              name: plugin.name || plugin.platform || 'Unknown',
              version: plugin.version || '0.0.1',
              author: plugin.author || 'Unknown',
              sources: [plugin.platform || 'plugin'],
              status: 'active',
              search: plugin.search,
              getMediaUrl: plugin.getMediaUrl || plugin.play
          };

          this.plugins = this.plugins.filter(p => p.id !== normalized.id);
          this.plugins.push(normalized);
          this.log(`Plugin Loaded: ${normalized.name} v${normalized.version}`);
          return true;
      } catch(e: any) {
          this.log(`Plugin Import Error: ${e.message}`);
          return false;
      }
  }

  async installPluginFromUrl(url: string): Promise<boolean> {
      try {
          const res = await CapacitorHttp.get({ url });
          const code = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
          return await this.importPlugin(code);
      } catch(e) {
          return false;
      }
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

  // --- Song Details ---
  async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<SongPlayDetails> {
      // 1. Plugin
      if (song.source === MusicSource.PLUGIN && song.pluginId) {
          const plugin = this.plugins.find(p => p.id === song.pluginId);
          if (plugin && plugin.getMediaUrl) {
              try {
                  const res = await plugin.getMediaUrl(song);
                  return { 
                      url: typeof res === 'string' ? res : res.url,
                      lyric: typeof res === 'object' ? res.lyric : undefined
                  };
              } catch(e) { this.log(`Plugin media failed: ${e}`); }
          }
      }

      // 2. YouTube (Piped)
      if (song.source === MusicSource.YOUTUBE) {
          try {
              const url = `${this.activePipedInstance}/streams/${song.id}`;
              const res = await CapacitorHttp.get({ url });
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
              // Prefer audio/mp4, fallback to others
              const audio = data.audioStreams?.find((s: any) => !s.videoOnly && s.mimeType?.includes('mp4')) 
                         || data.audioStreams?.[0];
              return { url: audio?.url || '' };
          } catch(e) { this.log(`YT Stream failed: ${e}`); }
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

  async getMvUrl(song: Song): Promise<string | null> {
      return null;
  }

  // --- Diagnostics ---
  async runDiagnostics(): Promise<DiagnosticResult[]> {
      const results: DiagnosticResult[] = [];
      const start = Date.now();
      
      // Test Piped
      try {
          // Actual search test
          await this.fetchPiped(this.activePipedInstance, "test", "music_videos");
          results.push({ 
              name: 'YouTube (Piped)', 
              status: 'ok', 
              latency: Date.now() - start, 
              message: `Active: ${this.activePipedInstance}` 
          });
      } catch(e: any) {
          results.push({ 
              name: 'YouTube (Piped)', 
              status: 'error', 
              latency: Date.now() - start, 
              message: e.message 
          });
      }

      return results;
  }

  // --- Missing App Requirements ---
  async getUserPlaylists(userId: string): Promise<Playlist[]> {
      try {
          const res = await CapacitorHttp.get({
              url: `https://music.163.com/api/user/playlist?uid=${userId}&limit=30`,
              headers: this.getNeteaseHeaders()
          });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (data.playlist) {
              return data.playlist.map((p: any) => ({
                  id: String(p.id),
                  name: p.name,
                  description: p.description,
                  coverUrl: p.coverImgUrl,
                  songs: [],
                  isSystem: false
              }));
          }
      } catch(e) {}
      return [];
  }

  async importNeteasePlaylist(playlistId: string): Promise<Song[]> {
      try {
          const res = await CapacitorHttp.get({
              url: `https://music.163.com/api/playlist/detail?id=${playlistId}`,
              headers: this.getNeteaseHeaders()
          });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (data.result?.tracks) {
              return data.result.tracks.map((t: any) => this.mapNeteaseSong(t));
          }
      } catch(e) {}
      return [];
  }

  async getArtistDetail(artistId: string): Promise<{artist: Artist, songs: Song[]}> {
      try {
          const res = await CapacitorHttp.get({
              url: `https://music.163.com/api/artist/songs?id=${artistId}&limit=50&offset=0`,
              headers: this.getNeteaseHeaders()
          });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          // Note: Real implementation would need artist info call too, keeping it simple
          return {
              artist: { id: artistId, name: 'Artist', coverUrl: '' },
              songs: data.songs ? data.songs.map((t: any) => this.mapNeteaseSong(t)) : []
          };
      } catch(e) {}
      return { artist: {id: artistId, name:'Unknown', coverUrl:''}, songs: [] };
  }

  async getDailyRecommendSongs(): Promise<Song[]> {
      // Need login cookie
      return [];
  }

  async getUserStatus(cookieInput: string): Promise<any> {
      let final = cookieInput.trim();
      if (!final.includes('MUSIC_U=') && final.length > 20) final = `MUSIC_U=${final};`;
      try {
          const res = await CapacitorHttp.post({
              url: 'https://music.163.com/api/w/nuser/account/get',
              headers: { ...this.neteaseHeaders, 'Cookie': `os=pc; ${final}` }
          });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          data._cleanedCookie = final;
          return data;
      } catch(e) { return { code: 500 }; }
  }
}

export const musicService = new ClientSideService();
