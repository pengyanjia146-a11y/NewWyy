
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
  const [pluginUrl, setPluginUrl] = useState('');

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
      let newSongs = [];
      
      if (exists) {
          newSongs = favList.songs.filter(s => s.id !== song.id);
          showToast('已取消喜欢', 'info');
      } else {
          newSongs = [song, ...favList.songs];
          showToast('已添加到喜欢', 'success');
      }
      
      const newPlaylists = playlists.map(p => p.id === 'fav' ? { ...p, songs: newSongs } : p);
      setPlaylists(newPlaylists);
  };
  
  // New Feature: Install Plugin from URL
  const handleUrlInstall = async () => {
      if (!pluginUrl) return;
      setPluginLoading(true);
      showToast('正在下载插件...', 'loading');
      try {
          const res = await musicService.installPluginFromUrl(pluginUrl);
          if (res.success && res.code) {
              // Save Code Persistence
              const savedCodes = JSON.parse(localStorage.getItem('unistream_plugins_code') || '[]');
              // Avoid dupes simply by pushing, or can filter. Plugins are deduped by platform ID in service.
              savedCodes.push(res.code);
              localStorage.setItem('unistream_plugins_code', JSON.stringify(savedCodes));

              setInstalledPlugins([...musicService.getPlugins()]);
              setPluginUrl('');
              showToast('插件安装成功', 'success');
          } else {
              showToast('插件无效或下载失败', 'error');
          }
      } catch(e) {
          showToast('安装过程出错', 'error');
      } finally {
          setPluginLoading(false);
      }
  };

  const handleSearch = async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!searchQuery.trim()) return;
      
      setSearchLoading(true);
      setSearchResults([]);
      
      // Update History
      if (!searchHistory.includes(searchQuery)) {
          setSearchHistory([searchQuery, ...searchHistory].slice(0, 10));
      }

      musicService.searchMusic(searchQuery, (songs) => {
          setSearchResults(prev => {
              // Simple dedupe
              const existingIds = new Set(prev.map(s => s.id));
              const newItems = songs.filter(s => !existingIds.has(s.id));
              return [...prev, ...newItems];
          });
      }).finally(() => setSearchLoading(false));
  };

  const renderHome = () => (
      <div className="p-4 space-y-6 pb-24 animate-fade-in">
          <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-netease to-purple-500 bg-clip-text text-transparent">UniStream</h1>
              <div className="flex items-center gap-3">
                  {user ? (
                      <div className="flex items-center gap-2 bg-white/5 rounded-full pl-1 pr-3 py-1 cursor-pointer" onClick={handleLogout}>
                          <SecureImage src={user.avatarUrl} className="w-8 h-8 rounded-full" />
                          <span className="text-xs truncate max-w-[80px]">{user.nickname}</span>
                      </div>
                  ) : (
                      <button onClick={() => setShowLogin(true)} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors">登录</button>
                  )}
              </div>
          </div>
          
          {/* History / Recents */}
          {playHistory.length > 0 && (
              <div>
                  <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">最近播放</h3>
                  <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                      {playHistory.slice(0, 10).map(song => (
                          <div key={song.id} className="w-24 flex-shrink-0 cursor-pointer group" onClick={() => playSong(song)}>
                              <div className="w-24 h-24 rounded-lg overflow-hidden mb-2 relative">
                                  <SecureImage src={song.coverUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                              </div>
                              <p className="text-xs font-medium truncate">{song.title}</p>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {/* Fav Playlist */}
          <div className="bg-gradient-to-br from-red-900/40 to-black rounded-xl p-5 border border-white/5 relative overflow-hidden group cursor-pointer" onClick={() => { setActivePlaylist(playlists[0]); setView('LIBRARY'); }}>
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-500">
                  <HeartIcon size={120} fill="currentColor" />
              </div>
              <h3 className="text-xl font-bold mb-1">我喜欢的音乐</h3>
              <p className="text-sm text-gray-400">{playlists[0].songs.length} 首歌曲</p>
              <div className="mt-4 flex -space-x-2">
                  {playlists[0].songs.slice(0,3).map(s => (
                      <SecureImage key={s.id} src={s.coverUrl} className="w-8 h-8 rounded-full border-2 border-black" />
                  ))}
              </div>
          </div>
      </div>
  );

  const renderSearch = () => (
      <div className="flex flex-col h-full pb-24">
          <div className="p-4 sticky top-0 bg-dark/95 backdrop-blur z-20">
              <form onSubmit={handleSearch} className="relative">
                  <input 
                      type="text" 
                      placeholder="搜索歌曲、视频、插件资源..." 
                      className="w-full bg-white/10 border border-white/5 rounded-full py-3 pl-12 pr-4 text-sm focus:bg-white/15 transition-all outline-none"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                  />
                  <SearchIcon className="absolute left-4 top-3 text-gray-400" size={20} />
              </form>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-0">
              {searchResults.length === 0 ? (
                  <div className="mt-4">
                      <h3 className="text-xs text-gray-500 font-bold mb-3">搜索历史</h3>
                      <div className="flex flex-wrap gap-2">
                          {searchHistory.map((h, i) => (
                              <span key={i} onClick={() => { setSearchQuery(h); handleSearch(); }} className="px-3 py-1 bg-white/5 rounded-full text-xs text-gray-300 active:bg-white/20">{h}</span>
                          ))}
                      </div>
                  </div>
              ) : (
                  <div className="space-y-2">
                      {searchResults.map((song, i) => (
                          <div key={`${song.id}-${i}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 group active:scale-[0.98] transition-all" onClick={() => playSong(song)}>
                              <div className="w-12 h-12 rounded bg-gray-800 flex-shrink-0 overflow-hidden relative">
                                  <SecureImage src={song.coverUrl} className="w-full h-full object-cover" />
                                  <div className="absolute bottom-0 right-0 bg-black/60 px-1 rounded-tl text-[10px] flex items-center">
                                      {song.source === MusicSource.NETEASE && <span className="text-netease">网</span>}
                                      {song.source === MusicSource.YOUTUBE && <span className="text-youtube">YT</span>}
                                      {song.source === MusicSource.BILIBILI && <span className="text-blue-400">B</span>}
                                      {song.source === MusicSource.PLUGIN && <span className="text-green-400">P</span>}
                                  </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                  <h4 className={`text-sm font-medium truncate ${song.isGray ? 'text-gray-500' : 'text-white'}`}>{song.title}</h4>
                                  <p className="text-xs text-gray-400 truncate">{song.artist} • {song.album}</p>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); handleToggleLike(song); }} className="text-gray-500 hover:text-red-500 p-2">
                                  <HeartIcon size={18} fill={playlists[0].songs.some(s=>s.id === song.id) ? "currentColor" : "none"} />
                              </button>
                          </div>
                      ))}
                      {searchLoading && <div className="text-center py-4 text-gray-500 text-xs">搜索中...</div>}
                  </div>
              )}
          </div>
      </div>
  );

  const renderLabs = () => (
      <div className="p-4 pb-24 space-y-8 h-full overflow-y-auto">
          <h2 className="text-2xl font-bold flex items-center gap-2"><LabIcon className="text-primary" /> 实验室</h2>

          {/* Plugin Manager - URL Install */}
          <div className="bg-white/5 rounded-xl p-5 border border-white/10">
              <h3 className="font-bold mb-4 flex items-center gap-2"><PluginFileIcon size={20} /> 插件管理</h3>
              
              <div className="flex gap-2 mb-4">
                  <input 
                      type="text" 
                      placeholder="输入插件 JS 链接 (例如 GitHub Raw)"
                      className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs"
                      value={pluginUrl}
                      onChange={e => setPluginUrl(e.target.value)}
                  />
                  <button 
                      onClick={handleUrlInstall}
                      disabled={pluginLoading}
                      className="bg-primary hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                  >
                      {pluginLoading ? '下载中...' : '安装'}
                  </button>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                  {installedPlugins.length === 0 ? <p className="text-xs text-gray-500">暂无插件</p> : installedPlugins.map((p, i) => (
                      <div key={i} className="flex justify-between items-center bg-white/5 p-2 rounded text-xs">
                          <div>
                              <span className="font-bold text-green-400">{p.name || p.platform}</span>
                              <span className="text-gray-500 ml-2">v{p.version}</span>
                          </div>
                          <span className="text-gray-600">已激活</span>
                      </div>
                  ))}
              </div>
          </div>

          {/* Diagnostics */}
          <div className="bg-white/5 rounded-xl p-5 border border-white/10">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold">网络与插件诊断</h3>
                  <button onClick={runDiagnostics} disabled={isRunningDiagnostics} className="text-xs bg-white/10 px-3 py-1 rounded hover:bg-white/20">
                      {isRunningDiagnostics ? '检测中...' : '开始检测'}
                  </button>
              </div>
              <div className="space-y-2">
                  {diagnosticResults.map((res, i) => (
                      <div key={i} className="flex justify-between text-xs border-b border-white/5 pb-1">
                          <span>{res.name}</span>
                          <span className={res.status === 'ok' ? 'text-green-500' : 'text-red-500'}>
                              {res.status.toUpperCase()} ({res.latency}ms)
                          </span>
                      </div>
                  ))}
              </div>
          </div>

          {/* Debug Console */}
          <div className="bg-black/40 rounded-xl p-4 font-mono text-[10px] text-green-400/80 h-48 overflow-y-auto border border-white/5">
              {debugLogs.length === 0 && <span className="text-gray-600">Waiting for logs...</span>}
              {debugLogs.map((log, i) => <div key={i}>{log}</div>)}
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 bg-dark text-white overflow-hidden flex flex-col font-sans select-none">
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
          {view === 'HOME' && renderHome()}
          {view === 'SEARCH' && renderSearch()}
          {view === 'LIBRARY' && <div className="p-4 text-center mt-20 text-gray-500">歌单库功能开发中... <br/>(当前请使用首页收藏入口)</div>}
          {view === 'LABS' && renderLabs()}
      </div>

      {/* Persistent Components */}
      <Player 
          currentSong={currentSong}
          isPlaying={isPlaying}
          onPlayPause={togglePlayPause}
          onNext={handleNext}
          onPrev={handlePrev}
          onToggleLike={handleToggleLike}
          onDownload={handleDownload}
          isLiked={currentSong ? playlists[0].songs.some(s => s.id === currentSong.id) : false}
          quality={quality}
          setQuality={setQuality}
      />

      <Toast 
          message={toast.msg} 
          type={toast.type} 
          isVisible={toast.show} 
          onClose={() => setToast(prev => ({ ...prev, show: false }))} 
      />

      {showLogin && <LoginModal onLogin={handleLoginSuccess} onClose={() => setShowLogin(false)} />}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-dark/95 border-t border-white/5 px-6 py-2 pb-safe flex justify-between items-center z-40 backdrop-blur-lg">
          <button onClick={() => setView('HOME')} className={`flex flex-col items-center gap-1 p-2 ${view === 'HOME' ? 'text-white' : 'text-gray-500'}`}>
              <HomeIcon size={24} />
              <span className="text-[10px] font-medium">首页</span>
          </button>
          <button onClick={() => setView('SEARCH')} className={`flex flex-col items-center gap-1 p-2 ${view === 'SEARCH' ? 'text-white' : 'text-gray-500'}`}>
              <SearchIcon size={24} />
              <span className="text-[10px] font-medium">搜索</span>
          </button>
          <button onClick={() => setView('LIBRARY')} className={`flex flex-col items-center gap-1 p-2 ${view === 'LIBRARY' ? 'text-white' : 'text-gray-500'}`}>
              <LibraryIcon size={24} />
              <span className="text-[10px] font-medium">音乐库</span>
          </button>
          <button onClick={() => setView('LABS')} className={`flex flex-col items-center gap-1 p-2 ${view === 'LABS' ? 'text-white' : 'text-gray-500'}`}>
              <LabIcon size={24} />
              <span className="text-[10px] font-medium">实验室</span>
          </button>
      </div>
    </div>
  );
}
