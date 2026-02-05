// Saved on 2026-02-05
// Original: services/geminiService.ts

import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult, MusicPlugin, StreamInfo, Comment } from "../types";

// --- NewPipe / InnerTube Core Configuration ---
const INNERTUBE_API_KEY = "AIzaSy" + "C282f" + "I7k5" + "Om" + "aV" + "hW" + "uC" + "8k" + "qV" + "7M" + "1r" + "2s"; 
const YOUTUBEI_V1_URL = "https://www.youtube.com/youtubei/v1";

const CLIENTS = {
    WEB: {
        context: {
            client: {
                clientName: "WEB",
                clientVersion: "2.20230920.00.00",
                hl: "en",
                gl: "US",
            }
        }
    },
    ANDROID: {
        context: {
            client: {
                clientName: "ANDROID",
                clientVersion: "19.29.35",
                androidSdkVersion: 30,
                hl: "en",
                gl: "US",
                userAgent: "com.google.android.youtube/19.29.35 (Linux; U; Android 11) gzip"
            }
        }
    }
};

interface SongPlayDetails {
    url: string;
    lyric?: string;
    coverUrl?: string; 
    isMv?: boolean;
}

export class ClientSideService {
  // --- Headers & Config ---
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

  private plugins: MusicPlugin[] = [];
  private guestCookie = 'os=pc; appver=2.9.7;';
  private logs: string[] = [];
  
  // 修复 Build 错误：添加这些兼容字段
  private searchTimeout = 15000;
  private apiBaseUrl = '';
  
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

  // --- Config Methods (Restored for App.tsx compatibility) ---
  setApiBaseUrl(url: string) { 
      this.apiBaseUrl = url.replace(/\/$/, ''); 
  }
  
  setSearchTimeout(ms: number) { 
      this.searchTimeout = ms; 
  }
  
  setCustomInvidiousUrl(url: string) { 
      // NewPipe 直连模式不需要 Invidious URL，这里留空以兼容接口调用
      this.log(`Config Update: Custom URL set to ${url} (Ignored in Direct Mode)`);
  }

  // --- Helper Methods ---
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
    
    // 1. NewPipe Extractor (Direct YouTubei)
    this.searchNewPipe(query).then(songs => {
        if(songs.length > 0) {
            this.log(`NewPipe Extractor found ${songs.length} results`);
            onProgress(songs);
        }
    }).catch(e => this.log(`NewPipe Extractor failed: ${e}`));

    // 2. Netease
    this.searchNetease(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    }).catch(e => this.log(`Netease failed: ${e}`));

    // 3. Bilibili
    this.searchBilibili(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    }).catch(e => this.log(`Bilibili failed: ${e}`));

    // 4. Plugins
    this.plugins.forEach(async (plugin) => {
        try {
            if (typeof plugin.search === 'function') {
                const results = await this.timeoutPromise(plugin.search(query, 1, 'music'), this.searchTimeout, []);
                if (Array.isArray(results) && results.length > 0) {
                    onProgress(results.map(r => this.mapPluginSong(r, plugin)));
                }
            }
        } catch(e: any) {}
    });
  }

  // --- NewPipe Extractor Implementation (YouTubei) ---
  private async searchNewPipe(query: string): Promise<Song[]> {
      try {
          const response = await CapacitorHttp.post({
              url: `${YOUTUBEI_V1_URL}/search?key=${INNERTUBE_API_KEY}`,
              headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'
              },
              data: {
                  ...CLIENTS.WEB,
                  query: query,
                  params: "Eg-KAQwIABAAGAAgACgB" 
              },
              connectTimeout: this.searchTimeout // 应用超时设置
          });

          if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
          
          const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
          
          if (!Array.isArray(contents)) return [];

          return contents.map((item: any) => {
              const video = item.videoRenderer;
              if (!video) return null;
              
              const title = video.title?.runs?.[0]?.text || "Unknown";
              const videoId = video.videoId;
              const thumbnails = video.thumbnail?.thumbnails;
              const coverUrl = thumbnails?.[thumbnails.length - 1]?.url;
              const artist = video.ownerText?.runs?.[0]?.text || video.shortBylineText?.runs?.[0]?.text || "YouTube";
              const artistId = video.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId;
              
              let duration = 0;
              const lengthText = video.lengthText?.simpleText;
              if (lengthText) {
                  const parts = lengthText.split(':').map(Number);
                  if (parts.length === 2) duration = parts[0] * 60 + parts[1];
                  if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
              }

              return {
                  id: videoId,
                  title: title,
                  artist: artist,
                  artistId: artistId,
                  album: 'YouTube',
                  coverUrl: coverUrl,
                  source: MusicSource.YOUTUBE,
                  duration: duration,
                  viewCount: video.viewCountText?.simpleText,
                  isGray: false
              };
          }).filter((s: any) => s !== null);

      } catch (e: any) {
          this.log(`NewPipe Search Error: ${e.message}`);
          throw e;
      }
  }

  async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<SongPlayDetails> {
      // 0. 优先使用后端 API 获取播放地址（解决浏览器 CORS、Bilibili 无直连等问题）
      if (this.apiBaseUrl) {
          try {
              let cookie = '';
              if (song.source === MusicSource.NETEASE) {
                  const savedUser = localStorage.getItem('unistream_user');
                  if (savedUser) {
                      try {
                          const u = JSON.parse(savedUser);
                          if (u.cookie) cookie = encodeURIComponent(u.cookie);
                      } catch (_) {}
                  }
              }
              const url = `${this.apiBaseUrl}/api/url?id=${encodeURIComponent(song.id)}&source=${song.source}${cookie ? '&cookie=' + cookie : ''}`;
              const res = await CapacitorHttp.get({ url, connectTimeout: 15000 });
              if (res.status === 200) {
                  const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
                  if (data && data.url) {
                      this.log(`Backend URL resolved: ${song.source} ${song.id}`);
                      return { url: data.url, lyric: data.lyric, coverUrl: data.coverUrl };
                  }
              }
          } catch (e: any) {
              this.log(`Backend URL failed: ${e?.message || e}`);
          }
      }

      // 1. NewPipe / YouTubei
      if (song.source === MusicSource.YOUTUBE) {
          try {
              const response = await CapacitorHttp.post({
                  url: `${YOUTUBEI_V1_URL}/player?key=${INNERTUBE_API_KEY}`,
                  headers: {
                      'Content-Type': 'application/json',
                      'User-Agent': CLIENTS.ANDROID.context.client.userAgent,
                      'X-Goog-Visitor-Id': this.guestCookie
                  },
                  data: {
                      ...CLIENTS.ANDROID,
                      videoId: song.id,
                      contentCheckOk: true,
                      racyCheckOk: true
                  }
              });

              const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
              const streamingData = json.streamingData;
              if (!streamingData) throw new Error("No streaming data");

              const formats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];
              let audioUrl = "";
              
              // 优先选择音频流
              const audios = formats.filter((f: any) => f.mimeType.includes("audio"));
              if (audios.length > 0) {
                  audios.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
                  const opus = audios.find((f: any) => f.mimeType.includes("opus"));
                  audioUrl = opus ? opus.url : audios[0].url;
              } else {
                  audioUrl = formats[0]?.url;
              }

              if (!audioUrl && json.videoDetails?.isLiveContent) {
                 audioUrl = streamingData.hlsManifestUrl;
              }

              return {
                  url: audioUrl,
                  coverUrl: json.videoDetails?.thumbnail?.thumbnails?.pop()?.url,
                  isMv: true
              };

          } catch (e: any) {
              this.log(`NewPipe Player Error: ${e.message}`);
          }
      }

      // 2. Plugin
      if (song.source === MusicSource.PLUGIN && song.pluginId) {
          const plugin = this.plugins.find(p => p.id === song.pluginId);
          if (plugin && plugin.getMediaUrl) {
              try {
                  const res = await plugin.getMediaUrl(song);
                  return { 
                      url: typeof res === 'string' ? res : res.url,
                      lyric: typeof res === 'object' ? res.lyric : undefined
                  };
              } catch(e) {}
          }
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

  async getComments(song: Song): Promise<Comment[]> {
      return [];
  }

  async getChannelDetails(channelId: string): Promise<{artist: Artist, songs: Song[]}> {
      try {
          const response = await CapacitorHttp.post({
              url: `${YOUTUBEI_V1_URL}/browse?key=${INNERTUBE_API_KEY}`,
              headers: { 'Content-Type': 'application/json' },
              data: { ...CLIENTS.WEB, browseId: channelId }
          });
          
          const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          const header = json.header?.c4TabbedHeaderRenderer;
          
          const artist: Artist = {
              id: channelId,
              name: header?.title || "Unknown",
              coverUrl: header?.avatar?.thumbnails?.[0]?.url || "",
              description: "",
              subscriberCount: header?.subscriberCountText?.simpleText,
              bannerUrl: header?.banner?.thumbnails?.[0]?.url
          };

          const tabs = json.contents?.twoColumnBrowseResultsRenderer?.tabs;
          const videoTab = tabs?.find((t: any) => t.tabRenderer?.title === "Videos" || t.tabRenderer?.title === "视频");
          const items = videoTab?.tabRenderer?.content?.richGridRenderer?.contents;
          
          let songs: Song[] = [];
          if (items) {
             songs = items.map((i: any) => {
                 const v = i.richItemRenderer?.content?.videoRenderer;
                 if(!v) return null;
                 return {
                     id: v.videoId,
                     title: v.title?.runs?.[0]?.text,
                     artist: artist.name,
                     source: MusicSource.YOUTUBE,
                     coverUrl: v.thumbnail?.thumbnails?.[0]?.url,
                     duration: 0
                 };
             }).filter((s:any) => s);
          }

          return { artist, songs };
      } catch(e) {
          return this.getArtistDetailNetease(channelId);
      }
  }

  // --- Netease Implementations ---
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

  private async getArtistDetailNetease(artistId: string): Promise<{artist: Artist, songs: Song[]}> {
      try {
          const res = await CapacitorHttp.get({
              url: `https://music.163.com/api/artist/songs?id=${artistId}&limit=50&offset=0`,
              headers: this.getNeteaseHeaders()
          });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          return {
              artist: { id: artistId, name: 'Artist', coverUrl: '' },
              songs: data.songs ? data.songs.map((t: any) => this.mapNeteaseSong(t)) : []
          };
      } catch(e) {}
      return { artist: {id: artistId, name:'Unknown', coverUrl:''}, songs: [] };
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

  // --- Plugin System ---
  async importPlugin(code: string): Promise<boolean> {
      try {
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

  async installPluginFromUrl(url: string): Promise<boolean> {
      try {
          const res = await CapacitorHttp.get({ url });
          const code = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
          return await this.importPlugin(code);
      } catch(e) { return false; }
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

  // --- Other Stubs ---
  async getMvUrl(song: Song): Promise<string | null> { return null; }
  
  async runDiagnostics(): Promise<DiagnosticResult[]> {
      const results: DiagnosticResult[] = [];
      const start = Date.now();
      try {
          const res = await CapacitorHttp.get({ url: `${YOUTUBEI_V1_URL}/config?key=${INNERTUBE_API_KEY}` });
           results.push({ name: 'YouTube (InnerTube)', status: res.status === 200 ? 'ok' : 'error', latency: Date.now() - start, message: `Direct Connect: ${res.status}` });
      } catch(e: any) {
          results.push({ name: 'YouTube (InnerTube)', status: 'error', latency: Date.now() - start, message: e.message });
      }
      return results;
  }

  async getUserPlaylists(userId: string): Promise<Playlist[]> { return []; }
  async importNeteasePlaylist(playlistId: string): Promise<Song[]> { return []; }
  async getArtistDetail(artistId: string): Promise<{artist: Artist, songs: Song[]}> {
      if (artistId.length > 15 || artistId.startsWith('UC')) {
          return this.getChannelDetails(artistId);
      }
      return this.getArtistDetailNetease(artistId);
  }
  async getDailyRecommendSongs(): Promise<Song[]> { return []; }
  async getUserStatus(cookieInput: string): Promise<any> { return { code: 200 }; }
}

export const musicService = new ClientSideService();
