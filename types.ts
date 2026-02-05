// 文件路径: types.ts
export enum MusicSource {
  NETEASE = 'NETEASE',
  YOUTUBE = 'YOUTUBE',
  BILIBILI = 'BILIBILI',
  LOCAL = 'LOCAL',
  PLUGIN = 'PLUGIN'
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId?: string; 
  album: string;
  coverUrl: string;
  source: MusicSource;
  duration: number; 
  audioUrl?: string; 
  mvId?: string; 
  isGray?: boolean;
  fee?: number; 
  lyric?: string; 
  pluginId?: string;
  
  viewCount?: number;
  publishDate?: string;
  isLive?: boolean;
  streamInfo?: StreamInfo; 
}

export interface StreamInfo {
  audioStreams: StreamQuality[];
  videoStreams: StreamQuality[];
  relatedSongs: Song[];
  subtitles: Subtitle[];
  description: string;
}

export interface StreamQuality {
  url: string;
  format: string;
  quality: string; 
  bitrate: number;
  isVideo: boolean;
}

export interface Subtitle {
  url: string;
  lang: string;
  label: string;
}

export interface Artist {
  id: string;
  name: string;
  coverUrl: string;
  description?: string;
  songSize?: number;
  subscriberCount?: number; 
  bannerUrl?: string; 
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  songs: Song[];
  coverUrl?: string;
  isSystem?: boolean;
  uploader?: string;
  
  // [修复] 必须显式定义这两个字段，否则 App.tsx 会报错
  source?: 'LOCAL' | 'NETEASE'; 
  trackCount?: number; 
}

export interface Comment {
  id: string;
  author: string;
  authorAvatar: string;
  content: string;
  time: string;
  likes: number;
  replyCount: number;
}

export interface UserProfile {
  id: string;
  nickname: string;
  avatarUrl: string;
  isVip: boolean;
  platform: 'netease' | 'guest';
  cookie?: string;
}

export interface MusicPlugin {
    id: string;
    name: string;
    version: string;
    author: string;
    sources: string[];
    status: 'active' | 'disabled';
    srcUrl?: string;
    search?: (query: string, page?: number, type?: string) => Promise<any[]>;
    getMediaUrl?: (song: any) => Promise<{url: string, lyric?: string}>;
}

export interface DiagnosticResult {
    name: string;
    status: 'pending' | 'ok' | 'error' | 'skipped';
    latency: number;
    message: string;
}

export type ViewState = 'HOME' | 'SEARCH' | 'LIBRARY' | 'LABS' | 'SETTINGS' | 'ARTIST_DETAIL' | 'COMMENTS';

export type AudioQuality = 'standard' | 'exhigh' | 'lossless';
