// 文件路径: components/Player.tsx
import React, { useEffect, useState, useRef } from 'react';
import { Song, MusicSource, AudioQuality } from '../types';
import { PlayIcon, PauseIcon, SkipForwardIcon, SkipBackIcon, LyricsIcon, DownloadIcon, HeartIcon, VolumeIcon, VolumeMuteIcon, ChevronDownIcon, ListIcon, VideoIcon } from './Icons';
import { musicService } from '../services/geminiService';
import { SecureImage } from './SecureImage';

// Helper for Lyrics
const parseLyrics = (lrc: string) => {
    if (!lrc) return [];
    const lines = lrc.split('\n');
    const result: { time: number; text: string }[] = [];
    const timeReg = /\[(\d{2}):(\d{2})(\.\d{2,3})?\]/g;
    for (const line of lines) {
        let match;
        while ((match = timeReg.exec(line)) !== null) {
             const time = parseInt(match[1]) * 60 + parseInt(match[2]) + (match[3] ? parseFloat(match[3]) : 0);
             result.push({ time, text: line.replace(timeReg, '').trim() });
        }
    }
    return result.sort((a, b) => a.time - b.time);
};

interface PlayerProps {
  currentSong: Song | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleLike: (song: Song) => void;
  onDownload: (song: Song) => void;
  isLiked: boolean;
  quality: AudioQuality;
  setQuality: (q: AudioQuality) => void;
}

export const Player: React.FC<PlayerProps> = ({ currentSong, isPlaying, onPlayPause, onNext, onPrev, onToggleLike, onDownload, isLiked, quality, setQuality }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsLines, setLyricsLines] = useState<{time: number, text: string}[]>([]);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const activeLyricRef = useRef<HTMLParagraphElement>(null);
  
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  // Enhanced Background Playback (MediaSession API)
  useEffect(() => {
    if (currentSong && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentSong.title,
            artist: currentSong.artist,
            album: currentSong.album,
            artwork: [{ src: currentSong.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
        });
        navigator.mediaSession.setActionHandler('play', onPlayPause);
        navigator.mediaSession.setActionHandler('pause', onPlayPause);
        navigator.mediaSession.setActionHandler('previoustrack', onPrev);
        navigator.mediaSession.setActionHandler('nexttrack', onNext);
    }
  }, [currentSong, onPlayPause, onNext, onPrev]);

  useEffect(() => {
    if (currentSong) {
        setLyricsLines(parseLyrics(currentSong.lyric || ''));
        setIsVideoMode(false);
        setVideoUrl('');
        setDuration(currentSong.duration || 0);
    }
  }, [currentSong]);

  useEffect(() => {
      const target = isVideoMode ? videoRef.current : audioRef.current;
      const other = isVideoMode ? audioRef.current : videoRef.current;
      if (target) {
          if (isPlaying) target.play().catch(()=>{});
          else target.pause();
      }
      if (other) other.pause();
  }, [isPlaying, isVideoMode]);

  useEffect(() => {
    if (audioRef.current && currentSong?.audioUrl && !isVideoMode) {
         if (audioRef.current.src !== currentSong.audioUrl) {
             audioRef.current.src = currentSong.audioUrl;
             if(isPlaying) audioRef.current.play().catch(()=>{});
         }
    }
  }, [currentSong?.audioUrl, isVideoMode, isPlaying]);

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    setCurrentTime(el.currentTime);
    if (el.duration && !isNaN(el.duration)) setDuration(el.duration);
    setProgress((el.currentTime / (el.duration || 1)) * 100);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = isVideoMode ? videoRef.current : audioRef.current;
      if (target) {
          const seekTime = (parseFloat(e.target.value) / 100) * (duration || 1);
          target.currentTime = seekTime;
          setProgress(parseFloat(e.target.value));
      }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentLyricIndex = lyricsLines.findIndex((line, index) => {
      const nextLine = lyricsLines[index + 1];
      return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
  });

  if (!currentSong) return null;

  return (
    <>
      <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} onEnded={onNext} onError={onNext} />
      
      {/* Full Screen Player */}
      <div className={`fixed inset-0 z-[60] bg-gray-900 flex flex-col transition-all duration-500 ease-in-out ${isFullScreen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
          <div className="absolute inset-0 z-0 opacity-40">
              <SecureImage src={currentSong.coverUrl} className="w-full h-full object-cover blur-3xl" />
              <div className="absolute inset-0 bg-black/50" />
          </div>

          <div className="relative z-10 flex items-center justify-between p-6 pt-12 md:pt-6">
              <button onClick={() => setIsFullScreen(false)} className="text-white/70 hover:text-white p-2">
                  <ChevronDownIcon size={32} />
              </button>
              <div className="flex flex-col items-center">
                  <span className="text-xs text-white/60 mb-1">正在播放</span>
                  <span className="text-sm font-medium">{currentSong.source}</span>
              </div>
              <button className="text-white/70 hover:text-white p-2" onClick={() => setShowLyrics(!showLyrics)}>
                  <LyricsIcon size={24} fill={showLyrics ? "currentColor" : "none"} />
              </button>
          </div>

          <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
              {isVideoMode ? (
                  <div className="w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl relative">
                      <video ref={videoRef} src={videoUrl} className="w-full h-full object-contain" onTimeUpdate={handleTimeUpdate} onEnded={onNext} />
                  </div>
              ) : (
                  showLyrics ? (
                      <div ref={lyricsRef} className="w-full h-full overflow-y-auto no-scrollbar text-center space-y-8 mask-linear-y py-10">
                          {lyricsLines.map((line, idx) => (
                              <p key={idx} ref={idx === currentLyricIndex ? activeLyricRef : null} className={`transition-all duration-300 px-4 ${idx === currentLyricIndex ? 'text-white text-2xl font-bold scale-105' : 'text-gray-400 text-lg'}`}>
                                  {line.text}
                              </p>
                          ))}
                      </div>
                  ) : (
                      <div className="relative w-full max-w-sm aspect-square mb-8">
                          <div className={`w-full h-full rounded-full overflow-hidden border-4 border-white/10 shadow-2xl ${isPlaying ? 'animate-spin-slow' : ''}`}>
                              <SecureImage src={currentSong.coverUrl} className="w-full h-full object-cover" />
                          </div>
                      </div>
                  )
              )}
          </div>

          <div className="relative z-10 p-8 pb-12 w-full max-w-3xl mx-auto flex flex-col gap-6">
              <div className="flex justify-between items-end">
                  <div>
                      <h2 className="text-2xl font-bold text-white mb-1 line-clamp-1">{currentSong.title}</h2>
                      <p className="text-gray-300 text-lg">{currentSong.artist}</p>
                  </div>
                  <div className="flex gap-4">
                      {currentSong.mvId && <button onClick={() => setIsVideoMode(!isVideoMode)}><VideoIcon size={24} /></button>}
                      <button onClick={() => onToggleLike(currentSong)}><HeartIcon size={28} fill={isLiked ? "currentColor" : "none"} /></button>
                      <button onClick={() => onDownload(currentSong)}><DownloadIcon size={28} /></button>
                  </div>
              </div>

              <div className="flex flex-col gap-2">
                  <input type="range" min="0" max="100" value={progress} onChange={handleSeek} className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer" />
                  <div className="flex justify-between text-xs text-gray-400 font-mono">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration || currentSong.duration)}</span>
                  </div>
              </div>

              <div className="flex items-center justify-between">
                   <div className="flex items-center gap-8 mx-auto">
                       <button onClick={onPrev}><SkipBackIcon size={32} /></button>
                       <button onClick={onPlayPause} className="bg-white text-black rounded-full p-4 hover:scale-105 transition-transform">
                           {isPlaying ? <PauseIcon size={32} fill="currentColor" /> : <PlayIcon size={32} fill="currentColor" />}
                       </button>
                       <button onClick={onNext}><SkipForwardIcon size={32} /></button>
                   </div>
              </div>
          </div>
      </div>

      {/* Mini Player Bar - FIXED POSITION */}
      <div 
        className={`fixed bottom-[80px] md:bottom-0 left-0 right-0 bg-dark-light/95 backdrop-blur-xl border-t border-white/10 p-2 md:p-3 flex items-center justify-between z-50 transition-transform duration-300 ${isFullScreen ? 'translate-y-full' : 'translate-y-0'} ${!currentSong ? 'translate-y-full' : ''}`}
        onClick={() => setIsFullScreen(true)}
      >
        <div className="absolute top-0 left-0 h-[2px] bg-primary z-10" style={{ width: `${progress}%` }} />
        
        <div className="flex items-center gap-3 overflow-hidden flex-1 cursor-pointer">
            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0 relative ${isPlaying ? 'animate-spin-slow-paused' : ''}`}>
                <SecureImage src={currentSong.coverUrl} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
                <h4 className="font-bold text-sm truncate text-white">{currentSong.title}</h4>
                <p className="text-xs text-gray-400 truncate">{currentSong.artist}</p>
            </div>
        </div>

        <div className="flex items-center gap-1 md:gap-4 pr-2" onClick={e => e.stopPropagation()}>
            <button onClick={onPlayPause} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-white text-black">
                {isPlaying ? <PauseIcon size={20} fill="currentColor" /> : <PlayIcon size={20} fill="currentColor" />}
            </button>
            <button onClick={onNext} className="p-2 text-gray-300 hover:text-white hidden md:block"><SkipForwardIcon size={24} /></button>
            <button onClick={() => setIsFullScreen(true)} className="p-2 text-gray-300 hover:text-white md:hidden"><ListIcon size={20} /></button>
        </div>
      </div>
    </>
  );
};
