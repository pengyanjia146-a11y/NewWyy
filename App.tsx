
import React, { useState, useEffect, useRef } from 'react';
import { musicService } from './services/geminiService';
import { Player } from './components/Player';
import { LoginModal } from './components/LoginModal';
import { Toast, ToastType } from './components/Toast';
import { HomeIcon, SearchIcon, LibraryIcon, NeteaseIcon, YouTubeIcon, BilibiliIcon, PlayIcon, LabIcon, PlaylistAddIcon, PluginFileIcon, MoreVerticalIcon, HeartIcon, DownloadIcon, NextPlanIcon, SettingsIcon, FolderIcon, ActivityIcon, TrashIcon, UserCheckIcon, UserPlusIcon, SmartphoneIcon } from './components/Icons';
import { Song, UserProfile, ViewState, MusicSource, Playlist, MusicPlugin, AudioQuality, Artist, DiagnosticResult } from './types';
import { SecureImage } from './components/SecureImage';

export default function App() {
  const [view, setView] = useState<ViewState>('HOME');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  
  // Audio Quality
  const [quality, setQuality] = useState<AudioQuality>('standard');

  // Search Tabs
  const [activeTab, setActiveTab] = useState<'ALL' | 'NETEASE' | 'BILIBILI' | 'YOUTUBE' | 'PLUGIN'>('ALL');

  // Toast State
  const [toast, setToast] = useState<{msg: string, type: ToastType, show: boolean}>({ msg: '', type: 'info', show: false });

  // Playlists State (Persistence)
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
      const saved = localStorage.getItem('unistream_playlists');
      return saved ? JSON.parse(saved) : [
          { id: 'fav', name: '我喜欢的音乐', description: '红心收藏', songs: [], isSystem: true, coverUrl: 'https://picsum.photos/300?99' }
      ];
  });
  // Separate state for NetEase Playlists fetched from API
  const [neteasePlaylists, setNeteasePlaylists] = useState<Playlist[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);

  // Followed Artists State
  const [followedArtists, setFollowedArtists] = useState<Artist[]>(() => {
      const saved = localStorage.getItem('unistream_artists');
      return saved ? JSON.parse(saved) : [];
  });
  const [activeArtist, setActiveArtist] = useState<{info: Artist, songs: Song[]} | null>(null);

  // Persistence Effect
  useEffect(() => {
      localStorage.setItem('unistream_playlists', JSON.stringify(playlists));
      localStorage.setItem('unistream_artists', JSON.stringify(followedArtists));
  }, [playlists, followedArtists]);

  // History State
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
      const saved = localStorage.getItem('unistream_search_history');
      return saved ? JSON.parse(saved) : [];
  });

  const [playHistory, setPlayHistory] = useState<Song[]>(() => {
      const saved = localStorage.getItem('unistream_play_history');
      return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => { localStorage.setItem('unistream_search_history', JSON.stringify(searchHistory)); }, [searchHistory]);
  useEffect(() => { localStorage.setItem('unistream_play_history', JSON.stringify(playHistory)); }, [playHistory]);

  // Plugins State
  const [installedPlugins, setInstalledPlugins] = useState<MusicPlugin[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const [pluginLoading, setPluginLoading] = useState(false);

  // Load Plugins on Startup
  useEffect(() => {
      const loadPlugins = async () => {
          try {
              const savedCodes = JSON.parse(localStorage.getItem('unistream_plugins_code') || '[]');
              if (savedCodes.length > 0) {
                  for (const code of savedCodes) {
                      await musicService.importPlugin(code);
                  }
                  setInstalledPlugins([...musicService.getPlugins()]);
              }
          } catch (e) { console.error("Plugin load failed", e); }
      };
      loadPlugins();
  }, []);
  
  // Diagnostics State
  const [diagnosticResults, setDiagnosticResults] = useState<DiagnosticResult[]>([]);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // Settings State (Persistence)
  const [settings, setSettings] = useState(() => {
      const savedSettings = localStorage.getItem('unistream_settings');
      const defaults = {
          downloadPath: 'Internal Storage/Music/UniStream',
          customInvidious: '',
          apiBaseUrl: '',
          searchTimeout: 15 
      };
      return savedSettings ? { ...defaults, ...JSON.parse(savedSettings) } : defaults;
  });

  useEffect(() => {
      localStorage.setItem('unistream_settings', JSON.stringify(settings));
      musicService.setCustomInvidiousUrl(settings.customInvidious);
      musicService.setApiBaseUrl(settings.apiBaseUrl);
      musicService.setSearchTimeout((settings.searchTimeout || 15) * 1000);
  }, [settings]);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Text Import State
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  
  // Netease Playlist Import State
  const [showNeteaseImport, setShowNeteaseImport] = useState(false);
  const [neteaseLink, setNeteaseLink] = useState('');

  // Active Context Menu
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  
  // Polling for logs when in Labs view
  useEffect(() => {
      let interval: any;
      if (view === 'LABS') {
          interval = setInterval(() => {
              setDebugLogs([...musicService.getLogs()]);
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [view]);

  const showToast = (msg: string, type: ToastType = 'info') => {
      setToast({ msg, type, show: true });
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('unistream_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        setUser(u);
        fetchUserResources(u);
      } catch (e) {}
    }
  }, []);

  const fetchUserResources = async (u: UserProfile) => {
      if (u.platform === 'netease' && u.id) {
          try {
              const pls = await musicService.getUserPlaylists(u.id);
              setNeteasePlaylists(pls);
          } catch(e) { console.error(e); }
      }
  };

  useEffect(() => {
    const handleClick = () => setMenuSong(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const runDiagnostics = async () => {
      setIsRunningDiagnostics(true);
      musicService.clearLogs();
      const results = await musicService.runDiagnostics();
      setDiagnosticResults(results);
      setIsRunningDiagnostics(false);
  };

  const handleLoginSuccess = async (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    localStorage.setItem('unistream_user', JSON.stringify(loggedInUser));
    setShowLogin(false);
    showToast(`欢迎回来, ${loggedInUser.nickname}`, 'success');
    await fetchUserResources(loggedInUser);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('unistream_user');
    setNeteasePlaylists([]);
    showToast('已退出登录', 'info');
  };

  const addToPlayHistory = (song: Song) => {
      setPlayHistory(prev => {
          const filtered = prev.filter(s => s.id !== song.id);
          return [song, ...filtered].slice(0, 50); // Keep last 50
      });
  };

  const playSong = async (song: Song, newQueue?: Song[]) => {
    setIsPlaying(false);
    setCurrentSong(song);
    addToPlayHistory(song);
    if (newQueue) setQueue(newQueue);

    try {
        const details = await musicService.getSongDetails(song, quality);
        
        if (details.url) {
            const updatedSong: Song = { 
                ...song, 
                audioUrl: details.url, 
                lyric: details.lyric || song.lyric 
            };
            
            setCurrentSong(updatedSong);
            setQueue(prev => prev.map(s => s.id === song.id ? updatedSong : s));
            setIsPlaying(true);
        } else {
             throw new Error("NO_URL");
        }
    } catch (e: any) {
        setIsPlaying(false);
        if (e.message === "VIP_REQUIRED") {
            showToast('VIP 歌曲，无法播放', 'error');
        } else {
            showToast('资源加载失败', 'error');
        }
    }
  };

  // Re-fetch when quality changes
  useEffect(() => {
      if(currentSong && isPlaying) {
          playSong(currentSong);
          showToast(`切换音质: ${quality}`, 'info');
      }
  }, [quality]);

  const togglePlayPause = () => setIsPlaying(!isPlaying);

  const handleNext = () => {
    if (!currentSong) return;
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    const nextSong = queue[(currentIndex + 1) % queue.length];
    if (nextSong) playSong(nextSong);
  };

  const handlePrev = () => {
    if (!currentSong) return;
    const currentIndex = queue.findIndex(s => s.id === currentSong.id);
    const prevSong = queue[(currentIndex - 1 + queue.length) % queue.length];
    if (prevSong) playSong(prevSong);
  };

  const handleDownload = async (song: Song) => {
      showToast(`正在解析下载地址: ${song.title}`, 'loading');
      try {
          // Always try 'lossless' to get best possible link
          const details = await musicService.getSongDetails(song, 'lossless');
          if (!details.url) throw new Error("No URL");
          
          showToast('调用系统下载器...', 'success');
          // Use system browser/downloader for best stability
          window.open(details.url, '_system');
      } catch (e) {
          showToast('下载解析失败', 'error');
      }
  };

  const handleToggleLike = (song: Song) => {
      const favList = playlists.find(p => p.id === 'fav');
      if (!favList) return;
      const exists = favList.songs.some(s => s.id === song.id);
      let newSongs;
      if (exists) {
          newSongs = favList.songs.filter(s => s.id !== song.id);
          showToast('已取消收藏', 'info');
      } else {
          newSongs = [song, ...favList.songs];
          showToast('已收藏', 'success');
      }
      setPlaylists(playlists.map(p => p.id === 'fav' ? { ...p, songs: newSongs } : p));
  };

  const handlePlayNext = (song: Song) => {
      if (!currentSong) {
          playSong(song, [song]);
          return;
      }
      const currentIndex = queue.findIndex(s => s.id === currentSong.id);
      if (currentIndex === -1) {
           setQueue([...queue, song]);
      } else {
           const newQueue = [...queue];
           newQueue.splice(currentIndex + 1, 0, song);
           setQueue(newQueue);
      }
      showToast('已添加到下一首', 'success');
  };

  const isLiked = (song: Song | null) => {
      if (!song) return false;
      return playlists.find(p => p.id === 'fav')?.songs.some(s => s.id === song.id) || false;
  };

  const handleArtistClick = async (artistId: string) => {
      if (!artistId) return;
      showToast('正在获取歌手信息...', 'loading');
      try {
          const { artist, songs } = await musicService.getArtistDetail(artistId);
          setActiveArtist({ info: artist, songs });
          setView('ARTIST_DETAIL');
      } catch (e) {
          showToast('获取歌手信息失败', 'error');
      }
  };
  
  const handleNeteasePlaylistClick = async (pl: Playlist) => {
      showToast(`正在获取歌单详情: ${pl.name}`, 'loading');
      try {
          const songs = await musicService.importNeteasePlaylist(pl.id);
          if (songs.length > 0) {
              const fullPl = { ...pl, songs };
              setActivePlaylist(fullPl);
          } else {
               showToast('歌单为空或获取失败', 'error');
          }
      } catch (e) {
          showToast('歌单获取失败', 'error');
      }
  };
  
  const handleDailyRecommend = async () => {
      if (!user) { setShowLogin(true); return; }
      showToast('正在获取每日推荐...', 'loading');
      const songs = await musicService.getDailyRecommendSongs();
      if (songs.length > 0) {
          const dailyPl: Playlist = {
              id: 'daily-recommend',
              name: '每日推荐',
              description: '根据你的口味生成',
              songs: songs,
              coverUrl: songs[0].coverUrl
          };
          setActivePlaylist(dailyPl);
      } else {
          showToast('获取失败，请确保已登录', 'error');
      }
  };

  const toggleFollowArtist = (artist: Artist) => {
      const exists = followedArtists.some(a => a.id === artist.id);
      if (exists) {
          setFollowedArtists(prev => prev.filter(a => a.id !== artist.id));
          showToast('已取消关注', 'info');
      } else {
          setFollowedArtists(prev => [...prev, artist]);
          showToast('已关注歌手', 'success');
      }
  };

  const isFollowed = (artistId: string) => followedArtists.some(a => a.id === artistId);

  // Progressive Search Handler
  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!searchQuery.trim()) return;
      
      if(!searchHistory.includes(searchQuery)) {
          setSearchHistory(prev => [searchQuery, ...prev].slice(0, 10));
      }

      setSearchLoading(true);
      setSearchResults([]); // Clear old results
      
      // Use the new streaming method
      await musicService.searchMusic(searchQuery, (newSongs) => {
          setSearchResults(prev => {
              // Simple deduplication based on ID
              const existingIds = new Set(prev.map(s => s.id));
              const uniqueNewSongs = newSongs.filter(s => !existingIds.has(s.id));
              return [...prev, ...uniqueNewSongs];
          });
      });
      
      setSearchLoading(false);
  };

  // --- Handlers ---

  const handleTextImport = async () => { setShowImport(false); };
  const handleNeteaseImport = async () => { setShowNeteaseImport(false); };
  const handleLocalFileClick = () => { localFileInputRef.current?.click(); };
  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { /* TODO: Implement Local File Player */ };
  const createPlaylist = () => { /* TODO */ };
  const handleImportPluginFileClick = () => { fileInputRef.current?.click(); };
  
  // PLUGIN IMPORT HANDLER
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setPluginLoading(true);
      const reader = new FileReader();
      
      reader.onload = async (event) => {
          const content = event.target?.result as string;
          if (content) {
              const success = await musicService.importPlugin(content);
              if (success) {
                  setInstalledPlugins([...musicService.getPlugins()]);
                  showToast('插件导入成功', 'success');
                  // Persist
                  const currentSaved = JSON.parse(localStorage.getItem('unistream_plugins_code') || '[]');
                  // Avoid dupes by basic string compare
                  if (!currentSaved.includes(content)) {
                      currentSaved.push(content);
                      try {
                          localStorage.setItem('unistream_plugins_code', JSON.stringify(currentSaved));
                      } catch(e) {
                          showToast('插件较大，无法持久化缓存', 'info');
                      }
                  }
              } else {
                  showToast('插件解析失败，格式不正确', 'error');
              }
              setPluginLoading(false);
          }
      };
      
      reader.onerror = () => {
          showToast('读取文件失败', 'error');
          setPluginLoading(false);
      };

      reader.readAsText(file);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveCustomUrl = () => { setSettings(s => ({ ...s, customInvidious: settings.customInvidious })); showToast('设置已保存', 'success'); };

  const songItemProps = (song: Song) => ({
      song,
      onClick: () => playSong(song, view === 'SEARCH' ? searchResults : (view === 'LIBRARY' && activePlaylist ? activePlaylist.songs : (view === 'ARTIST_DETAIL' && activeArtist ? activeArtist.songs : queue))),
      isCurrent: currentSong?.id === song.id,
      onToggleLike: () => handleToggleLike(song),
      onDownload: () => handleDownload(song),
      onPlayNext: () => handlePlayNext(song),
      isLiked: isLiked(song),
      isOpenMenu: menuSong?.id === song.id,
      onOpenMenu: () => setMenuSong(song),
      onArtistClick: handleArtistClick
  });

  const getLatencyColor = (ms: number) => {
      if (ms < 0) return 'text-red-500';
      if (ms < 200) return 'text-green-500';
      if (ms < 500) return 'text-yellow-500';
      return 'text-red-400';
  };
  
  const getStatusColor = (status: string) => {
      switch(status) {
          case 'ok': return 'text-green-400';
          case 'error': return 'text-red-400';
          case 'pending': return 'text-yellow-400';
          default: return 'text-gray-400';
      }
  };

  const renderHome = () => (
    <div className="space-y-8 animate-fade-in pb-40">
      <div className="relative h-48 md:h-64 rounded-2xl bg-gradient-to-r from-gray-900 to-primary overflow-hidden flex items-center p-6 shadow-2xl">
        <div className="relative z-10 w-full">
          <h1 className="text-3xl font-bold mb-2">UniStream</h1>
          <p className="text-gray-200 mb-4 max-w-md text-sm md:text-base">
            聚合音乐播放器 V2.4<br/>
            <span className="text-xs opacity-75">智能节点切换 / 底部菜单优化 / 歌单同步</span>
          </p>
          <div className="flex gap-2">
             <div className="text-xs bg-white/20 px-2 py-1 rounded">访客身份已生成</div>
          </div>
        </div>
      </div>

      {user && (
          <div onClick={handleDailyRecommend} className="bg-gradient-to-r from-netease to-red-800 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:scale-[1.02] transition-transform">
              <div className="flex items-center gap-4">
                  <div className="bg-white/20 p-3 rounded-full"><NeteaseIcon className="text-white" /></div>
                  <div>
                      <h3 className="font-bold text-lg">每日推荐</h3>
                      <p className="text-xs text-white/70">根据你的音乐口味生成</p>
                  </div>
              </div>
              <PlayIcon fill="white" />
          </div>
      )}

      <div className="bg-dark-light p-4 rounded-xl border border-white/5">
          <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">最近播放</h3>
              <button onClick={() => setPlayHistory([])} className="text-xs text-gray-500 hover:text-red-400"><TrashIcon size={14} /></button>
          </div>
          {playHistory.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">暂无听歌记录</p>
          ) : (
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {playHistory.map((song, i) => (
                      <div key={i} className="flex-shrink-0 w-24 cursor-pointer group" onClick={() => playSong(song)}>
                          <div className="relative aspect-square rounded-lg overflow-hidden mb-2">
                              <SecureImage src={song.coverUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                          </div>
                          <p className="text-xs truncate text-gray-300">{song.title}</p>
                      </div>
                  ))}
              </div>
          )}
      </div>
    </div>
  );

  const renderLibrary = () => (
      <div className="pb-40 animate-fade-in relative">
          {!activePlaylist ? (
              <>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">我的音乐</h2>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                        <input type="file" ref={localFileInputRef} accept="audio/*" multiple className="hidden" onChange={handleLocalFileChange} />
                        <button onClick={handleLocalFileClick} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
                            本地
                        </button>
                        <button onClick={() => setShowNeteaseImport(true)} className="bg-netease/20 hover:bg-netease/30 text-netease px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
                            云歌单
                        </button>
                        <button onClick={() => setShowImport(true)} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
                            搜歌导入
                        </button>
                        <button onClick={createPlaylist} className="bg-primary/20 hover:bg-primary/30 text-primary px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
                            <PlaylistAddIcon className="w-4 h-4" /> 新建
                        </button>
                    </div>
                </div>
                
                <div onClick={() => !user ? setShowLogin(true) : null} className="bg-white/5 p-4 rounded-xl flex items-center gap-4 mb-6 cursor-pointer hover:bg-white/10 transition-colors">
                    <div className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden">
                        {user?.avatarUrl ? <SecureImage src={user.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400">?</div>}
                    </div>
                    <div>
                        <div className="font-bold text-lg">{user ? user.nickname : '点击登录网易云'}</div>
                        <div className="text-xs text-gray-400">{user ? (user.isVip ? 'VIP用户' : '普通用户') : '游客模式 (随机ID)'}</div>
                    </div>
                    {user && <button onClick={(e) => {e.stopPropagation(); handleLogout();}} className="ml-auto text-xs text-red-400 border border-red-400 px-2 py-1 rounded">退出</button>}
                </div>

                <div className="mb-6">
                    <h3 className="font-bold text-lg mb-3">关注歌手</h3>
                    {followedArtists.length === 0 ? (
                        <p className="text-xs text-gray-500">暂无关注</p>
                    ) : (
                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                             {followedArtists.map(artist => (
                                 <div key={artist.id} className="flex-shrink-0 w-20 text-center cursor-pointer" onClick={() => handleArtistClick(artist.id)}>
                                     <SecureImage src={artist.coverUrl} className="w-20 h-20 rounded-full object-cover mb-2 border-2 border-transparent hover:border-primary transition-colors" />
                                     <p className="text-xs truncate">{artist.name}</p>
                                 </div>
                             ))}
                        </div>
                    )}
                </div>

                <h3 className="font-bold text-lg mb-3">我的歌单</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                    {playlists.map(pl => (
                        <div key={pl.id} onClick={() => setActivePlaylist(pl)} className="group cursor-pointer">
                            <div className="relative aspect-square rounded-xl overflow-hidden mb-2 bg-gray-800 border border-white/5">
                                {pl.coverUrl && <SecureImage src={pl.coverUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                                {pl.id === 'fav' && <div className="absolute top-2 right-2 bg-netease/80 p-1.5 rounded-full"><HeartIcon size={12} fill="white" /></div>}
                            </div>
                            <h3 className="font-bold truncate">{pl.name}</h3>
                            <p className="text-xs text-gray-400">{pl.songs.length} 首歌曲</p>
                        </div>
                    ))}
                </div>

                {neteasePlaylists.length > 0 && (
                    <>
                        <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><NeteaseIcon size={20} /> 网易云歌单</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {neteasePlaylists.map(pl => (
                                <div key={pl.id} onClick={() => handleNeteasePlaylistClick(pl)} className="group cursor-pointer">
                                    <div className="relative aspect-square rounded-xl overflow-hidden mb-2 bg-gray-800 border border-white/5">
                                        <SecureImage src={pl.coverUrl!} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                                    </div>
                                    <h3 className="font-bold truncate">{pl.name}</h3>
                                    <p className="text-xs text-gray-400">云端歌单</p>
                                </div>
                            ))}
                        </div>
                    </>
                )}
              </>
          ) : (
              <div>
                  <button onClick={() => setActivePlaylist(null)} className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">← 返回</button>
                  <div className="flex items-center gap-6 mb-8">
                      <SecureImage src={activePlaylist.coverUrl!} className="w-32 h-32 rounded-xl shadow-lg" />
                      <div>
                          <h2 className="text-2xl font-bold mb-2">{activePlaylist.name}</h2>
                          <button onClick={() => { if(activePlaylist.songs.length) playSong(activePlaylist.songs[0], activePlaylist.songs) }} className="bg-primary hover:bg-indigo-600 text-white px-6 py-2 rounded-full flex items-center gap-2">
                                <PlayIcon className="w-4 h-4 fill-current" /> 播放全部
                          </button>
                      </div>
                  </div>
                  <div className="space-y-1">
                      {activePlaylist.songs.map((song, idx) => (
                          <div key={idx} className="flex items-center group p-3 rounded-lg hover:bg-white/5 relative">
                              <span className="text-gray-500 w-8 text-center">{idx + 1}</span>
                              <div className="flex-1 cursor-pointer min-w-0 mr-12" onClick={() => playSong(song, activePlaylist.songs)}>
                                  <div className={`font-medium truncate ${currentSong?.id === song.id ? 'text-primary' : 'text-white'}`}>{song.title}</div>
                                  <div className="text-xs text-gray-400 truncate">{song.artist}</div>
                              </div>
                              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                 <button onClick={() => setMenuSong(song)} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10">
                                     <MoreVerticalIcon size={18} />
                                 </button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>
  );
  
  const renderArtistDetail = () => {
      if (!activeArtist) return null;
      const isFollowedArtist = isFollowed(activeArtist.info.id);

      return (
          <div className="pb-40 animate-fade-in">
               <button onClick={() => setView('LIBRARY')} className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">← 返回我的音乐</button>
               <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
                   <SecureImage src={activeArtist.info.coverUrl} className="w-40 h-40 rounded-full object-cover shadow-2xl border-4 border-white/10" />
                   <div className="text-center md:text-left">
                       <h2 className="text-3xl font-bold mb-2">{activeArtist.info.name}</h2>
                       <p className="text-gray-400 text-sm mb-4 line-clamp-3 max-w-lg">{activeArtist.info.description || '暂无简介'}</p>
                       <div className="flex gap-3 justify-center md:justify-start">
                           <button onClick={() => toggleFollowArtist(activeArtist.info)} className={`px-6 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-colors ${isFollowedArtist ? 'bg-white/10 text-white' : 'bg-netease text-white'}`}>
                               {isFollowedArtist ? <><UserCheckIcon size={16}/> 已关注</> : <><UserPlusIcon size={16}/> 关注</>}
                           </button>
                           <button onClick={() => playSong(activeArtist.songs[0], activeArtist.songs)} className="bg-primary hover:bg-indigo-600 text-white px-6 py-2 rounded-full flex items-center gap-2">
                                <PlayIcon className="w-4 h-4 fill-current" /> 播放热门
                          </button>
                       </div>
                   </div>
               </div>
               
               <h3 className="font-bold text-xl mb-4">热门 50 首</h3>
               <div className="space-y-1">
                   {activeArtist.songs.map((song, idx) => (
                      <div key={idx} className="flex items-center group p-3 rounded-lg hover:bg-white/5 relative">
                          <span className="text-gray-500 w-8 text-center">{idx + 1}</span>
                          <div className="flex-1 cursor-pointer min-w-0 mr-12" onClick={() => playSong(song, activeArtist.songs)}>
                              <div className={`font-medium truncate ${currentSong?.id === song.id ? 'text-primary' : 'text-white'}`}>{song.title}</div>
                              <div className="text-xs text-gray-400 truncate">{song.album}</div>
                          </div>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                             <button onClick={() => setMenuSong(song)} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10">
                                 <MoreVerticalIcon size={18} />
                             </button>
                          </div>
                      </div>
                   ))}
               </div>
          </div>
      );
  };

  const renderSearch = () => {
      const filteredResults = searchResults.filter(s => {
          if (activeTab === 'ALL') return true;
          if (activeTab === 'NETEASE') return s.source === MusicSource.NETEASE;
          if (activeTab === 'BILIBILI') return s.source === MusicSource.BILIBILI;
          if (activeTab === 'PLUGIN') return s.source === MusicSource.PLUGIN;
          if (activeTab === 'YOUTUBE') return s.source === MusicSource.YOUTUBE;
          return true;
      });

      return (
      <div className="pb-40 animate-fade-in">
           <form onSubmit={handleSearch} className="mb-4 sticky top-0 bg-dark z-20 py-4 shadow-xl">
                <div className="relative">
                    <SearchIcon className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索全网音乐..." className="w-full bg-dark-light border border-white/10 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors"/>
                </div>
           </form>
           
           {(searchResults.length > 0 || searchLoading) && (
               <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar px-1 sticky top-20 bg-dark z-10 py-2">
                    {[
                        { id: 'ALL', label: '全部' },
                        { id: 'NETEASE', label: '网易云' },
                        { id: 'BILIBILI', label: 'Bilibili' },
                        { id: 'YOUTUBE', label: 'YouTube' },
                        { id: 'PLUGIN', label: '扩展插件' }
                    ].map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                                activeTab === tab.id 
                                ? 'bg-primary text-white shadow-lg shadow-primary/30' 
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
               </div>
           )}

           {!searchQuery && searchHistory.length > 0 && searchResults.length === 0 && !searchLoading && (
               <div className="mb-8 animate-fade-in">
                   <div className="flex justify-between items-center mb-3 px-1">
                       <h3 className="text-sm font-bold text-gray-400">历史搜索</h3>
                       <button onClick={() => setSearchHistory([])} className="text-gray-500 hover:text-red-400"><TrashIcon size={14} /></button>
                   </div>
                   <div className="flex flex-wrap gap-2">
                       {searchHistory.map((item, i) => (
                           <span key={i} onClick={() => setSearchQuery(item)} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-full text-xs cursor-pointer text-gray-300 transition-colors">
                               {item}
                           </span>
                       ))}
                   </div>
               </div>
           )}
           
           {searchResults.length > 0 && (
               <div className="space-y-2">
                   {filteredResults.map(song => <SongItem key={song.id} {...songItemProps(song)} />)}
               </div>
           )}
           
           {searchLoading && (
               <div className="flex justify-center py-6 animate-fade-in">
                   <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full">
                       <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                       <span className="text-xs text-gray-400">正在加载更多来源...</span>
                   </div>
               </div>
           )}
           
           {!searchLoading && searchResults.length === 0 && searchQuery && (
               <div className="text-center text-gray-500 py-10">未找到结果</div>
           )}
      </div>
      );
  };
  
  const renderLabs = () => (
    <div className="pb-40 animate-fade-in">
         <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><LabIcon /> 实验室</h2>
         <div className="bg-white/5 p-4 rounded-xl mb-6">
             <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold">网络诊断</h3>
                 <button onClick={runDiagnostics} disabled={isRunningDiagnostics} className="bg-primary hover:bg-primary/80 px-3 py-1 rounded text-xs transition-colors">
                     {isRunningDiagnostics ? '检测中...' : '开始检测'}
                 </button>
             </div>
             <div className="space-y-2">
                 {diagnosticResults.map((res, i) => (
                     <div key={i} className="flex justify-between text-sm p-2 bg-black/20 rounded">
                         <span>{res.name}</span>
                         <div className="flex gap-4">
                             <span className={getLatencyColor(res.latency)}>{res.latency > 0 ? `${res.latency}ms` : '-'}</span>
                             <span className={getStatusColor(res.status)}>{res.status}</span>
                         </div>
                     </div>
                 ))}
                 {diagnosticResults.length === 0 && <p className="text-gray-500 text-xs">点击开始检测查看连接状态</p>}
             </div>
         </div>
         <div className="bg-white/5 p-4 rounded-xl mb-6">
             <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold">插件管理</h3>
                 <input type="file" ref={fileInputRef} className="hidden" accept=".js,.json" onChange={handleFileChange} />
                 <button onClick={handleImportPluginFileClick} className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-xs flex items-center gap-2 transition-colors">
                     <PluginFileIcon size={14} /> 导入插件
                 </button>
             </div>
             {installedPlugins.length === 0 ? (
                 <p className="text-gray-500 text-xs">暂无插件，支持导入 .js / .json 格式插件 (MusicFree 规范)</p>
             ) : (
                 <div className="space-y-2">
                     {installedPlugins.map(p => (
                         <div key={p.id} className="flex justify-between items-center p-3 bg-black/20 rounded">
                             <div>
                                 <div className="font-bold text-sm">{p.name} <span className="text-xs text-gray-500">v{p.version}</span></div>
                                 <div className="text-xs text-gray-400">{p.author}</div>
                             </div>
                             <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded">已启用</span>
                         </div>
                     ))}
                 </div>
             )}
             {pluginLoading && <div className="text-center text-xs text-gray-400 mt-2">正在处理...</div>}
         </div>
         <div className="bg-black/30 p-4 rounded-xl font-mono text-xs text-gray-400 h-48 overflow-y-auto border border-white/5">
             <div className="flex justify-between mb-2 sticky top-0 bg-transparent">
                 <span className="font-bold text-gray-300">系统日志</span>
                 <button onClick={() => musicService.clearLogs()} className="text-red-400 hover:text-red-300">清空</button>
             </div>
             {debugLogs.length === 0 ? <p>暂无日志</p> : debugLogs.map((log, i) => (
                 <div key={i} className="border-b border-white/5 py-1 whitespace-pre-wrap">{log}</div>
             ))}
         </div>
    </div>
  );

  const renderSettings = () => (
    <div className="pb-40 animate-fade-in">
         <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><SettingsIcon /> 设置</h2>
         <div className="space-y-6">
             <div className="bg-white/5 p-4 rounded-xl">
                 <h3 className="font-bold mb-4 border-b border-white/10 pb-2">基础设置</h3>
                 <div className="mb-4">
                     <label className="block text-xs text-gray-400 mb-1">后端 API 地址 (Node Server)</label>
                     <input type="text" value={settings.apiBaseUrl} onChange={(e) => setSettings({...settings, apiBaseUrl: e.target.value})} placeholder="http://192.168.1.5:3001" className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm focus:border-primary focus:outline-none"/>
                     <p className="text-[10px] text-gray-500 mt-1">必填：用于 Bilibili/YouTube 代理及播放</p>
                 </div>
                 <div className="mb-4">
                     <label className="block text-xs text-gray-400 mb-1">Invidious 实例 (YouTube Mirror)</label>
                     <input type="text" value={settings.customInvidious} onChange={(e) => setSettings({...settings, customInvidious: e.target.value})} placeholder="https://inv.tux.pizza" className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm focus:border-primary focus:outline-none"/>
                 </div>
                 <div className="mb-4">
                     <label className="block text-xs text-gray-400 mb-1">搜索超时 (秒)</label>
                     <input type="number" value={settings.searchTimeout} onChange={(e) => setSettings({...settings, searchTimeout: parseInt(e.target.value) || 10})} className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm focus:border-primary focus:outline-none"/>
                 </div>
                 <button onClick={handleSaveCustomUrl} className="bg-primary hover:bg-primary/80 transition-colors px-4 py-2 rounded-lg text-sm font-bold w-full shadow-lg shadow-primary/20">保存设置</button>
             </div>
             <div className="bg-white/5 p-4 rounded-xl">
                 <h3 className="font-bold mb-4 border-b border-white/10 pb-2">关于</h3>
                 <div className="text-sm text-gray-400 space-y-2">
                     <p className="flex items-center gap-2"><SmartphoneIcon size={16}/> UniStream Music Player v2.5</p>
                     <p>Core Upgrade: youtubei.js + Native Backend Proxy + Native SecureImage</p>
                 </div>
             </div>
         </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark text-white flex flex-col md:flex-row">
      <Toast message={toast.msg} type={toast.type} isVisible={toast.show} onClose={() => setToast(t => ({...t, show: false}))} />
      
      <div className="hidden md:flex flex-col w-64 border-r border-white/5 p-6 bg-dark">
        <div className="flex items-center gap-2 mb-10 text-xl font-bold tracking-tight">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center"><span className="text-white text-xs">U</span></div>
            UniStream
        </div>
        <nav className="space-y-2 flex-1">
          <NavBtn icon={<HomeIcon />} label="首页" active={view === 'HOME'} onClick={() => setView('HOME')} />
          <NavBtn icon={<SearchIcon />} label="搜索" active={view === 'SEARCH'} onClick={() => setView('SEARCH')} />
          <NavBtn icon={<LibraryIcon />} label="我的音乐" active={view === 'LIBRARY'} onClick={() => setView('LIBRARY')} />
          <div className="pt-4 pb-2 text-xs text-gray-500 font-bold px-4">扩展</div>
          <NavBtn icon={<LabIcon />} label="实验室" active={view === 'LABS'} onClick={() => setView('LABS')} />
          <NavBtn icon={<SettingsIcon />} label="设置" active={view === 'SETTINGS'} onClick={() => setView('SETTINGS')} />
        </nav>
      </div>

      <div className="flex-1 h-screen overflow-y-auto no-scrollbar relative">
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
          {view === 'HOME' && renderHome()}
          {view === 'SEARCH' && renderSearch()}
          {view === 'LABS' && renderLabs()}
          {view === 'LIBRARY' && renderLibrary()}
          {view === 'ARTIST_DETAIL' && renderArtistDetail()}
          {view === 'SETTINGS' && renderSettings()}
        </div>
      </div>
      
      {menuSong && (
          <SongItemMenu 
              song={menuSong} 
              isLiked={isLiked(menuSong)} 
              onToggleLike={() => handleToggleLike(menuSong)}
              onDownload={() => handleDownload(menuSong)}
              onPlayNext={() => handlePlayNext(menuSong)}
              isOpen={!!menuSong}
              setOpen={() => setMenuSong(null)}
              onArtistClick={handleArtistClick}
          />
      )}

      <div className={`md:hidden fixed left-0 right-0 bg-dark-light/90 backdrop-blur-lg border-t border-white/5 flex justify-around items-center py-3 pb-safe z-40 transition-[bottom] duration-300 ${currentSong ? 'bottom-16' : 'bottom-0'}`}>
          <MobileNavBtn icon={<HomeIcon />} label="首页" active={view === 'HOME'} onClick={() => setView('HOME')} />
          <MobileNavBtn icon={<SearchIcon />} label="搜索" active={view === 'SEARCH'} onClick={() => setView('SEARCH')} />
          <MobileNavBtn icon={<LibraryIcon />} label="我的" active={view === 'LIBRARY'} onClick={() => setView('LIBRARY')} />
          <MobileNavBtn icon={<LabIcon />} label="实验室" active={view === 'LABS'} onClick={() => setView('LABS')} />
          <MobileNavBtn icon={<SettingsIcon />} label="设置" active={view === 'SETTINGS'} onClick={() => setView('SETTINGS')} />
      </div>

      <div className={`transition-all duration-300 ${currentSong ? 'mb-16 md:mb-0' : ''}`}>
         <Player 
            currentSong={currentSong} 
            isPlaying={isPlaying} 
            onPlayPause={togglePlayPause} 
            onNext={handleNext} 
            onPrev={handlePrev} 
            onToggleLike={handleToggleLike} 
            onDownload={handleDownload} 
            isLiked={isLiked(currentSong)} 
            quality={quality}
            setQuality={setQuality}
         />
      </div>

      {showLogin && <LoginModal onLogin={handleLoginSuccess} onClose={() => setShowLogin(false)} />}
    </div>
  );
}

const NavBtn = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-white/10 text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
    {React.cloneElement(icon, { size: 20 })}
    <span>{label}</span>
  </button>
);

const MobileNavBtn = ({ icon, label, active, onClick }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center space-y-1 ${active ? 'text-white' : 'text-gray-500'}`}>
        {React.cloneElement(icon, { size: 20 })}
        <span className="text-[10px]">{label}</span>
    </button>
);

interface SongItemProps {
  song: Song;
  onClick: () => void;
  isCurrent: boolean;
  onToggleLike: () => void;
  onDownload: () => void;
  onPlayNext: () => void;
  isLiked: boolean;
  isOpenMenu: boolean;
  onOpenMenu: () => void;
  onArtistClick: (id: string) => void;
}

const SongItem: React.FC<SongItemProps> = ({ song, onClick, isCurrent, onOpenMenu, onArtistClick }) => (
  <div onClick={onClick} className={`group flex items-center p-3 rounded-xl cursor-pointer transition-colors ${isCurrent ? 'bg-white/10' : 'hover:bg-white/5'}`}>
    <div className="relative w-12 h-12 rounded-lg overflow-hidden mr-4 flex-shrink-0">
      <SecureImage src={song.coverUrl} alt={song.title} className={`w-full h-full object-cover ${song.isGray ? 'grayscale opacity-50' : ''}`} />
      <div className={`absolute inset-0 bg-black/40 flex items-center justify-center ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {isCurrent ? <div className="w-3 h-3 bg-white rounded-full animate-pulse"/> : <PlayIcon size={16} className="text-white"/>}
      </div>
    </div>
    <div className="flex-1 min-w-0">
      <h3 className={`font-medium text-sm truncate ${isCurrent ? 'text-primary' : (song.isGray ? 'text-gray-500' : 'text-white')}`}>
          {song.title}
          {song.fee === 1 && <span className="ml-2 text-[9px] bg-netease text-white rounded px-1">VIP</span>}
      </h3>
      <p className="text-xs text-gray-400 truncate flex items-center gap-1">
        {song.source === MusicSource.NETEASE && <span className="text-[9px] px-1 rounded bg-gray-800 text-netease/80">网易云</span>}
        {song.source === MusicSource.BILIBILI && <span className="text-[9px] px-1 rounded bg-pink-500/20 text-pink-400">Bilibili</span>}
        {song.source === MusicSource.YOUTUBE && <span className="text-[9px] px-1 rounded bg-gray-800 text-youtube/80">YouTube</span>}
        {song.source === MusicSource.PLUGIN && <span className="text-[9px] px-1 rounded bg-gray-800 text-primary/80">Plugin</span>}
        {song.source === MusicSource.LOCAL && <span className="text-[9px] px-1 rounded bg-gray-600 text-white/80">本地</span>}
        <span onClick={(e) => {
            if (song.artistId && onArtistClick) {
                e.stopPropagation();
                onArtistClick(song.artistId);
            }
        }} className={song.artistId ? "hover:underline hover:text-white cursor-pointer" : ""}>{song.artist}</span> 
        <span>• {song.album}</span>
      </p>
    </div>
    <div className="flex items-center gap-2 ml-2" onClick={e => e.stopPropagation()}>
         <button onClick={() => onOpenMenu()} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10">
             <MoreVerticalIcon size={18} />
         </button>
    </div>
  </div>
);

const SongItemMenu = ({ song, isLiked, onToggleLike, onDownload, onPlayNext, isOpen, setOpen, onArtistClick }: any) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex justify-center items-end md:items-center animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}></div>
            <div className="bg-dark-light w-full md:w-80 rounded-t-2xl md:rounded-2xl border border-white/10 shadow-2xl z-10 p-4 pb-safe animate-slide-up transform transition-transform">
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/5">
                    <SecureImage src={song.coverUrl} className="w-12 h-12 rounded-lg bg-gray-800 object-cover" />
                    <div className="flex-1 min-w-0">
                        <h4 className="font-bold truncate text-sm">{song.title}</h4>
                        <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                    </div>
                </div>
                <div className="space-y-1">
                    <button onClick={() => { onPlayNext(); setOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 rounded-lg flex items-center gap-3 text-white transition-colors">
                        <NextPlanIcon size={18} /> 下一首播放
                    </button>
                    <button onClick={() => { onToggleLike(); setOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 rounded-lg flex items-center gap-3 text-white transition-colors">
                        <HeartIcon size={18} fill={isLiked ? "currentColor" : "none"} className={isLiked ? "text-netease" : ""} /> {isLiked ? "取消收藏" : "收藏"}
                    </button>
                    <button onClick={() => { onDownload(); setOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 rounded-lg flex items-center gap-3 text-white transition-colors">
                        <DownloadIcon size={18} /> 下载 (跳转浏览器)
                    </button>
                    {song.artistId && (
                        <button onClick={() => { onArtistClick(song.artistId); setOpen(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 rounded-lg flex items-center gap-3 text-white transition-colors">
                            <UserCheckIcon size={18} /> 查看歌手
                        </button>
                    )}
                </div>
                <button onClick={() => setOpen(false)} className="w-full mt-4 py-3 text-center text-gray-500 hover:text-white border-t border-white/5 md:hidden">
                    关闭
                </button>
            </div>
        </div>
    );
};
