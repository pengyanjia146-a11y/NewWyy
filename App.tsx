import React, { useState, useEffect, useRef } from 'react';
import { musicService } from './services/geminiService';
import { Player } from './components/Player';
import { LyricsOverlay } from './components/LyricsOverlay'; // 引用新组件
import { Toast, ToastType } from './components/Toast';
import { SearchIcon, NeteaseIcon, PlayIcon, SettingsIcon, HeartIcon, MoreVerticalIcon, DownloadIcon } from './components/Icons';
import { Song, UserProfile, ViewState, MusicSource, Playlist } from './types';
import { SecureImage } from './components/SecureImage';

// --- MediaSession Hook ---
const useMediaSession = (song: Song | null, isPlaying: boolean, onPlayPause: any, onNext: any, onPrev: any) => {
    useEffect(() => {
        if (!song || !('mediaSession' in navigator)) return;
        
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            album: song.album,
            artwork: [{ src: song.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
        });

        navigator.mediaSession.setActionHandler('play', onPlayPause);
        navigator.mediaSession.setActionHandler('pause', onPlayPause);
        navigator.mediaSession.setActionHandler('previoustrack', onPrev);
        navigator.mediaSession.setActionHandler('nexttrack', onNext);
    }, [song]);

    useEffect(() => {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }, [isPlaying]);
};

export default function App() {
  const [view, setView] = useState<ViewState>('HOME');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState<Song[]>([]);
  const [toast, setToast] = useState<{msg: string, type: ToastType, show: boolean}>({ msg: '', type: 'info', show: false });
  
  // 歌词全屏模式
  const [showLyrics, setShowLyrics] = useState(false);

  // 搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // 登录状态
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);

  // MediaSession 集成
  useMediaSession(currentSong, isPlaying, () => setIsPlaying(!isPlaying), 
      () => handleNext(), () => handlePrev());

  // 音频对象
  const audioRef = useRef<HTMLAudioElement>(new Audio());

  useEffect(() => {
      const audio = audioRef.current;
      const updateTime = () => setCurrentTime(audio.currentTime);
      const updateDur = () => setDuration(audio.duration);
      const onEnd = () => handleNext();

      audio.addEventListener('timeupdate', updateTime);
      audio.addEventListener('loadedmetadata', updateDur);
      audio.addEventListener('ended', onEnd);
      return () => {
          audio.removeEventListener('timeupdate', updateTime);
          audio.removeEventListener('loadedmetadata', updateDur);
          audio.removeEventListener('ended', onEnd);
      };
  }, [queue, currentSong]); // Re-bind if queue changes

  useEffect(() => {
      if (isPlaying) audioRef.current.play().catch(() => setIsPlaying(false));
      else audioRef.current.pause();
  }, [isPlaying]);

  const showToast = (msg: string, type: ToastType = 'info') => setToast({ msg, type, show: true });

  const playSong = async (song: Song, newQueue?: Song[]) => {
      setIsPlaying(false);
      // 乐观更新 UI
      setCurrentSong(song);
      if (newQueue) setQueue(newQueue);
      
      try {
          const details = await musicService.getSongDetails(song);
          if (details.url) {
              audioRef.current.src = details.url;
              // 更新详细信息（含歌词）
              setCurrentSong(prev => prev ? { ...prev, lyric: details.lyric, audioUrl: details.url } : null);
              setIsPlaying(true);
          } else {
              showToast('无法播放此资源', 'error');
          }
      } catch (e) { showToast('播放失败', 'error'); }
  };

  const handleNext = () => {
      if (!currentSong || queue.length === 0) return;
      const idx = queue.findIndex(s => s.id === currentSong.id);
      playSong(queue[(idx + 1) % queue.length]);
  };

  const handlePrev = () => {
      if (!currentSong || queue.length === 0) return;
      const idx = queue.findIndex(s => s.id === currentSong.id);
      playSong(queue[(idx - 1 + queue.length) % queue.length]);
  };

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery) return;
      setSearchLoading(true);
      setSearchResults([]);
      await musicService.searchMusic(searchQuery, (songs) => {
          setSearchResults(prev => [...prev, ...songs.filter(s => !prev.some(p => p.id === s.id))]);
      });
      setSearchLoading(false);
  };

  // --- 扫码登录逻辑 ---
  const startLogin = async () => {
      setShowLoginModal(true);
      const key = await musicService.getNeteaseQrKey();
      if (!key) return showToast('无法获取二维码', 'error');
      
      const url = await musicService.createNeteaseQr(key);
      setQrCodeUrl(url!);

      const timer = setInterval(async () => {
          const res = await musicService.checkNeteaseQr(key);
          if (res.code === 803) {
              clearInterval(timer);
              const u: UserProfile = { 
                  id: 'me', nickname: '网易云用户', avatarUrl: '', isVip: true, platform: 'netease', cookie: res.cookie 
              };
              setUser(u);
              localStorage.setItem('unistream_user', JSON.stringify(u));
              setShowLoginModal(false);
              showToast('登录成功！', 'success');
          }
          if (res.code === 800) { clearInterval(timer); showToast('二维码过期', 'error'); }
      }, 3000);
      
      // 简单的 cleanup
      setTimeout(() => clearInterval(timer), 120000);
  };

  // --- 数据备份逻辑 (自主本地缓存) ---
  const exportData = () => {
      const data = {
          user: localStorage.getItem('unistream_user'),
          playlists: localStorage.getItem('unistream_playlists'),
          settings: localStorage.getItem('unistream_settings')
      };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `unistream_backup_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      showToast('备份文件已生成', 'success');
  };

  const importData = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e: any) => {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (ev) => {
              try {
                  const data = JSON.parse(ev.target?.result as string);
                  if (data.user) localStorage.setItem('unistream_user', data.user);
                  if (data.playlists) localStorage.setItem('unistream_playlists', data.playlists);
                  showToast('数据恢复成功，请刷新', 'success');
                  setTimeout(() => window.location.reload(), 1000);
              } catch(e) { showToast('文件格式错误', 'error'); }
          };
          reader.readAsText(file);
      };
      input.click();
  };

  return (
    <div className="h-screen bg-dark text-white flex flex-col font-sans selection:bg-primary selection:text-white overflow-hidden">
      <Toast message={toast.msg} type={toast.type} isVisible={toast.show} onClose={() => setToast(t => ({...t, show: false}))} />
      
      {/* 顶部菜单 (美观一些) */}
      <div className="flex items-center justify-between p-4 px-6 bg-gradient-to-b from-black/80 to-transparent z-20 backdrop-blur-sm fixed top-0 w-full">
          <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">UniStream</h1>
              <nav className="hidden md:flex gap-4 text-sm font-medium">
                  <button onClick={() => setView('HOME')} className={`transition-colors ${view === 'HOME' ? 'text-white' : 'text-gray-400 hover:text-white'}`}>发现</button>
                  <button onClick={() => setView('SEARCH')} className={`transition-colors ${view === 'SEARCH' ? 'text-white' : 'text-gray-400 hover:text-white'}`}>搜索</button>
                  <button onClick={() => setView('LIBRARY')} className={`transition-colors ${view === 'LIBRARY' ? 'text-white' : 'text-gray-400 hover:text-white'}`}>我的音乐</button>
              </nav>
          </div>
          <div className="flex items-center gap-4">
              <button onClick={() => setView('SEARCH')} className="md:hidden"><SearchIcon size={20}/></button>
              {user ? (
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('SETTINGS')}>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-netease to-red-600 flex items-center justify-center text-xs font-bold">
                          {user.nickname[0]}
                      </div>
                  </div>
              ) : (
                  <button onClick={startLogin} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors">
                      登录
                  </button>
              )}
          </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 overflow-y-auto pt-20 pb-32 px-4 scroll-smooth">
          {view === 'HOME' && (
              <div className="max-w-4xl mx-auto animate-fade-in">
                  <div className="relative h-64 rounded-3xl bg-gradient-to-r from-indigo-900 to-purple-900 overflow-hidden mb-8 shadow-2xl group">
                      <div className="absolute inset-0 bg-[url('https://source.unsplash.com/random/800x400?music')] opacity-30 group-hover:scale-105 transition-transform duration-1000"></div>
                      <div className="absolute bottom-6 left-6">
                          <h2 className="text-3xl font-bold mb-2">沉浸式体验</h2>
                          <p className="text-gray-200 text-sm">极致流媒体 / 动态歌词 / 系统级集成</p>
                      </div>
                      <button onClick={() => playSong({id:'2026', title:'示例歌曲', artist:'UniStream', album:'Demo', coverUrl:'', source:MusicSource.LOCAL, duration:0})} className="absolute bottom-6 right-6 bg-primary text-white p-3 rounded-full shadow-lg hover:scale-110 transition-transform">
                          <PlayIcon />
                      </button>
                  </div>
                  <h3 className="text-xl font-bold mb-4">快捷入口</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div onClick={() => setView('SEARCH')} className="bg-white/5 p-4 rounded-xl hover:bg-white/10 cursor-pointer transition-colors">
                          <SearchIcon className="text-primary mb-2" size={24}/>
                          <div className="font-bold">全网搜索</div>
                          <div className="text-xs text-gray-400">聚合 YouTube & 网易云</div>
                      </div>
                      <div onClick={exportData} className="bg-white/5 p-4 rounded-xl hover:bg-white/10 cursor-pointer transition-colors">
                          <DownloadIcon className="text-green-400 mb-2" size={24}/>
                          <div className="font-bold">本地备份</div>
                          <div className="text-xs text-gray-400">导出数据防止丢失</div>
                      </div>
                  </div>
              </div>
          )}

          {view === 'SEARCH' && (
              <div className="max-w-4xl mx-auto animate-fade-in">
                  <form onSubmit={handleSearch} className="mb-6 sticky top-0 bg-dark z-10 py-2">
                      <input 
                          type="text" 
                          autoFocus
                          value={searchQuery} 
                          onChange={(e) => setSearchQuery(e.target.value)} 
                          placeholder="搜索歌曲、MV..." 
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-lg focus:outline-none focus:border-primary transition-colors"
                      />
                  </form>
                  <div className="space-y-2">
                      {searchResults.map(song => (
                          <div key={song.id} onClick={() => playSong(song, searchResults)} className="flex items-center p-3 hover:bg-white/5 rounded-xl cursor-pointer group transition-colors">
                              <SecureImage src={song.coverUrl} className="w-14 h-14 rounded-lg object-cover mr-4 shadow-md group-hover:scale-105 transition-transform"/>
                              <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                      <h4 className={`font-bold ${currentSong?.id === song.id ? 'text-primary' : ''}`}>{song.title}</h4>
                                      {/* VIP 显示 */}
                                      {song.fee === 1 && <span className="text-[10px] border border-red-500 text-red-500 px-1 rounded">VIP</span>}
                                  </div>
                                  <p className="text-sm text-gray-400">{song.artist} • {song.album}</p>
                              </div>
                              <button className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-white transition-opacity"><MoreVerticalIcon/></button>
                          </div>
                      ))}
                      {searchLoading && <div className="text-center py-10 text-gray-500">搜索全网资源中...</div>}
                  </div>
              </div>
          )}

          {view === 'SETTINGS' && (
              <div className="max-w-2xl mx-auto animate-fade-in">
                  <h2 className="text-2xl font-bold mb-6">设置与备份</h2>
                  <div className="bg-white/5 rounded-2xl p-6 mb-6">
                      <h3 className="font-bold mb-4 flex items-center gap-2"><SettingsIcon/> 数据管理</h3>
                      <p className="text-sm text-gray-400 mb-4">由于浏览器限制，卸载重装会导致数据丢失。请定期下载备份文件。</p>
                      <div className="flex gap-4">
                          <button onClick={exportData} className="bg-primary hover:bg-primary/80 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                              导出备份文件
                          </button>
                          <button onClick={importData} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                              导入恢复
                          </button>
                      </div>
                  </div>
              </div>
          )}
      </div>

      {/* 底部播放条 */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/5 p-3 pb-safe z-40" onClick={() => setShowLyrics(true)}>
          <div className="max-w-5xl mx-auto flex items-center justify-between">
             <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                 <SecureImage src={currentSong?.coverUrl || ''} className={`w-12 h-12 rounded-full object-cover ${isPlaying ? 'animate-spin-slow' : ''}`} />
                 <div className="min-w-0">
                     <div className="font-bold truncate text-sm">{currentSong?.title || '未播放'}</div>
                     <div className="text-xs text-gray-400 truncate">{currentSong?.artist || '...'}</div>
                 </div>
             </div>
             <div className="flex items-center gap-4">
                 <button onClick={(e) => {e.stopPropagation(); handlePrev();}}><svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                 <button onClick={(e) => {e.stopPropagation(); setIsPlaying(!isPlaying);}} className="bg-white text-black rounded-full p-2 hover:scale-105 transition-transform">
                     {isPlaying ? 
                        <svg width="24" height="24" fill="black" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : 
                        <svg width="24" height="24" fill="black" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                     }
                 </button>
                 <button onClick={(e) => {e.stopPropagation(); handleNext();}}><svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
             </div>
          </div>
      </div>

      {/* 全屏歌词组件 */}
      {showLyrics && (
          <LyricsOverlay 
              song={currentSong}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              onClose={() => setShowLyrics(false)}
              onPlayPause={() => setIsPlaying(!isPlaying)}
              onNext={handleNext}
              onPrev={handlePrev}
              onSeek={(t) => { audioRef.current.currentTime = t; }}
          />
      )}

      {/* 登录弹窗 */}
      {showLoginModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="bg-white text-black p-8 rounded-2xl w-80 text-center animate-scale-in">
                  <h3 className="text-xl font-bold mb-4">网易云扫码登录</h3>
                  {qrCodeUrl ? <div className="bg-gray-200 w-48 h-48 mx-auto mb-4"><iframe src={qrCodeUrl} className="w-full h-full border-none pointer-events-none scale-150 origin-top-left" /></div> : <div className="w-48 h-48 bg-gray-200 animate-pulse mx-auto mb-4"/>}
                  <p className="text-sm text-gray-500 mb-4">请使用网易云音乐 APP 扫码</p>
                  <button onClick={() => setShowLoginModal(false)} className="text-sm text-red-500">取消</button>
              </div>
          </div>
      )}
    </div>
  );
}
