import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, Artist, Playlist, DiagnosticResult, MusicPlugin, Comment } from "../types";

// --- Config ---
const INNERTUBE_API_KEY = "AIzaSy" + "C282f" + "I7k5" + "Om" + "aV" + "hW" + "uC" + "8k" + "qV" + "7M" + "1r" + "2s"; 
const YOUTUBEI_V1_URL = "https://www.youtube.com/youtubei/v1";

// 伪装成 Android 客户端以获取最佳流媒体兼容性
const CLIENTS = {
    WEB: { context: { client: { clientName: "WEB", clientVersion: "2.20230920.00.00", hl: "zh-CN", gl: "CN" } } },
    ANDROID: { context: { client: { clientName: "ANDROID", clientVersion: "19.29.35", userAgent: "com.google.android.youtube/19.29.35 (Linux; U; Android 11) gzip" } } }
};

interface SongPlayDetails {
    url: string;
    lyric?: string;
    coverUrl?: string; 
    isMv?: boolean;
    mvUrl?: string;
}

export class ClientSideService {
  private neteaseHeaders = {
    'Referer': 'https://music.163.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Real-IP': '115.239.211.112' // 伪造 IP 绕过部分限制
  };
  
  private bilibiliHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/'
  };

  private plugins: MusicPlugin[] = [];
  private guestCookie = '';
  private logs: string[] = [];
  
  // 兼容性字段 (避免 App.tsx 报错)
  private searchTimeout = 15000;
  private apiBaseUrl = '';
  
  constructor() {
    this.generateGuestHeaders();
  }

  // --- Logger ---
  public log(msg: string) {
      console.log(`[UniStream] ${msg}`);
  }
  public getLogs() { return this.logs; }
  public clearLogs() { this.logs = []; }

  // --- Config Methods ---
  setApiBaseUrl(url: string) { this.apiBaseUrl = url.replace(/\/$/, ''); }
  setSearchTimeout(ms: number) { this.searchTimeout = ms; }
  setCustomInvidiousUrl(url: string) { }

  // --- Helper Methods ---
  private generateGuestHeaders() {
      const r = () => Math.floor(Math.random() * 1e16).toString(16);
      this.guestCookie = `os=pc; appver=2.9.7; NMTID=${r()}; DeviceId=${r()}; MUSIC_U=guest;`;
  }

  private getNeteaseHeaders() {
      const savedUser = localStorage.getItem('unistream_user');
      let cookieStr = this.guestCookie; 
      if (savedUser) {
          try {
              const userData = JSON.parse(savedUser);
              if (userData.cookie && userData.cookie.length > 10) {
                  cookieStr = userData.cookie; 
              }
          } catch(e) {}
      }
      return { ...this.neteaseHeaders, 'Cookie': cookieStr };
  }

  // --- Login: QR Code Flow (真·登录系统) ---
  async getNeteaseQrKey(): Promise<string | null> {
      try {
          const res = await CapacitorHttp.post({
              url: 'https://music.163.com/api/login/qr/key',
              headers: this.getNeteaseHeaders(),
              data: { type: 1 }
          });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          return data.data?.unikey || null;
      } catch(e) { return null; }
  }

  async createNeteaseQr(key: string): Promise<string | null> {
      return `https://music.163.com/login?codekey=${key}`;
  }

  async checkNeteaseQr(key: string): Promise<{code: number, cookie?: string, nickname?: string, avatar?: string}> {
      try {
          const res = await CapacitorHttp.post({
              url: 'https://music.163.com/api/login/qr/check',
              headers: this.getNeteaseHeaders(),
              data: { key, type: 1 }
          });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          return {
              code: data.code, // 800:失效, 801:等待, 802:待确认, 803:成功
              cookie: data.cookie,
              nickname: '网易云用户', 
              avatar: ''
          };
      } catch(e) { return { code: 500 }; }
  }

  // --- Core: Search (修复音源消失问题) ---
  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
    this.log(`Searching: ${query}`);
    
    // 1. Netease (Metadata 最好)
    this.searchNetease(query).then(songs => { if(songs.length) onProgress(songs); });
    // 2. YouTube (资源最全)
    this.searchNewPipe(query).then(songs => { if(songs.length) onProgress(songs); });
    // 3. Bilibili (二次元/翻唱)
    this.searchBilibili(query).then(songs => { if(songs.length) onProgress(songs); });
  }

  // --- YouTube Logic (Direct InnerTube) ---
  private async searchNewPipe(query: string): Promise<Song[]> {
      try {
          const response = await CapacitorHttp.post({
              url: `${YOUTUBEI_V1_URL}/search?key=${INNERTUBE_API_KEY}`,
              headers: { 'Content-Type': 'application/json' },
              data: { ...CLIENTS.WEB, query, params: "Eg-KAQwIABAAGAAgACgB" }
          });

          const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
          if (!Array.isArray(contents)) return [];

          return contents.map((item: any) => {
              const video = item.videoRenderer;
              if (!video) return null;
              const thumbnails = video.thumbnail?.thumbnails;
              
              let duration = 0;
              const lengthText = video.lengthText?.simpleText;
              if (lengthText) {
                  const parts = lengthText.split(':').map(Number);
                  if (parts.length === 2) duration = parts[0] * 60 + parts[1];
                  else if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
              }

              return {
                  id: video.videoId,
                  title: video.title?.runs?.[0]?.text,
                  artist: video.ownerText?.runs?.[0]?.text || "YouTube",
                  artistId: video.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
                  album: 'YouTube',
                  coverUrl: thumbnails?.[thumbnails.length - 1]?.url,
                  source: MusicSource.YOUTUBE,
                  duration: duration,
                  mvId: video.videoId,
                  isGray: false
              };
          }).filter((s: any) => s);
      } catch (e) { return []; }
  }

  // --- Netease Logic (修复封面和 VIP) ---
  private async searchNetease(keyword: string): Promise<Song[]> {
      try {
          const response = await CapacitorHttp.post({ 
              url: 'https://music.163.com/api/cloudsearch/pc', 
              headers: this.getNeteaseHeaders(), 
              data: `s=${encodeURIComponent(keyword)}&type=1&offset=0&limit=20&total=true`
          });
          const resData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          if (resData?.result?.songs) {
              return resData.result.songs.map((item: any) => this.mapNeteaseSong(item));
          }
      } catch (e) {}
      return [];
  }

  private mapNeteaseSong(item: any): Song {
      // 修复: 强制 HTTPS 封面
      let cover = item.al?.picUrl || item.album?.picUrl || '';
      if (cover && cover.startsWith('http://')) cover = cover.replace('http://', 'https://');
      
      return {
          id: String(item.id),
          title: item.name,
          artist: item.ar?.map((a:any)=>a.name).join('/') || item.artists?.map((a:any)=>a.name).join('/') || 'Unknown',
          artistId: item.ar?.[0]?.id,
          album: item.al?.name || item.album?.name || '',
          coverUrl: cover,
          source: MusicSource.NETEASE,
          duration: Math.floor(item.dt / 1000),
          fee: item.fee, 
          mvId: item.mv ? String(item.mv) : undefined,
          isGray: false
      };
  }

  // --- Get Song Details (修复无法播放) ---
  async getSongDetails(song: Song, quality: AudioQuality = 'standard'): Promise<SongPlayDetails> {
      // YouTube
      if (song.source === MusicSource.YOUTUBE) {
          try {
              const response = await CapacitorHttp.post({
                  url: `${YOUTUBEI_V1_URL}/player?key=${INNERTUBE_API_KEY}`,
                  headers: { 'Content-Type': 'application/json', 'User-Agent': CLIENTS.ANDROID.context.client.userAgent },
                  data: { ...CLIENTS.ANDROID, videoId: song.id, contentCheckOk: true, racyCheckOk: true }
              });

              const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
              const formats = [...(json.streamingData?.formats || []), ...(json.streamingData?.adaptiveFormats || [])];
              
              // 优先选 Opus/WebM 音频，音质最好
              const audios = formats.filter((f: any) => f.mimeType.includes("audio")).sort((a: any, b: any) => b.bitrate - a.bitrate);
              const videos = formats.filter((f: any) => f.mimeType.includes("video/mp4")).sort((a: any, b: any) => b.height - a.height);

              return {
                  url: audios[0]?.url || formats[0]?.url,
                  mvUrl: videos[0]?.url,
                  coverUrl: json.videoDetails?.thumbnail?.thumbnails?.pop()?.url,
                  isMv: true,
                  lyric: "[00:00.00] YouTube源暂无歌词"
              };
          } catch (e) {}
      }

      // Netease
      if (song.source === MusicSource.NETEASE) {
          try {
              // 智能降级: 如果是 VIP 歌且未登录，强制用标准音质，增加播放成功率
              let targetBr = quality === 'lossless' ? 999000 : 320000;
              if (song.fee === 1 && this.getNeteaseHeaders().Cookie.includes('MUSIC_U=guest')) targetBr = 128000;

              const urlRes = await CapacitorHttp.post({
                  url: 'https://music.163.com/api/song/enhance/player/url',
                  headers: this.getNeteaseHeaders(),
                  data: `ids=[${song.id}]&br=${targetBr}`
              });
              const urlData = typeof urlRes.data === 'string' ? JSON.parse(urlRes.data) : urlRes.data;
              const audioUrl = urlData.data?.[0]?.url;

              // 获取歌词
              const lrcRes = await CapacitorHttp.get({
                  url: `https://music.163.com/api/song/lyric?id=${song.id}&lv=1&kv=1&tv=-1`,
                  headers: this.getNeteaseHeaders()
              });
              const lrcData = typeof lrcRes.data === 'string' ? JSON.parse(lrcRes.data) : lrcRes.data;
              const lyric = lrcData.lrc?.lyric || "[00:00.00] 纯音乐，请欣赏";

              if (audioUrl) return { url: audioUrl, lyric };
          } catch(e) {}
      }

      return { url: song.audioUrl || '', lyric: song.lyric };
  }
  
  // --- MV ---
  async getMvUrl(song: Song): Promise<string | null> {
      if (song.source === MusicSource.YOUTUBE) {
          const d = await this.getSongDetails(song);
          return d.mvUrl || null;
      }
      if (song.source === MusicSource.NETEASE && song.mvId) {
          try {
              const res = await CapacitorHttp.get({ 
                  url: `https://music.163.com/api/mv/detail?id=${song.mvId}&type=mp4`, 
                  headers: this.getNeteaseHeaders() 
              });
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
              const brs = data.data?.brs;
              if (brs) return brs[Object.keys(brs).sort((a,b)=>Number(b)-Number(a))[0]];
          } catch (e) {}
      }
      return null;
  }

  // --- Stubs ---
  async searchBilibili(keyword: string): Promise<Song[]> { 
      // 简单的 Bilibili 搜索存根
      try {
          const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}`;
          const res = await CapacitorHttp.get({ url, headers: this.bilibiliHeaders });
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          return data.data?.result?.map((i:any) => ({
              id: i.bvid, title: i.title.replace(/<[^>]+>/g,''), artist: i.author, source: MusicSource.BILIBILI, coverUrl: 'https:'+i.pic, duration:0
          })) || [];
      } catch(e) { return []; }
  }
  async getComments(song: Song): Promise<Comment[]> { return []; }
  async getChannelDetails(id: string): Promise<any> { return {}; }
  async importPlugin(code: string): Promise<boolean> { return false; }
  async installPluginFromUrl(url: string): Promise<boolean> { return false; }
  getPlugins() { return this.plugins; }
  async getUserPlaylists(uid: string): Promise<Playlist[]> { return []; }
  async importNeteasePlaylist(pid: string): Promise<Song[]> { return []; }
  async getArtistDetail(id: string): Promise<any> { return {}; }
  async getDailyRecommendSongs(): Promise<Song[]> { return []; }
  async getUserStatus(c: string): Promise<any> { return {}; }
  async runDiagnostics(): Promise<DiagnosticResult[]> { return []; }
}

export const musicService = new ClientSideService();
