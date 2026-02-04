import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource } from "../types";

export class ClientSideService {
  // 公共镜像站列表（如果一个挂了，可以换其他的）
  private pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.ot.ax',
    'https://piped-api.garudalinux.org',
    'https://pa.il.ax'
  ];
  private currentInstance = 0;

  // 辅助函数：超时控制
  private timeoutPromise<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
      return new Promise((resolve) => {
          const timer = setTimeout(() => resolve(fallbackValue), ms);
          promise
              .then((res) => { clearTimeout(timer); resolve(res); })
              .catch(() => { clearTimeout(timer); resolve(fallbackValue); });
      });
  }

  // 核心：流式搜索
  async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
    
    // 1. 网易云 (保留原有的后端代理，或者如果后端没跑，这里也会挂)
    // 如果你没有后端，建议这里也改用一些公共 API，或者暂时接受只能搜 YouTube
    
    // 2. YouTube (直接请求公共镜像，无需后端)
    this.searchPiped(query).then(songs => {
        if(songs.length > 0) onProgress(songs);
    });
  }

  // 轮询 Piped 实例搜索
  private async searchPiped(query: string): Promise<Song[]> {
    for (let i = 0; i < this.pipedInstances.length; i++) {
        const instance = this.pipedInstances[(this.currentInstance + i) % this.pipedInstances.length];
        try {
            console.log(`Trying Piped: ${instance}`);
            const response = await CapacitorHttp.get({
                url: `${instance}/search`,
                params: { q: query, filter: 'music_songs' }
            });

            if (response.data && response.data.items) {
                // 成功！记录这个好用的实例
                this.currentInstance = (this.currentInstance + i) % this.pipedInstances.length;
                
                return response.data.items.map((item: any) => ({
                    id: item.url.split('v=')[1],
                    title: item.title,
                    artist: item.uploaderName,
                    album: 'YouTube',
                    coverUrl: item.thumbnail,
                    source: 'YOUTUBE', // 确保这个枚举值在 types.ts 里有
                    duration: item.duration
                }));
            }
        } catch (e) {
            console.warn(`Instance ${instance} failed`);
        }
    }
    return [];
  }

  // 获取播放链接 (直接解析 Piped)
  async getSongDetails(song: Song): Promise<{ url: string }> {
      if (song.source === 'YOUTUBE') {
          const instance = this.pipedInstances[this.currentInstance];
          try {
              const response = await CapacitorHttp.get({
                  url: `${instance}/streams/${song.id}`
              });
              // 找音频流
              const audioStream = response.data.audioStreams?.find((s: any) => !s.videoOnly);
              if (audioStream) {
                  return { url: audioStream.url };
              }
          } catch (e) {
              console.error('Piped Play Error', e);
          }
      }
      return { url: '' };
  }
}

export const musicService = new ClientSideService();
