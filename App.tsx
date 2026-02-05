import React, { useState, useEffect } from 'react';
import { musicService } from './services/geminiService';
import { Player } from './components/Player';
import { LyricsOverlay } from './components/LyricsOverlay';
import { Toast, ToastType } from './components/Toast';
import { SearchIcon, NeteaseIcon, SettingsIcon, HeartIcon, MoreVerticalIcon, DownloadIcon, HomeIcon, LibraryIcon, BilibiliIcon, YouTubeIcon, PluginFileIcon, LabIcon } from './components/Icons';
import { Song, UserProfile, ViewState, MusicSource, Playlist, AudioQuality } from './types';
import { SecureImage } from './components/SecureImage';

export default function App() {
  const [view, setView] = useState<ViewState>('HOME');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [toast, setToast] = useState<{msg: string, type: ToastType, show: boolean}>({ msg: '', type: 'info', show: false });
  const [quality, setQuality] = useState<AudioQuality>('standard');
  const [showLyrics, setShowLyrics] = useState(false);
  
  // 搜索相关
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'NETEASE' | 'BILIBILI' | 'YOUTUBE' | 'PLUGIN'>('ALL');

  // 登录相关
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('unistream_user');
    if (savedUser) try { setUser(JSON.parse(savedUser)); } catch (e) {}
  }, []);

  const showToast = (msg: string, type: ToastType = 'info') => setToast({ msg, type, show: true });

  const playSong = async (song: Song, newQueue?: Song[]) => {
      setIsPlaying(false);
      setCurrentSong(song);
      if (newQueue) setQueue(newQueue);
      
      try {
          showToast(`正在解析: ${song.title}`, 'loading');
          const details = await musicService.getSongDetails(song, quality);
          
          if (details.url) {
              setCurrentSong(prev => prev ? { ...prev, audioUrl: details.url, lyric: details.lyric || prev.lyric } : null);
              setIsPlaying(true);
          } else {
              showToast('无法获取播放地址 (可能需要会员)', 'error');
          }
      } catch (e) { 
          showToast('资源解析失败', 'error');
          setIsPlaying(false); 
      }
  };

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
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

  const startLogin = async () => {
      setShowLoginModal(true);
      const key = await musicService.getNeteaseQrKey();
      if (!key) return showToast('无法获取二维码', 'error');
      setQrCodeUrl(await musicService.createNeteaseQr(key) || '');
      const timer = setInterval(async () => {
          const res = await musicService.checkNeteaseQr(key);
          if (res.code === 803) {
              clearInterval(timer);
              const u: UserProfile = { id: 'me', nickname: '网易云用户', avatarUrl: '', isVip: true, platform: 'netease', cookie: res.cookie };
              setUser(u);
              localStorage.setItem('unistream_user', JSON.stringify(u));
              setShowLoginModal(false);
              showToast('登录成功！', 'success');
          }
      }, 3000);
      setTimeout(() => clearInterval(timer), 120000);
  };

  const exportData = () => {
      const data = { user: localStorage.getItem('unistream_user'), playlists: localStorage.getItem('unistream_playlists') };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `unistream_backup.json`;
      a.click();
      showToast('备份已导出', 'success');
  };

  const importData = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e: any) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
              try {
                  const data = JSON.parse(ev.target?.result as string);
                  if (data.user) localStorage.setItem('unistream_user', data.user);
                  showToast('恢复成功，正在刷新...', 'success');
                  setTimeout(() => window.location.reload(), 1000);
              } catch(e) { showToast('文件错误', 'error'); }
          };
          reader.readAsText(e.target.files[0]);
      };
      input.click();
  };

  const filteredResults = searchResults.filter(s => activeTab === 'ALL' || s.source === activeTab);

  return (
    <div className="h-screen bg-dark text-white flex flex-col font-sans overflow-hidden">
      <Toast message={toast.msg} type={toast.type} isVisible={toast.show} onClose={() => setToast(t => ({...t, show: false}))} />
      
      <div className="flex items-center justify-between p-4 px-6 bg-gradient-to-b from-black/80 to-transparent z-30 fixed top-0 w-full backdrop-blur-sm">
          <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">UniStream</h1>
              <nav className="hidden md:flex gap-6 text-sm font-medium">
                  <button onClick={() => setView('HOME')} className={view === 'HOME' ? 'text-white' : 'text-gray-400'}>发现</button>
                  <button onClick={() => setView('SEARCH')} className={view === 'SEARCH' ? 'text-white' : 'text-gray-400'}>搜索</button>
                  <button onClick={() => setView('LIBRARY')} className={view === 'LIBRARY' ? 'text-white' : 'text-gray-400'}>我的</button>
              </nav>
          </div>
          <div className="flex items-center gap-4">
              <button onClick={() => setView('SEARCH')} className="md:hidden"><SearchIcon size={20}/></button>
              <button onClick={user ? () => setView('SETTINGS') : startLogin} className="text-xs bg-white/10 px-4 py-1.5 rounded-full">
                  {user ? user.nickname : '登录'}
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-20 pb-32 px-4 scroll-smooth">
          {view === 'HOME' && (
              <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
                  <div onClick={() => setView('SEARCH')} className="h-64 rounded-3xl bg-gradient-to-r from-indigo-900 to-purple-900 flex items-center p-8 cursor-pointer hover:scale-[1.02] transition-transform">
                      <div>
                          <h2 className="text-4xl font-bold mb-2">探索全网音乐</h2>
                          <p className="text-gray-300">YouTube / 网易云 / Bilibili 聚合搜索</p>
                      </div>
                  </div>
              </div>
          )}

          {view === 'SEARCH' && (
              <div className="max-w-4xl mx-auto animate-fade-in">
                  <form onSubmit={handleSearch} className="mb-4 sticky top-0 z-10 py-2 bg-dark/95 backdrop-blur-sm">
                      <div className="relative">
                          <SearchIcon className="absolute left-4 top-4 text-gray-400" size={20}/>
                          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索歌曲..." className="w-full bg-white/10 rounded-2xl py-3.5 pl-12 pr-6 text-lg focus:outline-none"/>
                      </div>
                  </form>
                  <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-2">
                      {['ALL', 'NETEASE', 'BILIBILI', 'YOUTUBE'].map(tab => (
                          <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap ${activeTab === tab ? 'bg-white text-black' : 'bg-white/10 text-gray-400'}`}>
                              {tab === 'ALL' ? '全部' : tab}
                          </button>
                      ))}
                  </div>
                  <div className="space-y-2">
                      {filteredResults.map(song => (
                          <div key={song.id} onClick={() => playSong(song, filteredResults)} className={`flex items-center p-3 rounded-xl cursor-pointer hover:bg-white/5 ${currentSong?.id === song.id ? 'bg-white/10' : ''}`}>
                              <SecureImage src={song.coverUrl} className="w-14 h-14 rounded-lg object-cover mr-4"/>
                              <div className="flex-1 min-w-0">
                                  <h4 className={`font-bold truncate text-sm ${currentSong?.id === song.id ? 'text-primary' : ''}`}>{song.title}</h4>
                                  <p className="text-xs text-gray-400 truncate">{song.artist} • {song.source}</p>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {view === 'SETTINGS' && (
              <div className="max-w-2xl mx-auto animate-fade-in">
                  <h2 className="text-2xl font-bold mb-6">设置</h2>
                  <div className="bg-white/5 rounded-2xl p-6 mb-6">
                      <h3 className="font-bold mb-4">数据备份</h3>
                      <div className="flex gap-4">
                          <button onClick={exportData} className="bg-primary px-4 py-2 rounded-lg text-sm font-bold">导出数据</button>
                          <button onClick={importData} className="bg-white/10 px-4 py-2 rounded-lg text-sm font-bold">导入恢复</button>
                      </div>
                  </div>
              </div>
          )}
      </div>

      <div className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ${!currentSong ? 'translate-y-full' : 'translate-y-0'}`}>
         <Player 
            currentSong={currentSong} 
            isPlaying={isPlaying} 
            onPlayPause={() => setIsPlaying(!isPlaying)} 
            onNext={() => {}} 
            onPrev={() => {}} 
            onToggleLike={() => {}} 
            onDownload={() => {}} 
            isLiked={false} 
            quality={quality}
            setQuality={setQuality}
         />
      </div>

      {showLyrics && currentSong && <LyricsOverlay song={currentSong} isPlaying={isPlaying} currentTime={0} duration={currentSong.duration} onClose={() => setShowLyrics(false)} onPlayPause={() => setIsPlaying(!isPlaying)} onNext={() => {}} onPrev={() => {}} onSeek={() => {}} />}

      {showLoginModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="bg-white text-black p-8 rounded-3xl w-80 text-center relative">
                  <button onClick={() => setShowLoginModal(false)} className="absolute top-4 right-4 text-gray-400">×</button>
                  <h3 className="text-xl font-bold mb-4">网易云扫码登录</h3>
                  {qrCodeUrl ? <iframe src={qrCodeUrl} className="w-48 h-48 mx-auto border-none scale-125 origin-top-left overflow-hidden"/> : <div className="w-48 h-48 bg-gray-200 animate-pulse mx-auto"/>}
              </div>
          </div>
      )}
    </div>
  );
}
