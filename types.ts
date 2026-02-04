
export enum MusicSource {
  NETEASE = 'NETEASE',
  YOUTUBE = 'YOUTUBE',
  BILIBILI = 'BILIBILI',
  LOCAL = 'LOCAL',
  PLUGIN = 'PLUGIN'
}

// --- MusicFree Compatible Interfaces ---

export interface IMusicItem {
    id: string | number;     // Plugin unique ID
    platform?: string;       // Platform code (e.g. 'bilibili')
    title: string;
    artist: string;
    album: string;
    artwork: string;         // Cover URL
    url?: string;            // Direct URL (optional)
    duration?: number;       // Seconds
    [key: string]: any;      // Extra props allowed by MusicFree
}

export interface IMediaSource {
    url: string;
    headers?: Record<string, string>;
    userAgent?: string;
    lyric?: string;
}

export interface IPlugin {
    platform: string;        // Unique ID (e.g., 'qq', 'kw', 'bilibili')
    name: string;
    version: string;
    appVersion?: string;     // Supported app version
    author?: string;
    srcUrl?: string;         // Origin URL
    
    // Core Methods (MusicFree Protocol)
    // Returns array directly OR { data: [], isEnd: boolean }
    search: (query: string, page: number, type: string) => Promise<IMusicItem[] | { data: IMusicItem[], isEnd: boolean }>;
    
    getMediaSource: (musicItem: IMusicItem, quality: string) => Promise<{ url: string; headers?: Record<string, string>; lyric?: string } | null>;
    
    getMusicInfo?: (musicItem: IMusicItem) => Promise<Partial<IMusicItem>>;
    getLyric?: (musicItem: IMusicItem) => Promise<{ lyric: string; tlyric?: string }>;
}

// --- App Internal Types ---

export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  coverUrl: string;
  source: MusicSource;
  duration: number; // in seconds
  audioUrl?: string; 
  mvId?: string;
  isGray?: boolean;
  fee?: number; 
  lyric?: string;
  
  // Link to Plugin
  pluginId?: string; // Matches IPlugin.platform
  pluginData?: IMusicItem; // Store original data for getMediaSource
}

export interface Artist {
  id: string;
  name: string;
  coverUrl: string;
  description?: string;
  songSize?: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  songs: Song[];
  coverUrl?: string;
  isSystem?: boolean; 
}

export interface UserProfile {
  id: string;
  nickname: string;
  avatarUrl: string;
  isVip: boolean;
  platform: 'netease' | 'guest';
  cookie?: string; 
}

export interface MusicPlugin extends IPlugin {
    id: string; // Alias for platform, used internally
    status: 'active' | 'disabled';
}

export interface DiagnosticResult {
    name: string;
    status: 'pending' | 'ok' | 'error' | 'skipped';
    latency: number;
    message: string;
}

export type ViewState = 'HOME' | 'SEARCH' | 'LIBRARY' | 'LABS' | 'SETTINGS' | 'ARTIST_DETAIL';

export type AudioQuality = 'standard' | 'exhigh' | 'lossless';
