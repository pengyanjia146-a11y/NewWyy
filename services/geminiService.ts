// 文件路径: services/geminiService.ts
import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult, MusicPlugin } from "../types";

export class ClientSideService {
  private apiBaseUrl = 'http://localhost:3001'; 
  private plugins: MusicPlugin[] = [];
  private logs: string[] = [];

  // --- Configuration ---
  setApiBaseUrl(url: string) {
      this.apiBaseUrl = url.replace(/\/$/, '');
      this.log(`Backend set to: ${this.apiBaseUrl}`);
  }

  setCustomInvidiousUrl(url: string) { /* Deprecated */ }
  setSearchTimeout(ms: number) { /* Handled by backend */ }

  // --- Logger ---
  public log(msg: string) {
      const time = new Date().toLocaleTimeString();
      console.log(`[${time}] ${msg}`);
      this.logs.unshift(`[${time}] ${msg}`);
      if (this.logs.length > 200) this.logs.pop();
  }
  public getLogs() { return this.logs; }
  public clearLogs() { this.logs = []; }

  // --- Core Logic ---

  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
      this.log(`Searching: ${query}`);
      try {
          const response = await CapacitorHttp.get({
              url: `${this.apiBaseUrl}/api/search`,
              params: { q: query }
          });

          if (response.status === 200 && response.data.songs) {
              onProgress(response.data.songs);
          } else {
              this.log(`Search error: ${response.status}`);
          }
      } catch (e: any) {
          this.log(`Search failed: ${e.message}`);
      }
  }

 async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<{url: string, lyric?: string}> {
  try {
      const type = 'audio'; 
      const response = await CapacitorHttp.get({
          url: `${this.apiBaseUrl}/api/url`,
          params: { 
              id: song.id, 
              source: song.source,
              type: type,
              // 如果是网易云，可能需要带上 cookie，这里通常需要从 App 状态传，简化起见假设后端处理
          }
      });

      if (response.status === 200 && response.data.url) {
          return { url: response.data.url };
      }
  } catch (e: any) {
      this.log(`Resolve failed: ${e.message}`);
  }
  return { url: '' };
}

  // --- Login & User ---
  
  async getUserStatus(cookie: string): Promise<any> {
      try {
          const res = await CapacitorHttp.get({
              url: `${this.apiBaseUrl}/api/login/status`,
              params: { cookie }
          });
          return res.data;
      } catch (e) {
          return { code: 500, msg: 'Network Error' };
      }
  }

  // --- [新增] 网易云歌单同步 ---
  async getUserPlaylists(uid: string, cookie?: string): Promise<Playlist[]> {
      try {
          const response = await CapacitorHttp.get({
              url: `${this.apiBaseUrl}/api/user/playlists`,
              params: { uid, cookie: cookie || '' }
          });

          if (response.status === 200 && response.data.playlists) {
              return response.data.playlists.map((p: any) => ({
                  id: p.id,
                  name: p.name,
                  description: p.description,
                  coverUrl: p.coverUrl,
                  isSystem: false,
                  source: 'NETEASE', 
                  songs: [] // 初始为空，懒加载
              }));
          }
      } catch (e: any) {
          this.log(`Get playlists failed: ${e.message}`);
      }
      return [];
  }

  async getPlaylistSongs(id: string, cookie?: string): Promise<Song[]> {
      try {
          const response = await CapacitorHttp.get({
              url: `${this.apiBaseUrl}/api/playlist/detail`,
              params: { id, cookie: cookie || '' }
          });
          if (response.status === 200 && response.data.songs) {
              return response.data.songs;
          }
      } catch (e: any) {
          this.log(`Get playlist detail failed: ${e.message}`);
      }
      return [];
  }

  // --- QR Code Login ---
  async getQrKey(): Promise<any> {
      try { const res = await CapacitorHttp.get({ url: `${this.apiBaseUrl}/api/login/qr/key` }); return res.data; } catch (e) { return null; }
  }
  async createQr(key: string): Promise<any> {
      try { const res = await CapacitorHttp.get({ url: `${this.apiBaseUrl}/api/login/qr/create`, params: { key } }); return res.data; } catch (e) { return null; }
  }
  async checkQr(key: string): Promise<any> {
      try { const res = await CapacitorHttp.get({ url: `${this.apiBaseUrl}/api/login/qr/check`, params: { key } }); return res.data; } catch (e) { return null; }
  }

  // --- Plugin System ---
  async importPlugin(code: string): Promise<boolean> {
      try {
          const bridgeFetch = async (url: string, options: any = {}) => {
              const res = await CapacitorHttp.request({
                  url,
                  method: options.method || 'GET',
                  headers: options.headers,
                  data: options.body
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

  getPlugins() { return this.plugins; }

  // --- Diagnostics ---
  async runDiagnostics(): Promise<DiagnosticResult[]> {
      const start = Date.now();
      try {
          const res = await CapacitorHttp.get({ url: `${this.apiBaseUrl}/api/search?q=test` });
          return [{ 
              name: 'Local Backend', 
              status: res.status === 200 ? 'ok' : 'error', 
              latency: Date.now() - start, 
              message: `URL: ${this.apiBaseUrl}` 
          }];
      } catch(e: any) {
          return [{ name: 'Local Backend', status: 'error', latency: 0, message: e.message }];
      }
  }

  // --- Stubs ---
  async importNeteasePlaylist(id: string): Promise<Song[]> { return []; }
  async getDailyRecommendSongs(): Promise<Song[]> { return []; }
  async getArtistDetail(id: string): Promise<any> { return { artist: {id, name: 'Unknown'}, songs: [] }; }
  async getMvUrl(song: Song) { return null; }
}

export const musicService = new ClientSideService();
