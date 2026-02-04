import React, { useEffect, useState, useRef } from 'react';
import { Song, MusicSource, AudioQuality } from '../types';
import { PlayIcon, PauseIcon, SkipForwardIcon, SkipBackIcon, NeteaseIcon, YouTubeIcon, LyricsIcon, CloseIcon, DownloadIcon, HeartIcon, VolumeIcon, VolumeMuteIcon, ChevronDownIcon, ListIcon, VideoIcon } from './Icons';
import { musicService } from '../services/geminiService';

// Helper for Lyrics
const parseLyrics = (lrc: string) => {
    if (!lrc) return [];
    const lines = lrc.split('\n');
    const result: { time: number; text: string }[] = [];
    const timeReg = /\[(\d{2}):(\d{2})(\.\d{2,3})?\]/g;
    
    for (const line of lines) {
        let match;
        const matches = [];
        // Support multiple timestamps per line e.g. [00:01.00][00:10.00]Lyric
        while ((match = timeReg.exec(line)) !== null) {
             matches.push({
                 min: parseInt(match[1]),
                 sec: parseInt(match[2]),
                 ms: match[3] ? parseFloat(match[3]) : 0,
             });
        }
        
        if (matches.length > 0) {
            const text = line.replace(timeReg, '').trim();
            if (text) {
                matches.forEach(m => {
                    const time = m.min * 60 + m.sec + m.ms;
                    result.push({ time, text });
                });
            }
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
  
  // Fullscreen State
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsLines, setLyricsLines] = useState<{time: number, text: string}[]>([]);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const activeLyricRef = useRef<HTMLParagraphElement>(null);

  // Network Speed Simulation
  const [netSpeed, setNetSpeed] = useState<string>('0 KB/s');
  const [isBuffering, setIsBuffering] = useState(false);

  // Error State
  const [error, setError] = useState<string | null>(null);
  
  // Volume State
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // MV State
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  // Enhanced Background Playback (MediaSession API)
  useEffect(() => {
    if (currentSong && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentSong.title,
            artist: currentSong.artist,
            album: currentSong.album,
            artwork: [
                { src: currentSong.coverUrl, sizes: '512x512', type: 'image/jpeg' }
            ]
        });

        navigator.mediaSession.setActionHandler('play', () => { onPlayPause(); });
        navigator.mediaSession.setActionHandler('pause', () => { onPlayPause(); });
        navigator.mediaSession.setActionHandler('previoustrack', onPrev);
        navigator.mediaSession.setActionHandler('nexttrack', onNext);
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (isVideoMode && videoRef.current && details.seekTime !== undefined) {
                 videoRef.current.currentTime = details.seekTime;
            } else if (audioRef.current && details.seekTime !== undefined) {
                audioRef.current.currentTime = details.seekTime;
            }
        });
    }
  }, [currentSong, isVideoMode, onPlayPause, onNext, onPrev]);

  // Handle Song Change
  useEffect(() => {
    if (currentSong) {
        setError(null);
        setLyricsLines(parseLyrics(currentSong.lyric || ''));
        setIsVideoMode(false); // Reset to audio on song change
        setVideoUrl('');
        setDuration(currentSong.duration || 0);
    }
  }, [currentSong]);

  // Sync Play/Pause
  useEffect(() => {
      if (isVideoMode && videoRef.current) {
          if (isPlaying) videoRef.current.play().catch(()=>{});
          else videoRef.current.pause();
          if (audioRef.current) audioRef.current.pause();
      } else if (audioRef.current) {
          if (isPlaying) audioRef.current.play().catch(()=>{});
          else audioRef.current.pause();
          if (videoRef.current) videoRef.current.pause();
      }
  }, [isPlaying, isVideoMode]);

  // Sync Audio Source
  useEffect(() => {
    if (audioRef.current && currentSong?.audioUrl && !isVideoMode) {
         if (audioRef.current.src !== currentSong.audioUrl) {
             audioRef.current.src = currentSong.audioUrl;
             if(isPlaying) audioRef.current.play().catch(()=>{});
         }
    }
  }, [currentSong?.audioUrl, isVideoMode, isPlaying]);

  // Network Speed Simulation Hook
  useEffect(() => {
      let interval: any;
      if (isBuffering) {
          interval = setInterval(() => {
              const speed = Math.floor(Math.random() * (2048 - 200) + 200);
              setNetSpeed(speed > 1024 ? `${(speed/1024).toFixed(1)} MB/s` : `${speed} KB/s`);
          }, 800);
      } else {
          setNetSpeed('');
      }
      return () => clearInterval(interval);
  }, [isBuffering]);

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
    if (videoRef.current) videoRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Auto scroll lyrics
  useEffect(() => {
      if (showLyrics && activeLyricRef.current && lyricsRef.current) {
          activeLyricRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
          });
      }
  }, [currentTime, showLyrics]);

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    if (el) {
      setCurrentTime(el.currentTime);
      if (el.duration && !isNaN(el.duration) && el.duration !== Infinity) {
          setDuration(el.duration);
      }
      const percent = (el.currentTime / (el.duration || 1)) * 100;
      setProgress(percent || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = isVideoMode ? videoRef.current : audioRef.current;
      const d = duration || currentSong?.duration || 0;
      if (target && d > 0) {
          const seekTime = (parseFloat(e.target.value) / 100) * d;
          target.currentTime = seekTime;
          setProgress(parseFloat(e.target.value));
          setCurrentTime(seekTime);
      }
  };

  const toggleVideoMode = async () => {
      if (!currentSong) return;
      
      if (!isVideoMode) {
          // Switch to Video
          if (!videoUrl) {
              setIsBuffering(true);
              const url = await musicService.getMvUrl(currentSong);
              setIsBuffering(false);
              if (url) {
                  setVideoUrl(url);
                  setIsVideoMode(true);
                  // Sync time
                  setTimeout(() => {
                      if(videoRef.current) {
                          videoRef.current.currentTime = currentTime;
                          if(isPlaying) videoRef.current.play();
                      }
                  }, 100);
              } else {
                  setError("无 MV 资源");
                  setTimeout(() => setError(null), 2000);
              }
          } else {
              setIsVideoMode(true);
              setTimeout(() => {
                  if(videoRef.current) {
                      videoRef.current.currentTime = currentTime;
                      if(isPlaying) videoRef.current.play();
                  }
              }, 100);
          }
      } else {
          // Switch back to Audio
          setIsVideoMode(false);
          if (audioRef.current) {
              audioRef.current.currentTime = currentTime;
              if (isPlaying) audioRef.current.play();
          }
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
      <audio 
          ref={audioRef} 
          onTimeUpdate={handleTimeUpdate} 
          onEnded={onNext}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onError={() => { setIsBuffering(false); setError("加载失败"); }}
      />
      
      {/* Full Screen Player */}
      <div className={`fixed inset-0 z-[60] bg-gray-900 flex flex-col transition-all duration-500 ease-in-out ${isFullScreen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
          {/* Background Blur */}
          <div className="absolute inset-0 z-0 opacity-40">
              <img src={currentSong.coverUrl} className="w-full h-full object-cover blur-3xl" />
              <div className="absolute inset-0 bg-black/50" />
          </div>

          {/* Header */}
          <div className="relative z-10 flex items-center justify-between p-6 pt-12 md:pt-6">
              <button onClick={() => setIsFullScreen(false)} className="text-white/70 hover:text-white p-2">
                  <ChevronDownIcon size={32} />
              </button>
              <div className="flex flex-col items-center">
                  <span className="text-xs text-white/60 mb-1">正在播放</span>
                  <span className="text-sm font-medium">{currentSong.source === MusicSource.NETEASE ? '网易云音乐' : (currentSong.source === MusicSource.YOUTUBE ? 'YouTube' : (currentSong.source === MusicSource.PLUGIN ? '插件音乐' : '本地音乐'))}</span>
              </div>
              <button className="text-white/70 hover:text-white p-2" onClick={() => setShowLyrics(!showLyrics)}>
                  <LyricsIcon size={24} fill={showLyrics ? "currentColor" : "none"} />
              </button>
          </div>

          {/* Main Content */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
              {isVideoMode ? (
                  <div className="w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl relative">
                      <video 
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full h-full object-contain"
                        onTimeUpdate={handleTimeUpdate}
                        onEnded={onNext}
                        onWaiting={() => setIsBuffering(true)}
                        onPlaying={() => setIsBuffering(false)}
                        onClick={onPlayPause}
                      />
                      {isBuffering && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div></div>}
                  </div>
              ) : (
                  showLyrics ? (
                      <div ref={lyricsRef} className="w-full h-full overflow-y-auto no-scrollbar text-center space-y-8 mask-linear-y py-10">
                          {lyricsLines.length > 0 ? lyricsLines.map((line, idx) => (
                              <p 
                                key={idx} 
                                ref={idx === currentLyricIndex ? activeLyricRef : null}
                                className={`transition-all duration-300 px-4 ${idx === currentLyricIndex ? 'text-white text-2xl md:text-3xl font-bold scale-105' : 'text-gray-400 text-lg md:text-xl'}`}
                              >
                                  {line.text}
                              </p>
                          )) : <p className="text-gray-400 mt-20">暂无歌词</p>}
                      </div>
                  ) : (
                      <div className="relative w-full max-w-sm aspect-square mb-8">
                          <div className={`w-full h-full rounded-full overflow-hidden border-4 border-white/10 shadow-2xl ${isPlaying ? 'animate-spin-slow' : ''}`}>
                              <img src={currentSong.coverUrl} className="w-full h-full object-cover" />
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-1/3 h-1/3 bg-gray-900 rounded-full border border-gray-800 shadow-inner flex items-center justify-center">
                                  <div className="w-1/2 h-1/2 bg-cover rounded-full opacity-80" style={{backgroundImage: `url(${currentSong.coverUrl})`}}></div>
                              </div>
                          </div>
                      </div>
                  )
              )}
          </div>

          {/* Controls Footer */}
          <div className="relative z-10 p-8 pb-12 w-full max-w-3xl mx-auto flex flex-col gap-6">
              {/* Info & Actions */}
              <div className="flex justify-between items-end">
                  <div>
                      <h2 className="text-2xl font-bold text-white mb-1 line-clamp-1">{currentSong.title}</h2>
                      <p className="text-gray-300 text-lg">{currentSong.artist}</p>
                  </div>
                  <div className="flex gap-4">
                      {isBuffering && <span className="text-xs text-green-400 animate-pulse font-mono mr-2">{netSpeed}</span>}
                      {currentSong.mvId && (
                          <button onClick={toggleVideoMode} className={`p-2 rounded-full ${isVideoMode ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}>
                              <VideoIcon size={24} />
                          </button>
                      )}
                      <button onClick={() => onToggleLike(currentSong)} className="text-white hover:text-red-500 transition-colors">
                          <HeartIcon size={28} fill={isLiked ? "currentColor" : "none"} />
                      </button>
                      <button onClick={() => onDownload(currentSong)} className="text-white hover:text-primary transition-colors">
                          <DownloadIcon size={28} />
                      </button>
                  </div>
              </div>

              {/* Progress */}
              <div className="flex flex-col gap-2">
                  <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={progress}
                      onChange={handleSeek}
                      className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                  />
                  <div className="flex justify-between text-xs text-gray-400 font-mono">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration || currentSong.duration)}</span>
                  </div>
              </div>

              {/* Main Controls */}
              <div className="flex items-center justify-between">
                   <div className="flex items-center gap-4">
                       <button onClick={() => setQuality(quality === 'standard' ? 'exhigh' : (quality === 'exhigh' ? 'lossless' : 'standard'))} className="text-xs border border-white/30 rounded px-2 py-1 text-gray-300 hover:border-white hover:text-white transition-all w-12 text-center">
                           {quality === 'standard' ? '标准' : (quality === 'exhigh' ? '极高' : '无损')}
                       </button>
                   </div>
                   
                   <div className="flex items-center gap-8">
                       <button onClick={onPrev} className="text-white hover:text-gray-300 transition-colors"><SkipBackIcon size={32} /></button>
                       <button onClick={onPlayPause} className="bg-white text-black rounded-full p-4 hover:scale-105 transition-transform shadow-lg shadow-white/20">
                           {isPlaying ? <PauseIcon size={32} fill="currentColor" /> : <PlayIcon size={32} fill="currentColor" />}
                       </button>
                       <button onClick={onNext} className="text-white hover:text-gray-300 transition-colors"><SkipForwardIcon size={32} /></button>
                   </div>
                   
                   <div className="flex items-center gap-2 group relative">
                       <button onClick={() => setIsMuted(!isMuted)} className="text-gray-400 hover:text-white">
                           {isMuted ? <VolumeMuteIcon size={24} /> : <VolumeIcon size={24} />}
                       </button>
                   </div>
              </div>
          </div>
      </div>

      {/* Mini Player Bar */}
      <div 
        className={`fixed bottom-0 left-0 right-0 bg-dark-light/95 backdrop-blur-xl border-t border-white/10 p-2 md:p-3 flex items-center justify-between z-50 transition-transform duration-300 ${isFullScreen ? 'translate-y-full' : 'translate-y-0'} ${!currentSong ? 'translate-y-full' : ''}`}
        onClick={() => setIsFullScreen(true)}
      >
        <div className="absolute top-0 left-0 h-[2px] bg-primary z-10" style={{ width: `${progress}%` }} />
        
        <div className="flex items-center gap-3 overflow-hidden flex-1 cursor-pointer">
            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0 relative ${isPlaying ? 'animate-spin-slow-paused' : ''}`}>
                <img src={currentSong.coverUrl} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
                <h4 className="font-bold text-sm truncate text-white">{currentSong.title}</h4>
                <p className="text-xs text-gray-400 truncate">{currentSong.artist}</p>
            </div>
        </div>

        <div className="flex items-center gap-1 md:gap-4 pr-2" onClick={e => e.stopPropagation()}>
            <button onClick={onPlayPause} className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 transition-transform">
                {isPlaying ? <PauseIcon size={20} fill="currentColor" /> : <PlayIcon size={20} fill="currentColor" />}
            </button>
            <button onClick={onNext} className="p-2 text-gray-300 hover:text-white hidden md:block">
                <SkipForwardIcon size={24} />
            </button>
            <button onClick={() => setIsFullScreen(true)} className="p-2 text-gray-300 hover:text-white md:hidden">
                <ListIcon size={20} />
            </button>
        </div>
      </div>
    </>
  );
};