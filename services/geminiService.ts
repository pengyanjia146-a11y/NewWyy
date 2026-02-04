
import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult, MusicPlugin, IPlugin, IMusicItem } from "../types";

// --- MusicFree Plugin Dependencies ---
import * as cheerio from 'cheerio';
import CryptoJS from 'crypto-js';
import qs from 'qs';
import bigInt from 'big-integer';
import he from 'he';

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

  // Config stubs for compatibility
  setApiBaseUrl(url: string) { }
  setSearchTimeout(ms: number) { }
  setCustomInvidiousUrl(url: string) { }

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

  // --- Mock Axios (The Bridge) ---
  private createMockAxios() {
      const request = async (config: any) => {
          const method = (config.method || 'GET').toUpperCase();
          const url = config.url;
          let headers = config.headers || {};
          
          // Handle params
          let finalUrl = url;
          if (config.params) {
              const query = qs.stringify(config.params);
              finalUrl += (finalUrl.includes('?') ? '&' : '?') + query;
          }

          // Handle data (body)
          let data = config.data;
          if (data && typeof data === 'object' && headers['Content-Type']?.includes('x-www-form-urlencoded')) {
             data = qs.stringify(data);
          }

          this.log(`[Plugin Req] ${method} ${finalUrl.substring(0, 40)}...`);

          try {
              const response = await CapacitorHttp.request({
                  method: method,
                  url: finalUrl,
                  headers: headers,
                  data: data,
                  connectTimeout: 15000,
              });

              let responseData = response.data;
              const contentType = response.headers['Content-Type'] || response.headers['content-type'] || '';
              
              if (typeof responseData === 'string' && (contentType.includes('json') || responseData.trim().startsWith('{') || responseData.trim().startsWith('['))) {
                  try { responseData = JSON.parse(responseData); } catch(e) {}
              }

              return {
                  data: responseData,
                  status: response.status,
                  statusText: 'OK',
                  headers: response.headers,
                  config: config
              };
          } catch (e: any) {
              this.log(`[Plugin Err] ${e.message}`);
              throw e;
          }
      };

      return {
          get: (url: string, config: any = {}) => request({ ...config, method: 'GET', url }),
          post: (url: string, data: any, config: any = {}) => request({ ...config, method: 'POST', url, data }),
          request: request,
          defaults: { headers: { common: {} } },
          create: () => this.createMockAxios() 
      };
  }

  // --- Plugin Loader (Sandbox) ---
  async importPlugin(code: string): Promise<boolean> {
      try {
          this.log("Initializing plugin sandbox...");
          
          const mockAxios = this.createMockAxios();
          const module = { exports: {} as any };
          
          // Environment Injection
          const env = {
              axios: mockAxios,
              http: mockAxios,
              cheerio: cheerio,
              qs: qs,
              CryptoJS: CryptoJS,
              bigInt: bigInt,
              he: he,
              module: module,
              exports: module.exports,
              console: console, 
              require: (name: string) => {
                  if (name === 'axios') return mockAxios;
                  if (name === 'cheerio') return cheerio;
                  if (name === 'qs') return qs;
                  if (name === 'crypto-js') return CryptoJS;
                  if (name === 'big-integer') return bigInt;
                  if (name === 'he') return he;
                  return {};
              }
          };

          const runPlugin = new Function(
              'axios', 'http', 'cheerio', 'qs', 'CryptoJS', 'bigInt', 'he', 'module', 'exports', 'require', 'console',
              code
          );

          runPlugin(
              env.axios, env.http, env.cheerio, env.qs, env.CryptoJS, env.bigInt, env.he, 
              env.module, env.exports, env.require, env.console
          );

          const plugin = module.exports;
          
          if (!plugin.platform || !plugin.search) {
              throw new Error("Invalid plugin: missing platform or search method");
          }

          const musicPlugin: MusicPlugin = {
              ...plugin,
              status: 'active',
              id: plugin.platform
          };

          this.plugins = this.plugins.filter(p => p.platform !== musicPlugin.platform);
          this.plugins.push(musicPlugin);
          
          this.log(`Plugin Loaded: ${musicPlugin.name || musicPlugin.platform} v${musicPlugin.version}`);
          return true;

      } catch (e: any) {
          this.log(`Plugin Import Error: ${e.message}`);
          console.error(e);
          return false;
      }
  }

  // --- Install Plugin from URL (Updated) ---
  // Returns success status AND the code for persistence
  async installPluginFromUrl(url: string): Promise<{success: boolean; code?: string}> {
      try {
          this.log(`Downloading plugin: ${url}`);
          const res = await CapacitorHttp.get({ url });
          if (res.status === 200 && typeof res.data === 'string') {
              const success = await this.importPlugin(res.data);
              return { success, code: res.data };
          }
          throw new Error(`Failed to download: Status ${res.status}`);
      } catch (e: any) {
          this.log(`Install Error: ${e.message}`);
          return { success: false };
      }
  }

  getPlugins() { return this.plugins; }

  // --- Core: Search Music ---
  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
    this.log(`Search: "${query}"`);
    
    // 1. Netease (Internal)
    this.searchNetease(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    }).catch(e => this.log(`Netease Error: ${e}`));

    // 2. Plugins (Dynamic)
    this.plugins.forEach(async (plugin) => {
        try {
            this.log(`Plugin [${plugin.platform}] searching...`);
            const result = await plugin.search(query, 1, 'music');
            
            let items: IMusicItem[] = [];
            if (Array.isArray(result)) {
                items = result;
            } else if (result && Array.isArray((result as any).data)) {
                items = (result as any).data;
            }

            if (items.length > 0) {
                const songs: Song[] = items.map(item => this.mapPluginItemToSong(item, plugin));
                onProgress(songs);
            }
        } catch(e: any) {
            this.log(`Plugin [${plugin.platform}] failed: ${e.message}`);
        }
    });
  }

  private mapPluginItemToSong(item: IMusicItem, plugin: MusicPlugin): Song {
      let source = MusicSource.PLUGIN;
      const pid = (plugin.platform || '').toLowerCase();
      if (pid.includes('youtube') || pid.includes('yt')) source = MusicSource.YOUTUBE;
      else if (pid.includes('bilibili') || pid.includes('bili')) source = MusicSource.BILIBILI;

      return {
          id: String(item.id),
          title: item.title,
          artist: item.artist,
          album: item.album || plugin.name || 'Unknown',
          coverUrl: item.artwork || item.cover || '',
          source: source,
          duration: item.duration || 0,
          pluginId: plugin.platform,
          pluginData: item, 
          isGray: false
      };
  }

  // --- Playback Logic ---
  async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<SongPlayDetails> {
      if (song.source === MusicSource.NETEASE) {
          return this.getNeteaseDetails(song, quality);
      }

      if (song.pluginId && song.pluginData) {
          const plugin = this.plugins.find(p => p.platform === song.pluginId);
          if (plugin && plugin.getMediaSource) {
              try {
                  const qMap: Record<string, string> = { 
                      'standard': 'standard', 
                      'exhigh': 'high', 
                      'lossless': 'super' 
                  };
                  const targetQ = qMap[quality] || 'standard';
                  
                  const media = await plugin.getMediaSource(song.pluginData, targetQ);
                  
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

  // --- Netease Logic (Legacy) ---
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
      for(const p of this.plugins) {
          const pStart = Date.now();
          try {
              const res = await p.search('test', 1, 'music');
              const valid = Array.isArray(res) || (res && Array.isArray((res as any).data));
              results.push({ 
                  name: `Plugin: ${p.name || p.platform}`, 
                  status: valid ? 'ok' : 'error', 
                  latency: Date.now() - pStart, 
                  message: valid ? 'Search OK' : 'Invalid Response' 
              });
          } catch(e: any) {
              results.push({ name: `Plugin: ${p.name || p.platform}`, status: 'error', latency: Date.now() - pStart, message: e.message });
          }
      }
      if (results.length === 0) {
          results.push({ name: 'System', status: 'pending', latency: 0, message: 'No plugins loaded' });
      }
      return results;
  }

  // --- Stubs ---
  async getMvUrl(song: Song): Promise<string | null> { return null; }
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
  async importNeteasePlaylist(pid: string): Promise<Song[]> { return []; }
  async getArtistDetail(id: string): Promise<{artist: Artist, songs: Song[]}> { 
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
