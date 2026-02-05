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
  const [quality, setQuality] = useState<AudioQuality>('standard');
  const [activeTab, setActiveTab] = useState<'ALL' | 'NETEASE' | 'BILIBILI' | 'YOUTUBE' | 'PLUGIN'>('ALL');
  const [toast, setToast] = useState<{msg: string, type: ToastType, show: boolean}>({ msg: '', type: 'info', show: false });

  // 持久化状态
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
      const saved = localStorage.getItem('unistream_playlists');
      return saved ? JSON.parse(saved) : [{ id: 'fav', name: '我喜欢的音乐', description: '红心收藏', songs: [], isSystem: true, coverUrl: 'https://picsum.photos/300?99' }];
  });
  const [neteasePlaylists, setNeteasePlaylists] = useState<Playlist[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [followedArtists, setFollowedArtists] = useState<Artist[]>(() => {
      const saved = localStorage.getItem('unistream_artists');
      return saved ? JSON.parse(saved) : [];
  });
  const [activeArtist, setActiveArtist] = useState<{info: Artist, songs: Song[]} | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => JSON.parse(localStorage.getItem('unistream_search_history') || '[]'));
  const [playHistory, setPlayHistory] = useState<Song[]>(() => JSON.parse(localStorage.getItem('unistream_play_history') || '[]'));

  // 插件与诊断
  const [installedPlugins, setInstalledPlugins] = useState<MusicPlugin[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const [pluginLoading, setPluginLoading] = useState(false);
  const [diagnosticResults, setDiagnosticResults] = useState<DiagnosticResult[]>([]);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // 🟢 修复后的设置初始化逻辑 (L90-L101)
  const [settings, setSettings] = useState(() => {
      const saved = localStorage.getItem('unistream_settings');
      const isDev = import.meta.env.DEV; // 使用 Vite 方式判断环境
      const defaults = {
          downloadPath: 'Internal Storage/Music/UniStream',
          customInvidious: '',
          apiBaseUrl: isDev ? 'http://localhost:3001' : '',
          searchTimeout: 15 
      };
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });

  // 副作用处理
  useEffect(() => {
      localStorage.setItem('unistream_playlists', JSON.stringify(playlists));
      localStorage.setItem('unistream_artists', JSON.stringify(followedArtists));
  }, [playlists, followedArtists]);

  useEffect(() => {
      localStorage.setItem('unistream_settings', JSON.stringify(settings));
      musicService.setApiBaseUrl(settings.apiBaseUrl);
      musicService.setSearchTimeout((settings.searchTimeout || 15) * 1000);
  }, [settings]);

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
        }
    } catch (e) { showToast('播放失败', 'error'); }
  };

  const handleNext = () => {
    if (!currentSong || queue.length === 0) return;
    const idx = queue.findIndex(s => s.id === currentSong.id);
    playSong(queue[(idx + 1) % queue.length]);
  };

  // ... 渲染函数 (renderHome, renderSearch 等保持原样) ...
  const renderHome = () => (
    <div className="p-4 space-y-6 pb-32">
        <h1 className="text-2xl font-bold">UniStream</h1>
        <div className="bg-white/5 p-4 rounded-xl">最近播放内容...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark text-white">
      <Toast message={toast.msg} type={toast.type} isVisible={toast.show} onClose={() => setToast(t => ({...t, show: false}))} />
      <main className="max-w-5xl mx-auto p-4">
          {view === 'HOME' && renderHome()}
          {/* 其他视图根据 view 切换 */}
      </main>
      <Player 
        currentSong={currentSong} isPlaying={isPlaying} 
        onPlayPause={() => setIsPlaying(!isPlaying)} 
        onNext={handleNext} onPrev={() => {}} 
        onToggleLike={() => {}} onDownload={() => {}} 
        isLiked={false} quality={quality} setQuality={setQuality}
      />
      {showLogin && <LoginModal onLogin={() => {}} onClose={() => setShowLogin(false)} />}
    </div>
  );
}
