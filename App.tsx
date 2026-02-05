// 文件路径: App.tsx
import React, { useState, useEffect, useRef } from 'react';
import { musicService } from './services/geminiService';
import { Player } from './components/Player';
import { LoginModal } from './components/LoginModal';
import { Toast, ToastType } from './components/Toast';
import { HomeIcon, SearchIcon, LibraryIcon, NeteaseIcon, PlayIcon, LabIcon, PlaylistAddIcon, PluginFileIcon, MoreVerticalIcon, HeartIcon, DownloadIcon, NextPlanIcon, SettingsIcon, TrashIcon, UserCheckIcon, UserPlusIcon, SmartphoneIcon } from './components/Icons';
import { Song, UserProfile, ViewState, MusicSource, Playlist, MusicPlugin, AudioQuality, Artist, DiagnosticResult } from './types';
import { SecureImage } from './components/SecureImage';

export default function App() {
  const [view, setView] = useState<ViewState>('HOME');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [quality, setQuality] = useState<AudioQuality>('standard');
  const [activeTab, setActiveTab] = useState('ALL');
  const [toast, setToast] = useState<{msg: string, type: ToastType, show: boolean}>({ msg: '', type: 'info', show: false });

  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
      const saved = localStorage.getItem('unistream_playlists');
      return saved ? JSON.parse(saved) : [{ id: 'fav', name: '我喜欢的音乐', description: '红心收藏', songs: [], isSystem: true, coverUrl: 'https://picsum.photos/300?99' }];
  });
  
  // Subscriptions (Replacing Followed Artists)
  const [followedArtists, setFollowedArtists] = useState<Artist[]>(() => {
      const saved = localStorage.getItem('unistream_artists');
      return saved ? JSON.parse(saved) : [];
  });
  const [activeArtist, setActiveArtist] = useState<{info: Artist, songs: Song[]} | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);

  useEffect(() => {
      localStorage.setItem('unistream_playlists', JSON.stringify(playlists));
      localStorage.setItem('unistream_artists', JSON.stringify(followedArtists));
  }, [playlists, followedArtists]);

  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [playHistory, setPlayHistory] = useState<Song[]>([]);
  const [settings, setSettings] = useState({ apiBaseUrl: '', searchTimeout: 15 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [menuSong, setMenuSong] = useState<Song | null>(null);

  useEffect(() => {
      const savedSettings = localStorage.getItem('unistream_settings');
      if (savedSettings) {
          const s = JSON.parse(savedSettings);
          setSettings(s);
          if(s.apiBaseUrl) musicService.setApiBaseUrl(s.apiBaseUrl);
      }
  }, []);

  const showToast = (msg: string, type: ToastType = 'info') => setToast({ msg, type, show: true });

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
             throw new Error("NO_URL");
        }
    } catch (e: any) {
        showToast('资源加载失败: ' + e.message, 'error');
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

  const toggleFollowArtist = (artist: Artist) => {
      const exists = followedArtists.some(a => a.id === artist.id);
      if (exists) {
          setFollowedArtists(prev => prev.filter(a => a.id !== artist.id));
          showToast('已取消订阅', 'info');
      } else {
          setFollowedArtists(prev => [...prev, artist]);
          showToast('已订阅', 'success');
      }
  };

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!searchQuery.trim()) return;
      setSearchLoading(true);
      setSearchResults([]); 
      await musicService.searchMusic(searchQuery, (newSongs) => {
          setSearchResults(prev => [...prev, ...newSongs]);
      });
      setSearchLoading(false);
  };

  const saveSettings = () => {
      localStorage.setItem('unistream_settings', JSON.stringify(settings));
      musicService.setApiBaseUrl(settings.apiBaseUrl);
      showToast('设置已保存', 'success');
  };

  // Renders
  const renderLibrary = () => (
      <div className="pb-40 animate-fade-in relative">
          {!activePlaylist ? (
              <>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">我的音乐</h2>
                </div>
                
                <div className="mb-6">
                    <h3 className="font-bold text-lg mb-3">订阅 (Subscriptions)</h3>
                    {followedArtists.length === 0 ? (
                        <p className="text-xs text-gray-500">暂无订阅</p>
                    ) : (
                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                             {followedArtists.map(artist => (
                                 <div key={artist.id} className="flex-shrink-0 w-20 text-center cursor-pointer" onClick={() => {/* Handle artist click */}}>
                                     <SecureImage src={artist.coverUrl} className="w-20 h-20 rounded-full object-cover mb-2" />
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
                                <SecureImage src={pl.coverUrl!} className="w-full h-full object-cover" />
                            </div>
                            <h3 className="font-bold truncate">{pl.name}</h3>
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
                 <input type="text" value={settings.apiBaseUrl} onChange={(e) => setSettings({...settings, apiBaseUrl: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm"/>
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
          {view === 'HOME' && <div className="text-center py-20">欢迎使用 UniStream</div>}
          {view === 'SEARCH' && (
              <div className="pb-40">
                  <form onSubmit={handleSearch} className="mb-4 sticky top-0 bg-dark z-20 py-4">
                      <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索..." className="w-full bg-dark-light border border-white/10 rounded-xl py-3 px-4"/>
                  </form>
                  {searchResults.map(song => (
                      <div key={song.id} className="flex items-center p-3 hover:bg-white/5 cursor-pointer" onClick={() => playSong(song)}>
                          <div className="flex-1">
                              <div className="font-medium">{song.title}</div>
                              <div className="text-xs text-gray-400">{song.artist} - {song.source}</div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleToggleLike(song); }}><HeartIcon fill={playlists[0].songs.find(s=>s.id===song.id)?"currentColor":"none"}/></button>
                      </div>
                  ))}
                  {searchLoading && <div className="text-center py-4">加载中...</div>}
              </div>
          )}
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
            isLiked={playlists[0].songs.some(s=>s.id===currentSong?.id)} 
            quality={quality}
            setQuality={setQuality}
         />
      </div>
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
