// services/geminiService.ts

private async searchYouTube(keyword: string): Promise<Song[]> {
    const sortedInstances = [
        this.activePipedInstance,
        ...this.pipedInstances.filter(i => i !== this.activePipedInstance)
    ];

    // 仿照 MusicFree：定义多个可能的搜索过滤器顺序
    const filters = ['music_videos', 'videos', 'all'];

    for (const instance of sortedInstances) {
        for (const filter of filters) {
            try {
                this.log(`YT Try: ${instance} (Filter: ${filter})`);
                const url = `${instance}/search?q=${encodeURIComponent(keyword)}&filter=${filter}`;
                
                const response = await CapacitorHttp.get({ 
                    url, 
                    connectTimeout: 5000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                let data = response.data;
                if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e){} }

                // 鲁棒性检查：MusicFree 核心逻辑在于对结果集的泛化处理
                const items = data?.items || data?.results || [];
                
                if (Array.isArray(items) && items.length > 0) {
                    this.activePipedInstance = instance;
                    this.log(`YT Success: ${instance} with ${items.length} results`);
                    
                    return items
                        .filter((item: any) => item.type === 'video' || item.type === 'music_video')
                        .map((item: any) => {
                            // 兼容多种 ID 提取方式
                            let videoId = '';
                            if (item.videoId) videoId = item.videoId;
                            else if (item.url) videoId = item.url.split('v=')[1]?.split('&')[0] || '';

                            return {
                                id: videoId,
                                title: item.title || 'Unknown Title',
                                artist: item.uploaderName || item.author || 'Unknown Artist',
                                album: 'YouTube',
                                coverUrl: item.thumbnail || item.thumbnails?.[0]?.url || '',
                                source: MusicSource.YOUTUBE,
                                duration: item.duration || 0,
                                isGray: false
                            };
                        })
                        .filter(s => s.id); // 过滤掉无效 ID
                }
            } catch(e: any) {
                this.log(`YT Node Error: ${instance} - ${e.message}`);
                break; // 当前节点报错则跳到下一个节点，不尝试其他 filter
            }
        }
    }
    this.log(`YT All Nodes/Filters Failed`);
    return [];
}
