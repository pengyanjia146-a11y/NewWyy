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
  // ... Plugin 逻辑保持不变 ...

  try {
      // 增加 type 参数
      // 如果你希望在某些情况下播放视频，可以根据 song 的属性传参
      // 这里默认 'audio' 保证 NewPipe 风格的后台播放稳定性
      const type = 'audio'; 

      const response = await CapacitorHttp.get({
          url: `${this.apiBaseUrl}/api/url`,
          params: { 
              id: song.id, 
              source: song.source,
              type: type 
          }
      });

      if (response.status === 200 && response.data.url) {
          // 此时返回的是 http://192.168.x.x:3001/api/proxy?url=...
          // 这个地址任何设备都能播放，不会有跨域问题
          return { url: response.data.url };
      }
  } catch (e: any) {
      this.log(`Resolve failed: ${e.message}`);
  }
  return { url: '' };
}

  // --- Login & User (Fixed) ---
  
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

  async getQrKey(): Promise<any> {
      try {
          const res = await CapacitorHttp.get({ url: `${this.apiBaseUrl}/api/login/qr/key` });
          return res.data;
      } catch (e) { return null; }
  }

  async createQr(key: string): Promise<any> {
      try {
          const res = await CapacitorHttp.get({ 
              url: `${this.apiBaseUrl}/api/login/qr/create`,
              params: { key }
          });
          return res.data;
      } catch (e) { return null; }
  }

  async checkQr(key: string): Promise<any> {
      try {
          const res = await CapacitorHttp.get({ 
              url: `${this.apiBaseUrl}/api/login/qr/check`,
              params: { key }
          });
          return res.data;
      } catch (e) { return null; }
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
  async getUserPlaylists(uid: string): Promise<Playlist[]> { return []; }
  async importNeteasePlaylist(id: string): Promise<Song[]> { return []; }
  async getDailyRecommendSongs(): Promise<Song[]> { return []; }
  async getArtistDetail(id: string): Promise<any> { return { artist: {id, name: 'Unknown'}, songs: [] }; }
  async getMvUrl(song: Song) { return null; }
}

export const musicService = new ClientSideService();
