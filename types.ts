
export enum MusicSource {
  NETEASE = 'NETEASE',
  YOUTUBE = 'YOUTUBE',
  BILIBILI = 'BILIBILI',
  LOCAL = 'LOCAL',
  PLUGIN = 'PLUGIN' // For MusicFree style plugins
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId?: string; // Link to artist detail
  album: string;
  coverUrl: string;
  source: MusicSource;
  duration: number; // in seconds
  audioUrl?: string; 
  mvId?: string; // If present, song has a video. For Bilibili, this is the bvid.
  isGray?: boolean;
  fee?: number; // 0: free, 1: VIP, 8: SQ
  lyric?: string; // LRC format string
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
  isSystem?: boolean; // e.g. "My Favorites"
}

export interface UserProfile {
  id: string;
  nickname: string;
  avatarUrl: string;
  isVip: boolean;
  platform: 'netease' | 'guest';
  cookie?: string; // Store session cookie (MUSIC_U value)
}

export interface MusicPlugin {
    id: string;
    name: string;
    version: string;
    author: string;
    sources: string[]; // e.g., ['kugou', 'bilibili']
    status: 'active' | 'disabled';
    srcUrl?: string; // Where it was loaded from
}

export interface DiagnosticResult {
    name: string;
    status: 'pending' | 'ok' | 'error' | 'skipped';
    latency: number;
    message: string;
}

export type ViewState = 'HOME' | 'SEARCH' | 'LIBRARY' | 'LABS' | 'SETTINGS' | 'ARTIST_DETAIL';

export type AudioQuality = 'standard' | 'exhigh' | 'lossless';