// Saved on 2026-02-05
// Original: types.ts

export type AudioQuality = 'standard' | 'high' | 'lossless';

export enum MusicSource {
  YOUTUBE = 'YOUTUBE',
  NETEASE = 'NETEASE',
  QQ = 'QQ',
  BILIBILI = 'BILIBILI',
  XIAMI = 'XIAMI',
  PLUGIN = 'PLUGIN'
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  artistId?: string;
  album?: string;
  coverUrl?: string;
  source?: MusicSource;
  duration?: number;
  audioUrl?: string;
  pluginId?: string;
  isGray?: boolean;
  viewCount?: string;
}

export interface Artist {
  id: string;
  name: string;
  coverUrl?: string;
  description?: string;
  subscriberCount?: string;
  bannerUrl?: string;
}

export interface Playlist {
  id: string;
  title: string;
  songs: Song[];
}

export interface Comment { id: string; content: string; author: string; time: number }

export interface DiagnosticResult { name: string; status: 'ok' | 'error'; latency?: number; message?: string }

export interface MusicPlugin { id: string; name: string; version?: string; author?: string; sources: string[]; status?: 'active' | 'inactive'; search?: (q: string, page?: number, type?: string) => Promise<any[]>; getMediaUrl?: (song: Song) => Promise<string | {url: string, lyric?: string}> }

export interface StreamInfo { url: string; mimeType?: string; quality?: number }
