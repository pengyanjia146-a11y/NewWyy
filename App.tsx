// 文件路径: App.tsx
import React, { useState, useEffect, useRef } from 'react';
import { musicService } from './services/geminiService';
import { Player } from './components/Player';
import { LoginModal } from './components/LoginModal';
import { Toast, ToastType } from './components/Toast';
import { HomeIcon, SearchIcon, LibraryIcon, NeteaseIcon, PlayIcon, LabIcon, PlaylistAddIcon, PluginFileIcon, MoreVerticalIcon, HeartIcon, DownloadIcon, NextPlanIcon, SettingsIcon, TrashIcon, UserCheckIcon, UserPlusIcon, SmartphoneIcon } from './components/Icons';
import { Song, UserProfile, ViewState, MusicSource, Playlist, AudioQuality, Artist } from './types';
import { SecureImage } from './components/SecureImage';

export default function App() {
  // --- State ---
  const [view, setView] = useState<ViewState>('HOME');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [quality, setQuality] = useState<AudioQuality>('standard');
  const [toast, setToast] = useState<{msg: string, type: ToastType, show: boolean}>({ msg: '', type: 'info', show: false });

  // Persistence
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
      const saved = localStorage.getItem('unistream_playlists');
      return saved ? JSON.parse(saved) : [{ id: 'fav', name: '我喜欢的音乐', description: '红心收藏', songs: [], isSystem: true, coverUrl: 'https://picsum.photos/300?99' }];
  });
  
  const [followedArtists, setFollowedArtists] = useState<Artist[]>(() => {
      const saved = localStorage.getItem('unistream_artists');
      return saved ? JSON.parse(saved) : [];
  });

  const [settings, setSettings] = useState({ apiBaseUrl: '', searchTimeout: 15 });
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'NETEASE' | 'BILIBILI' | 'YOUTUBE'>('ALL');

  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);

  // --- Effects ---
  useEffect(() => {
      localStorage.setItem('unistream_playlists', JSON.stringify(playlists));
      localStorage.setItem('unistream_artists', JSON.stringify(followedArtists));
  }, [playlists, followedArtists]);

  useEffect(() => {
      const savedSettings = localStorage.getItem('unistream_settings');
      if (savedSettings) {
          const s = JSON.parse(savedSettings);
          setSettings(s);
          if(s.apiBaseUrl) musicService.setApiBaseUrl(s.apiBaseUrl);
      }
      
      const savedUser = localStorage.getItem('unistream_user');
      if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const showToast = (msg: string, type: ToastType = 'info') => setToast({ msg, type, show: true });

  // --- Logic ---
  const playSong = async (song: Song, newQueue?: Song[]) => {
    setIsPlaying(false);
    setCurrentSong(song);
    if (newQueue) setQueue(newQueue);
    try {
        const details = await musicService.getSongDetails(song, quality);
        if (details.url) {
            setCurrentSong({ ...song, audioUrl: details.url, lyric: details.lyric || song.lyric });
            setIsPlaying(true);
        } else {
             throw new Error("无法获取播放链接");
        }
    } catch (e: any) {
        showToast(e.message, 'error');
    }
  };

  const togglePlayPause = () => setIsPlaying(!isPlaying);
  const handleNext = () => { if(currentSong) { const idx = queue.findIndex(s=>s.id===currentSong.id); if(queue[idx+1]) playSong(queue[idx+1]); }};
  const handlePrev = () => { if(currentSong) { const idx = queue.findIndex(s=>s.id===currentSong.id); if(queue[idx-1]) playSong(queue[idx-1]); }};

  const handleDownload = async (song: Song) => {
      showToast(`解析下载地址: ${song.title}`, 'loading');
      try {
          const details = await musicService.getSongDetails(song, 'lossless');
          if (details.url) window.open(details.url, '_system');
          else showToast('下载地址无效', 'error');
      } catch (e) { showToast('下载失败', 'error'); }
  };

  const handleToggleLike = (song: Song) => {
      const favList = playlists.find(p => p.id === 'fav');
      if (!favList) return;
      const exists = favList.songs.some(s => s.id === song.id);
      const newSongs = exists ? favList.songs.filter(s => s.id !== song.id) : [song, ...favList.songs];
      setPlaylists(playlists.map(p => p.id === 'fav' ? { ...p, songs: newSongs } : p));
      showToast(exists ? '已取消收藏' : '已收藏', 'success');
  };

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!searchQuery.trim()) return;
      setSearchLoading(true);
      setSearchResults([]); 
      await musicService.searchMusic(searchQuery, (newSongs) => {
          setSearchResults(prev => {
              const existingIds = new Set(prev.map(s => s.id));
              return [...prev, ...newSongs.filter(s => !existingIds.has(s.id))];
          });
      });
      setSearchLoading(false);
  };

  const saveSettings = () => {
      localStorage.setItem('unistream_settings', JSON.stringify(settings));
      musicService.setApiBaseUrl(settings.apiBaseUrl);
      showToast('设置已保存', 'success');
  };

  const handleLoginSuccess = (u: UserProfile) => {
      setUser(u);
      localStorage.setItem('unistream_user', JSON.stringify(u));
      setShowLogin(false);
      showToast(`欢迎, ${u.nickname}`, 'success');
  };

  // --- Renders ---

  const renderHome = () => (
    <div className="space-y-8 animate-fade-in pb-40">
      <div className="relative h-48 md:h-64 rounded-2xl bg-gradient-to-r from-gray-900 to-primary overflow-hidden flex items-center p-6 shadow-2xl">
        <div className="relative z-10 w-full">
          <h1 className="text-3xl font-bold mb-2 text-white">UniStream</h1>
          <p className="text-gray-200 mb-4 max-w-md text-sm md:text-base">
            聚合音乐新体验<br/>
            <span className="text-xs opacity-75">无缝切换 • 极速播放 • 云端同步</span>
          </p>
          <div className="flex gap-2">
             <div className="text-xs bg-white/20 px-2 py-1 rounded text-white">v2.6 Stable</div>
          </div>
        </div>
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
      </div>

      <div className="bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-white">快捷入口</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setView('SEARCH')} className="bg-white/10 p-4 rounded-lg flex items-center gap-3 hover:bg-white/20 transition-colors">
                  <SearchIcon className="text-primary" /> <span className="text-sm">搜索歌曲</span>
              </button>
              <button onClick={() => setView('LIBRARY')} className="bg-white/10 p-4 rounded-lg flex items-center gap-3 hover:bg-white/20 transition-colors">
                  <LibraryIcon className="text-purple-400" /> <span className="text-sm">我的收藏</span>
              </button>
          </div>
      </div>
    </div>
  );

  const renderSearch = () => {
      const filteredResults = searchResults.filter(s => {
          if (activeTab === 'ALL') return true;
          return s.source === activeTab;
      });

      return (
      <div className="pb-40 animate-fade-in">
           <form onSubmit={handleSearch} className="mb-4 sticky top-0 bg-dark z-20 py-4">
                <div className="relative">
                    <SearchIcon className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        placeholder="搜索全网音乐 (网易云/B站/YouTube)..." 
                        className="w-full bg-white/10 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-primary transition-colors"
                    />
                </div>
           </form>

           <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-2">
                {[
                    { id: 'ALL', label: '全部' },
                    { id: 'NETEASE', label: '网易云' },
                    { id: 'BILIBILI', label: 'Bilibili' },
                    { id: 'YOUTUBE', label: 'YouTube' }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border border-transparent ${
                            activeTab === tab.id 
                            ? 'bg-primary text-white shadow-lg shadow-primary/30' 
                            : 'bg-white/5 text-gray-400 hover:bg-white/10 border-white/5'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
           </div>
           
           <div className="space-y-2">
               {filteredResults.map(song => (
                   <div key={song.id} className="group flex items-center p-3 rounded-xl cursor-pointer hover:bg-white/5 transition-colors" onClick={() => playSong(song)}>
                       <div className="relative w-12 h-12 rounded-lg overflow-hidden mr-4 flex-shrink-0 bg-gray-800">
                           <SecureImage src={song.coverUrl} className="w-full h-full object-cover" />
                           <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
                               <PlayIcon size={16} className="text-white"/>
                           </div>
                       </div>
                       <div className="flex-1 min-w-0">
                           <div className="font-medium text-white truncate">{song.title}</div>
                           <div className="text-xs text-gray-400 flex items-center gap-2">
                               <span className={`px-1 rounded text-[9px] ${
                                   song.source === 'NETEASE' ? 'bg-red-500/20 text-red-400' : 
                                   song.source === 'BILIBILI' ? 'bg-pink-500/20 text-pink-400' : 
                                   'bg-red-600/20 text-red-500'
                               }`}>{song.source}</span>
                               <span className="truncate">{song.artist}</span>
                           </div>
                       </div>
                       <button onClick={(e) => { e.stopPropagation(); handleToggleLike(song); }} className="p-2 text-gray-400 hover:text-red-500">
                           <HeartIcon size={20} fill={playlists[0].songs.some(s=>s.id===song.id)?"currentColor":"none"}/>
                       </button>
                   </div>
               ))}
           </div>
           
           {searchLoading && (
               <div className="flex justify-center py-8">
                   <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
               </div>
           )}
           
           {!searchLoading && searchResults.length === 0 && searchQuery && (
               <div className="text-center text-gray-500 py-10">未找到结果，请尝试切换关键词或检查网络</div>
           )}
      </div>
      );
  };

  const renderLibrary = () => (
      <div className="pb-40 animate-fade-in relative">
          {!activePlaylist ? (
              <>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">我的音乐</h2>
                </div>
                
                {/* 订阅 (Subscriptions) */}
                <div className="mb-8">
                    <h3 className="font-bold text-lg mb-3 text-white">订阅 (Subscriptions)</h3>
                    {followedArtists.length === 0 ? (
                        <p className="text-xs text-gray-500 bg-white/5 p-4 rounded-xl text-center">暂无订阅</p>
                    ) : (
                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                             {followedArtists.map(artist => (
                                 <div key={artist.id} className="flex-shrink-0 w-20 text-center cursor-pointer group">
                                     <SecureImage src={artist.coverUrl} className="w-20 h-20 rounded-full object-cover mb-2 border-2 border-transparent group-hover:border-primary transition-colors" />
                                     <p className="text-xs truncate text-gray-300 group-hover:text-white">{artist.name}</p>
                                 </div>
                             ))}
                        </div>
                    )}
                </div>

                <h3 className="font-bold text-lg mb-3 text-white">我的歌单</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {playlists.map(pl => (
                        <div key={pl.id} onClick={() => setActivePlaylist(pl)} className="group cursor-pointer bg-white/5 p-3 rounded-xl hover:bg-white/10 transition-colors">
                            <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-gray-800">
                                <SecureImage src={pl.coverUrl!} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                {pl.id === 'fav' && <div className="absolute top-2 right-2 bg-red-500 p-1.5 rounded-full shadow-lg"><HeartIcon size={12} fill="white" /></div>}
                            </div>
                            <h3 className="font-bold truncate text-white">{pl.name}</h3>
                            <p className="text-xs text-gray-400">{pl.songs.length} 首歌曲</p>
                        </div>
                    ))}
                </div>
              </>
          ) : (
              <div>
                  <button onClick={() => setActivePlaylist(null)} className="text-sm text-gray-400 hover:text-white mb-4">← 返回</button>
                  <h2 className="text-2xl font-bold mb-4">{activePlaylist.name}</h2>
                  <div className="space-y-1">
                      {activePlaylist.songs.map((song, idx) => (
                          <div key={idx} className="flex items-center p-3 rounded-lg hover:bg-white/5 cursor-pointer" onClick={() => playSong(song, activePlaylist.songs)}>
                              <div className="flex-1">
                                  <div className="font-medium text-white">{song.title}</div>
                                  <div className="text-xs text-gray-400">{song.artist}</div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>
  );

  const renderSettings = () => (
    <div className="pb-40 animate-fade-in">
         <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><SettingsIcon /> 设置</h2>
         <div className="bg-white/5 p-4 rounded-xl">
             <h3 className="font-bold mb-4 border-b border-white/10 pb-2">后端设置</h3>
             <div className="mb-4">
                 <label className="block text-xs text-gray-400 mb-1">后端 API 地址 (例如 http://192.168.1.5:3001)</label>
                 <input type="text" value={settings.apiBaseUrl} onChange={(e) => setSettings({...settings, apiBaseUrl: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm text-white"/>
             </div>
             <button onClick={saveSettings} className="bg-primary px-4 py-2 rounded-lg text-sm font-bold w-full">保存设置</button>
         </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark text-white flex flex-col md:flex-row">
      <Toast message={toast.msg} type={toast.type} isVisible={toast.show} onClose={() => setToast(t => ({...t, show: false}))} />
      
      {/* Desktop Nav */}
      <div className="hidden md:flex flex-col w-64 border-r border-white/5 p-6 bg-dark">
        <div className="flex items-center gap-2 mb-10 text-xl font-bold">UniStream</div>
        <nav className="space-y-2 flex-1">
          <NavBtn icon={<HomeIcon />} label="首页" active={view === 'HOME'} onClick={() => setView('HOME')} />
          <NavBtn icon={<SearchIcon />} label="搜索" active={view === 'SEARCH'} onClick={() => setView('SEARCH')} />
          <NavBtn icon={<LibraryIcon />} label="我的音乐" active={view === 'LIBRARY'} onClick={() => setView('LIBRARY')} />
          <NavBtn icon={<SettingsIcon />} label="设置" active={view === 'SETTINGS'} onClick={() => setView('SETTINGS')} />
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 h-screen overflow-y-auto no-scrollbar relative">
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
          {view === 'HOME' && renderHome()}
          {view === 'SEARCH' && renderSearch()}
          {view === 'LIBRARY' && renderLibrary()}
          {view === 'SETTINGS' && renderSettings()}
        </div>
      </div>
      
      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-dark-light/90 backdrop-blur-lg border-t border-white/5 flex justify-around items-center py-3 pb-safe z-50">
          <MobileNavBtn icon={<HomeIcon />} label="首页" active={view === 'HOME'} onClick={() => setView('HOME')} />
          <MobileNavBtn icon={<SearchIcon />} label="搜索" active={view === 'SEARCH'} onClick={() => setView('SEARCH')} />
          <MobileNavBtn icon={<LibraryIcon />} label="我的" active={view === 'LIBRARY'} onClick={() => setView('LIBRARY')} />
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
            isLiked={playlists.length > 0 && playlists[0].songs ? playlists[0].songs.some(s=>s.id===currentSong?.id) : false} 
            quality={quality}
            setQuality={setQuality}
         />
      </div>

      {showLogin && <LoginModal onLogin={handleLoginSuccess} onClose={() => setShowLogin(false)} />}
    </div>
  );
}

const NavBtn = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl ${active ? 'bg-white/10 text-white' : 'text-gray-400'}`}>
    {React.cloneElement(icon, { size: 20 })}<span>{label}</span>
  </button>
);

const MobileNavBtn = ({ icon, label, active, onClick }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center space-y-1 ${active ? 'text-white' : 'text-gray-500'}`}>
        {React.cloneElement(icon, { size: 20 })}<span className="text-[10px]">{label}</span>
    </button>
);
