import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult, MusicPlugin, Comment } from "../types";

export class ClientSideService {
  private apiBaseUrl = 'http://localhost:3001'; // Default, can be changed in settings
  private plugins: MusicPlugin[] = [];
  private logs: string[] = [];

  // --- Configuration ---
  setApiBaseUrl(url: string) {
      // Remove trailing slash
      this.apiBaseUrl = url.replace(/\/$/, '');
      this.log(`Backend set to: ${this.apiBaseUrl}`);
  }

  setCustomInvidiousUrl(url: string) { /* Deprecated in favor of local backend */ }
  setSearchTimeout(ms: number) { /* Handled by backend mostly */ }

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
      this.log(`Resolving: ${song.title} [${song.source}]`);
      
      // Plugin handling
      if (song.source === MusicSource.PLUGIN && song.pluginId) {
          const plugin = this.plugins.find(p => p.id === song.pluginId);
          if (plugin && plugin.getMediaUrl) {
              const res = await plugin.getMediaUrl(song);
              return { url: typeof res === 'string' ? res : res.url };
          }
      }

      // Backend handling (YouTube, Netease, Bilibili)
      try {
          const response = await CapacitorHttp.get({
              url: `${this.apiBaseUrl}/api/url`,
              params: { 
                  id: song.id, 
                  source: song.source 
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

  // --- Plugin System (Kept as is) ---
  async importPlugin(code: string): Promise<boolean> {
      // ... (Existing plugin logic)
      return false; // Placeholder
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

  // --- Stubs for other methods ---
  async getUserPlaylists(uid: string): Promise<Playlist[]> { return []; }
  async importNeteasePlaylist(id: string): Promise<Song[]> { return []; }
  async getDailyRecommendSongs(): Promise<Song[]> { return []; }
  async getArtistDetail(id: string): Promise<any> { return { artist: {name: 'Unknown'}, songs: [] }; }
  async getMvUrl(song: Song) { return null; }
}

export const musicService = new ClientSideService();
