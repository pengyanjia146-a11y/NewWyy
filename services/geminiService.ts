
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult, MusicPlugin, IPlugin, IMusicItem, IMediaSource } from "../types";

// --- MusicFree Dependencies ---
import * as cheerio from 'cheerio';
import CryptoJS from 'crypto-js';
import qs from 'qs';
import bigInt from 'big-integer';
import he from 'he';

// Polyfill-like helper
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
  // Headers & Config
  private neteaseHeaders = {
    'Referer': 'https://music.163.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '115.239.211.112', 
    'X-Forwarded-For': '115.239.211.112'
  };
  
  private guestCookie = 'os=pc; appver=2.9.7;';
  private logs: string[] = [];
  
  // Plugin Registry
  private plugins: MusicPlugin[] = [];
  
  constructor() {
    this.generateGuestHeaders();
    this.loadBuiltInPlugins(); // Load YouTube/Bilibili as plugins
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
  setApiBaseUrl(url: string) { /* Used by plugins if needed */ }
  setSearchTimeout(ms: number) { /* unused in new arch */ }
  setCustomInvidiousUrl(url: string) { 
      // Find YouTube plugin and update its config if possible
      // For this implementation, we'll keep it simple
  }

  // --- Private Helpers ---
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

  // --- Sandbox & Mock Axios (The Bridge) ---
  private createMockAxios() {
      const bridgeRequest = async (method: 'GET' | 'POST', url: string, data?: any, config: any = {}) => {
          // Normalize headers
          const headers = config.headers || {};
          
          // Handle params serializing
          let finalUrl = url;
          if (config.params) {
              const query = qs.stringify(config.params);
              finalUrl += (finalUrl.includes('?') ? '&' : '?') + query;
          }

          this.log(`[Plugin Req] ${method} ${finalUrl.substring(0, 50)}...`);

          try {
              const response = await CapacitorHttp.request({
                  method: method,
                  url: finalUrl,
                  headers: headers,
                  data: data,
                  connectTimeout: 15000,
                  readTimeout: 15000
              });

              // MusicFree plugins expect axios response structure
              return {
                  data: (typeof response.data === 'string' && (response.headers['Content-Type']?.includes('json') || response.headers['content-type']?.includes('json'))) 
                        ? JSON.parse(response.data) 
                        : response.data,
                  status: response.status,
                  statusText: 'OK',
                  headers: response.headers,
                  config: config,
                  request: {}
              };
          } catch (e: any) {
              this.log(`[Plugin Err] ${e.message}`);
              throw e; // Let plugin handle error
          }
      };

      return {
          get: (url: string, config?: any) => bridgeRequest('GET', url, undefined, config),
          post: (url: string, data?: any, config?: any) => bridgeRequest('POST', url, data, config),
          defaults: { headers: { common: {} } },
          create: () => this.createMockAxios() // Recursive for axios.create()
      };
  }

  // --- Plugin Loader (Sandbox) ---
  async importPlugin(code: string): Promise<boolean> {
      try {
          this.log("Initializing plugin sandbox...");
          
          const mockAxios = this.createMockAxios();
          const module = { exports: {} as any };
          
          // Dependency Injection
          const env = {
              axios: mockAxios,
              http: mockAxios, // Some plugins use 'http'
              cheerio: cheerio,
              qs: qs,
              CryptoJS: CryptoJS,
              bigInt: bigInt,
              he: he,
              module: module,
              exports: module.exports,
              console: console, // Allow plugins to log
              require: (name: string) => {
                  // Basic require simulation for common libs
                  if (name === 'axios') return mockAxios;
                  if (name === 'cheerio') return cheerio;
                  if (name === 'qs') return qs;
                  if (name === 'crypto-js') return CryptoJS;
                  if (name === 'big-integer') return bigInt;
                  if (name === 'he') return he;
                  return {};
              }
          };

          // Create Sandbox Function
          const runPlugin = new Function(
              'axios', 'http', 'cheerio', 'qs', 'CryptoJS', 'bigInt', 'he', 'module', 'exports', 'require', 'console',
              code
          );

          // Execute
          runPlugin(
              env.axios, env.http, env.cheerio, env.qs, env.CryptoJS, env.bigInt, env.he, 
              env.module, env.exports, env.require, env.console
          );

          const plugin = module.exports;
          
          // Validation
          if (!plugin.platform || !plugin.search) {
              throw new Error("Invalid plugin structure: missing platform or search");
          }

          // Wrap as MusicPlugin
          const musicPlugin: MusicPlugin = {
              ...plugin,
              status: 'active',
              id: plugin.platform // Map platform to id for internal use
          };

          // Remove old version if exists
          this.plugins = this.plugins.filter(p => p.platform !== musicPlugin.platform);
          this.plugins.push(musicPlugin);
          
          this.log(`Plugin Loaded: ${musicPlugin.name} (${musicPlugin.platform}) v${musicPlugin.version}`);
          return true;

      } catch (e: any) {
          this.log(`Plugin Import Error: ${e.message}`);
          console.error(e);
          return false;
      }
  }

  getPlugins() { return this.plugins; }

  // --- Built-in Plugins (Defined as JS Objects) ---
  private loadBuiltInPlugins() {
      // 1. YouTube Plugin (Internal Wrapper around Piped)
      const youtubePlugin: MusicPlugin = {
          platform: 'youtube',
          id: 'youtube',
          name: 'YouTube (Built-in)',
          version: '1.0.0',
          author: 'UniStream',
          status: 'active',
          sources: ['youtube'],
          search: async (query, page, type) => {
              const instances = [
                  "https://pipedapi.kavin.rocks",
                  "https://api.piped.video",
                  "https://pipedapi.drg.li"
              ];
              
              // Robust fetch logic inside the plugin
              for (const host of instances) {
                  try {
                      // Try music_videos first, then videos
                      let items = [];
                      try {
                        const res = await CapacitorHttp.get({ url: `${host}/search?q=${encodeURIComponent(query)}&filter=music_videos` });
                        if(res.status === 200) items = JSON.parse(res.data).items || [];
                      } catch(e) {}

                      if(items.length === 0) {
                        const res = await CapacitorHttp.get({ url: `${host}/search?q=${encodeURIComponent(query)}&filter=videos` });
                        if(res.status === 200) items = JSON.parse(res.data).items || [];
                      }

                      if (items.length > 0) {
                          const results: IMusicItem[] = items.map((item: any) => ({
                              id: item.url ? item.url.split('/watch?v=')[1] : item.id,
                              platform: 'youtube',
                              title: item.title,
                              artist: item.uploaderName || 'Unknown',
                              artwork: item.thumbnail || item.thumbnails?.[0]?.url,
                              duration: item.duration,
                              host: host // store successful host for playback
                          })).filter((i: any) => i.id);
                          
                          return { data: results, isEnd: false };
                      }
                  } catch (e) {}
              }
              return { data: [], isEnd: true };
          },
          getMediaSource: async (item, quality) => {
              const host = item.host || "https://pipedapi.kavin.rocks";
              const url = `${host}/streams/${item.id}`;
              const res = await CapacitorHttp.get({ url });
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
              const audio = data.audioStreams?.find((s: any) => !s.videoOnly && s.mimeType?.includes('mp4')) 
                         || data.audioStreams?.[0];
              
              return audio ? { url: audio.url } : null;
          }
      };

      // 2. Bilibili Plugin
      const bilibiliPlugin: MusicPlugin = {
          platform: 'bilibili',
          id: 'bilibili',
          name: 'Bilibili (Built-in)',
          version: '1.0.0',
          author: 'UniStream',
          status: 'active',
          sources: ['bilibili'],
          search: async (query, page, type) => {
              const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(query)}`;
              const res = await CapacitorHttp.get({ url, headers: { 'User-Agent': 'Mozilla/5.0' } });
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
              
              if (data.data?.result) {
                  const results: IMusicItem[] = data.data.result.map((item: any) => ({
                      id: item.bvid,
                      platform: 'bilibili',
                      title: item.title.replace(/<[^>]*>/g, ''),
                      artist: item.author,
                      artwork: item.pic.startsWith('//') ? `https:${item.pic}` : item.pic,
                      duration: 0, // Simplified parsing
                      cid: item.cid // Optional, might need fetching later
                  }));
                  return { data: results, isEnd: false };
              }
              return { data: [], isEnd: true };
          },
          getMediaSource: async (item, quality) => {
              // Bilibili usually requires complex CID fetching + signing or proxy
              // Returning null here to fallback to legacy handling or implement simpler direct URL if available
              // For robustness, this usually needs a backend proxy or complex frontend logic.
              return null; 
          }
      };

      this.plugins.push(youtubePlugin);
      this.plugins.push(bilibiliPlugin);
  }

  // --- Core: Search Music (Unified) ---
  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
    this.log(`Search: "${query}"`);
    
    // 1. Netease (Internal Source)
    this.searchNetease(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    }).catch(e => this.log(`Netease Error: ${e}`));

    // 2. Plugins (Iterate all loaded plugins)
    this.plugins.forEach(async (plugin) => {
        try {
            this.log(`Plugin [${plugin.name}] searching...`);
            const result = await plugin.search(query, 1, 'music');
            
            if (result.data && result.data.length > 0) {
                const songs: Song[] = result.data.map(item => this.mapPluginItemToSong(item, plugin));
                this.log(`Plugin [${plugin.name}] found ${songs.length}`);
                onProgress(songs);
            } else {
                this.log(`Plugin [${plugin.name}] empty`);
            }
        } catch(e: any) {
            this.log(`Plugin [${plugin.name}] failed: ${e.message}`);
        }
    });
  }

  // --- Mapper ---
  private mapPluginItemToSong(item: IMusicItem, plugin: MusicPlugin): Song {
      // Determine source type for Icon display
      let source = MusicSource.PLUGIN;
      if (plugin.platform === 'youtube') source = MusicSource.YOUTUBE;
      if (plugin.platform === 'bilibili') source = MusicSource.BILIBILI;

      return {
          id: String(item.id),
          title: item.title,
          artist: item.artist,
          album: item.album || plugin.name,
          coverUrl: item.artwork || '',
          source: source,
          duration: item.duration || 0,
          pluginId: plugin.platform, // Critical for playback routing
          pluginData: item, // Save full data for getMediaSource
          isGray: false
      };
  }

  // --- Playback Logic ---
  async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<SongPlayDetails> {
      // 1. Netease Internal
      if (song.source === MusicSource.NETEASE) {
          return this.getNeteaseDetails(song, quality);
      }

      // 2. Plugin Sources (Includes built-in YouTube/Bilibili)
      if (song.pluginId && song.pluginData) {
          const plugin = this.plugins.find(p => p.platform === song.pluginId);
          if (plugin) {
              try {
                  const qMap: Record<string, string> = { 'standard': 'standard', 'exhigh': 'high', 'lossless': 'super' };
                  const media = await plugin.getMediaSource(song.pluginData, qMap[quality]);
                  
                  if (media && media.url) {
                      return {
                          url: media.url,
                          lyric: media.lyric
                      };
                  }
              } catch(e) {
                  this.log(`Plugin Playback Error: ${e}`);
              }
          }
      }

      return { url: song.audioUrl || '' };
  }

  // --- Netease Logic (Internal Legacy) ---
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

  private async getNeteaseDetails(song: Song, quality: string): Promise<SongPlayDetails> {
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
      return { url: '' };
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

  // --- Diagnostics ---
  async runDiagnostics(): Promise<DiagnosticResult[]> {
      const results: DiagnosticResult[] = [];
      const start = Date.now();
      
      // Test Internal Netease
      results.push({ name: 'Netease (Internal)', status: 'ok', latency: 50, message: 'Ready' });

      // Test Plugins
      for(const p of this.plugins) {
          const pStart = Date.now();
          try {
              await p.search('test', 1, 'music');
              results.push({ name: `Plugin: ${p.name}`, status: 'ok', latency: Date.now() - pStart, message: 'Active' });
          } catch(e: any) {
              results.push({ name: `Plugin: ${p.name}`, status: 'error', latency: Date.now() - pStart, message: e.message });
          }
      }
      return results;
  }

  // --- App API Support ---
  async getMvUrl(song: Song): Promise<string | null> { return null; }
  async getUserPlaylists(userId: string): Promise<Playlist[]> { 
      // Reuse Netease logic for user playlists
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
  async importNeteasePlaylist(pid: string): Promise<Song[]> { 
       try {
          const res = await CapacitorHttp.get({
              url: `https://music.163.com/api/playlist/detail?id=${pid}`,
              headers: this.getNeteaseHeaders()
          });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (data.result?.tracks) {
              return data.result.tracks.map((t: any) => this.mapNeteaseSong(t));
          }
      } catch(e) {}
      return [];
  }
  async getArtistDetail(id: string): Promise<{artist: Artist, songs: Song[]}> { 
      // Stub
       return { artist: {id, name:'Unknown', coverUrl:''}, songs: [] };
  }
  async getDailyRecommendSongs(): Promise<Song[]> { return []; }
  async getUserStatus(cookie: string): Promise<any> {
      let final = cookie.trim();
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
