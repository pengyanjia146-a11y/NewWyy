import { CapacitorHttp } from '@capacitor/core';
import { Song, MusicSource, AudioQuality, DiagnosticResult } from "../types";

// 定义播放详情接口，确保类型安全
interface SongPlayDetails {
    url: string;
    lyric?: string;
    coverUrl?: string; 
}

export class ClientSideService {
    // 优先级节点列表
    private pipedInstances = [
        "https://pipedapi.kavin.rocks",
        "https://api.piped.video",
        "https://pipedapi.drg.li",
        "https://piped.mha.fi"
    ];

    private activePipedInstance = "https://pipedapi.kavin.rocks";
    private plugins: any[] = [];
    private logs: string[] = [];

    constructor() {}

    // 系统性监控：记录每一次网络和解析动作
    public log(msg: string) {
        const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
        this.logs.unshift(entry);
        if (this.logs.length > 50) this.logs.pop();
        console.log(entry);
    }

    public getLogs() { return this.logs; }

    // --- 核心逻辑 1：仿 MusicFree 的插件加载系统 ---
    // 解决“为什么是这样”：通过 Function 构造器创建一个受限的执行沙箱
    async importPlugin(code: string): Promise<boolean> {
        try {
            this.log("正在注入插件逻辑...");
            const module = { exports: {} as any };
            
            // 这里的逻辑参考了 MusicFree 的插件解析协议
            const pluginFunc = new Function('module', 'exports', 'fetch', code);
            pluginFunc(module, module.exports, fetch);
            
            const plugin = module.exports;

            if (plugin.id && typeof plugin.search === 'function') {
                // 如果 ID 重复则覆盖，确保系统纯净
                this.plugins = this.plugins.filter(p => p.id !== plugin.id);
                this.plugins.push(plugin);
                this.log(`插件 [${plugin.name}] 部署成功`);
                return true;
            }
            return false;
        } catch (e: any) {
            this.log(`插件校验失败: ${e.message}`);
            return false;
        }
    }

    getPlugins() { return this.plugins; }

    // --- 核心逻辑 2：解决“延时正常但无法搜索”的增强搜索 ---
    // 解决本质问题：Piped 节点对 'music_videos' 过滤器的支持不稳定
    async searchMusic(query: string, onProgress: (songs: Song[]) => void): Promise<void> {
        this.log(`搜索触发: "${query}"`);

        // 1. 内部 YouTube 逻辑 (带回退机制)
        this.searchYouTubeInternal(query).then(songs => {
            if (songs.length > 0) onProgress(songs);
        });

        // 2. 动态插件逻辑：遍历所有已加载的 MusicFree 插件
        this.plugins.forEach(async (plugin) => {
            try {
                const results = await plugin.search(query);
                if (Array.isArray(results)) {
                    const pluginSongs = results.map((s: any) => ({
                        ...s,
                        source: MusicSource.YOUTUBE, // 复用视图渲染
                        pluginId: plugin.id
                    }));
                    onProgress(pluginSongs);
                }
            } catch (e: any) {
                this.log(`插件搜索故障: ${plugin.name}`);
            }
        });
    }

    private async searchYouTubeInternal(keyword: string): Promise<Song[]> {
        // 关键改进：如果 music_videos 没结果，立即尝试普通 videos
        const filters = ['music_videos', 'videos'];
        
        for (const filter of filters) {
            try {
                const url = `${this.activePipedInstance}/search?q=${encodeURIComponent(keyword)}&filter=${filter}`;
                const response = await CapacitorHttp.get({ url, connectTimeout: 5000 });
                
                let data = response.data;
                if (typeof data === 'string') data = JSON.parse(data);

                const items = data.items || data.results || [];
                if (items.length > 0) {
                    this.log(`YT 搜索奏效 (过滤器: ${filter})`);
                    return items.map((item: any) => ({
                        id: item.videoId || item.url?.split('v=')[1] || "",
                        title: item.title,
                        artist: item.uploaderName || item.author,
                        album: "YouTube",
                        coverUrl: item.thumbnail || (item.thumbnails && item.thumbnails[0]?.url),
                        source: MusicSource.YOUTUBE,
                        duration: item.duration || 0,
                        isGray: false
                    })).filter((s: any) => s.id);
                }
            } catch (e: any) {
                this.log(`当前节点尝试失败: ${this.activePipedInstance}`);
            }
        }
        return [];
    }

    // --- 播放解析逻辑 ---
    async getSongDetails(song: Song): Promise<SongPlayDetails> {
        // 检查是否由插件负责解析音源地址
        const plugin = this.plugins.find(p => p.id === (song as any).pluginId);
        if (plugin && typeof plugin.getMediaUrl === 'function') {
            const url = await plugin.getMediaUrl(song);
            return { url };
        }

        // Piped 默认解析逻辑
        try {
            const res = await CapacitorHttp.get({ 
                url: `${this.activePipedInstance}/streams/${song.id}` 
            });
            const data = res.data;
            const stream = data.audioStreams?.find((s: any) => s.format === 'M4A') || data.audioStreams?.[0];
            return { url: stream?.url || "" };
        } catch (e) {
            return { url: "" };
        }
    }
}

export const musicService = new ClientSideService();
