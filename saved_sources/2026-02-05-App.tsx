// Saved on 2026-02-05
// Original: App.tsx

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
		  // 默认在开发环境使用本地后端以避免浏览器 CORS/直连问题
		  apiBaseUrl: (process.env.NODE_ENV === 'development') ? 'http://localhost:3001' : '',
		  searchTimeout: 15 
	  };
	  return savedSettings ? { ...defaults, ...JSON.parse(savedSettings) } : defaults;
  });

  useEffect(() => {
	  localStorage.setItem('unistream_settings', JSON.stringify(settings));
	  musicService.setCustomInvidiousUrl(settings.customInvidious);
	  musicService.setApiBaseUrl(settings.apiBaseUrl);
	  musicService.setSearchTimeout((settings.searchTimeout || 15) * 1000);

	  // 简单健康检查：若配置了后端，发起短超时请求检测可达性并提示用户
	  (async () => {
		  const api = settings.apiBaseUrl;
		  if (!api) return;
		  const timeout = (ms: number) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
		  try {
			  await Promise.race([
				  fetch(`${api.replace(/\/$/, '')}/api/search?q=ping`, { method: 'GET', mode: 'cors' }),
				  timeout(3000)
			  ]);
		  } catch (e) {
			  showToast('后端不可达：请运行 `node server.js` 或在设置中调整 API Base URL', 'error');
		  }
	  })();
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

