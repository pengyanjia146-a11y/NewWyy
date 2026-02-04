
export enum MusicSource {
  NETEASE = 'NETEASE',
  YOUTUBE = 'YOUTUBE',
  BILIBILI = 'BILIBILI',
  LOCAL = 'LOCAL',
  PLUGIN = 'PLUGIN'
}

// --- MusicFree Compatible Interfaces ---

export interface IArtist {
    id: string;
    name: string;
    avatar?: string;
    [key: string]: any;
}

export interface IAlbum {
    id: string;
    name: string;
    img?: string;
    [key: string]: any;
}

export interface IMusicItem {
    id: string; // Plugin specific ID
    platform: string; // Plugin platform code (e.g. 'qy', 'kw')
    title: string;
    artist: string;
    artists?: IArtist[];
    album?: string;
    artwork?: string; // URL
    duration?: number; // seconds
    [key: string]: any; // Allow extra props
}

export interface IMediaSource {
    url: string;
    headers?: Record<string, string>;
    userAgent?: string;
    lyric?: string;
}

export interface IPlugin {
    platform: string;
    name: string;
    version: string;
    author?: string;
    description?: string;
    userVariables?: any[];
    srcUrl?: string; // Where it was loaded from
    
    // Core Methods
    search: (query: string, page: number, type: string) => Promise<{
        isEnd?: boolean;
        data: IMusicItem[];
    }>;
    getMediaSource: (musicItem: IMusicItem, quality: string) => Promise<IMediaSource | null>;
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
    // Wrapper to match previous app logic if needed, 
    // but we primarily use IPlugin structure now.
    id: string;
    status: 'active' | 'disabled';
    sources?: string[];
}

export interface DiagnosticResult {
    name: string;
    status: 'pending' | 'ok' | 'error' | 'skipped';
    latency: number;
    message: string;
}

export type ViewState = 'HOME' | 'SEARCH' | 'LIBRARY' | 'LABS' | 'SETTINGS' | 'ARTIST_DETAIL';

export type AudioQuality = 'standard' | 'exhigh' | 'lossless';