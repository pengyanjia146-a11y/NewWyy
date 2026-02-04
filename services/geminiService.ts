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
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '115.239.211.112', 
    'X-Forwarded-For': '115.239.211.112'
  };
  
  private youtubeHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://www.youtube.com/',
    'Origin': 'https://www.youtube.com',
    'Sec-Fetch-Dest': 'audio',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site'
  };

  private pipedInstances = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.video",
    "https://pipedapi.drg.li",
    "https://piped-api.lunar.icu"
  ];

  private activePipedInstance = this.pipedInstances[0];
  private plugins: any[] = [];
  private logs: string[] = [];
  private apiBaseUrl = ''; 
  
  constructor() {}

  public log(msg: string) {
      const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
      this.logs.unshift(entry);
      console.log(entry);
  }

  public getLogs() { return this.logs; }
  public clearLogs() { this.logs = []; }
  setApiBaseUrl(url: string) { this.apiBaseUrl = url.replace(/\/$/, ''); }

  // --- 插件系统核心：仿 MusicFree 实现 ---
  async importPlugin(code: string): Promise<boolean> {
      try {
          this.log("正在解析插件脚本...");
          const module = { exports: {} as any };
          // 使用 Function 构造器动态执行插件 JS 代码
          const pluginFunc = new Function('module', 'exports', code);
          pluginFunc(module, module.exports);
          
          const plugin = module.exports;
          if (plugin.id && plugin.search) {
              this.plugins = this.plugins.filter(p => p.id !== plugin.id);
              this.plugins.push(plugin);
              this.log(`插件 [${plugin.name}] 导入成功`);
              return true;
          }
          return false;
      } catch (e: any) {
          this.log(`插件解析失败: ${e.message}`);
          return false;
      }
  }

  getPlugins() { return this.plugins; }

  // --- 增强版搜索逻辑 ---
  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
    this.log(`开始搜索: "${query}"`);
    
    // 1. 网易云搜索 (内置)
    this.searchNetease(query).then(songs => { if(songs.length) onProgress(songs); });

    // 2. YouTube 搜索 (内置优化版)
    this.searchYouTube(query).then(songs => { if(songs.length) onProgress(songs); });

    // 3. 插件搜索 (动态加载)
    this.plugins.forEach(async (plugin) => {
        try {
            const results = await plugin.search(query);
            if (results && results.length) {
                const pluginSongs = results.map((s: any) => ({
                    ...s,
                    source: MusicSource.PLUGIN,
                    pluginId: plugin.id
                }));
                onProgress(pluginSongs);
            }
        } catch (e) { this.log(`插件 ${plugin.name} 搜索失败`); }
    });
  }

  private async searchYouTube(keyword: string): Promise<Song[]> {
      const filters = ['music_videos', 'videos'];
      for (const filter of filters) {
          try {
              const url = `${this.activePipedInstance}/search?q=${encodeURIComponent(keyword)}&filter=${filter}`;
              const res = await CapacitorHttp.get({ url, connectTimeout: 5000 });
              let data = res.data;
              if (typeof data === 'string') data = JSON.parse(data);

              if (data?.items?.length) {
                  return data.items.map((item: any) => ({
                      id: item.url?.split('v=')[1] || item.videoId,
                      title: item.title,
                      artist: item.uploaderName || item.author,
                      album: 'YouTube',
                      coverUrl: item.thumbnail || item.thumbnails?.[0]?.url,
                      source: MusicSource.YOUTUBE,
                      duration: item.duration || 0,
                      isGray: false
                  }));
              }
          } catch (e) {}
      }
      return [];
  }

  // --- 其他必要方法 (略) ---
  private async searchNetease(keyword: string): Promise<Song[]> {
      // 保持你原有的网易云搜索逻辑
      return []; 
  }

  async getSongDetails(song: Song, quality: AudioQuality): Promise<SongPlayDetails> {
      // 如果是插件歌曲，调用插件的 getMediaUrl
      if (song.source === MusicSource.PLUGIN) {
          const plugin = this.plugins.find(p => p.id === (song as any).pluginId);
          if (plugin && plugin.getMediaUrl) {
              const url = await plugin.getMediaUrl(song);
              return { url };
          }
      }
      // 原有 YouTube/网易云 解析逻辑...
      return { url: '' };
  }
}

export const musicService = new ClientSideService();
