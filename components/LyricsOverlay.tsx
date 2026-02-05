import React, { useEffect, useRef, useState } from 'react';
import { Song } from '../types';
import { SecureImage } from './SecureImage';
import { PlayIcon, HeartIcon } from './Icons';

interface Props {
    song: Song | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    onClose: () => void;
    onPlayPause: () => void;
    onNext: () => void;
    onPrev: () => void;
    onSeek: (time: number) => void;
}

interface LyricLine {
    time: number;
    text: string;
}

export const LyricsOverlay: React.FC<Props> = ({ song, isPlaying, currentTime, duration, onClose, onPlayPause, onNext, onPrev, onSeek }) => {
    const [lyrics, setLyrics] = useState<LyricLine[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // 解析歌词
    useEffect(() => {
        if (!song?.lyric) {
            setLyrics([{ time: 0, text: '暂无歌词' }]);
            return;
        }
        const lines = song.lyric.split('\n');
        const parsed: LyricLine[] = [];
        const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
        
        lines.forEach(line => {
            const match = timeReg.exec(line);
            if (match) {
                const min = parseInt(match[1]);
                const sec = parseInt(match[2]);
                const ms = parseInt(match[3].padEnd(3, '0'));
                parsed.push({
                    time: min * 60 + sec + ms / 1000,
                    text: line.replace(timeReg, '').trim()
                });
            }
        });
        setLyrics(parsed);
    }, [song]);

    // 同步滚动
    useEffect(() => {
        const idx = lyrics.findIndex((l, i) => {
            const next = lyrics[i + 1];
            return currentTime >= l.time && (!next || currentTime < next.time);
        });
        
        if (idx !== -1 && idx !== activeIndex) {
            setActiveIndex(idx);
            // 保持高亮行在中间
            if (scrollRef.current) {
                const el = scrollRef.current.children[idx] as HTMLElement;
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    }, [currentTime, lyrics]);

    if (!song) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black text-white overflow-hidden animate-slide-up">
            {/* 动态背景 */}
            <div className="absolute inset-0 z-0">
                <SecureImage src={song.coverUrl} className="w-full h-full object-cover opacity-30 blur-3xl scale-125" />
                <div className="absolute inset-0 bg-black/40" />
            </div>

            {/* 顶部栏 */}
            <div className="relative z-10 p-6 flex justify-between items-center">
                <button onClick={onClose} className="bg-white/10 p-2 rounded-full backdrop-blur-md">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div className="text-center w-2/3">
                    <h2 className="text-lg font-bold truncate">{song.title}</h2>
                    <p className="text-sm text-gray-300 truncate">{song.artist}</p>
                </div>
                <div className="w-10"></div>
            </div>

            {/* 歌词区域 */}
            <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar mask-gradient py-10" ref={scrollRef}>
                <div className="h-[40vh]"></div> {/* Padding top */}
                {lyrics.map((line, i) => (
                    <p key={i} 
                       className={`text-center py-3 px-6 transition-all duration-500 origin-center ${i === activeIndex ? 'text-white text-2xl font-bold scale-105' : 'text-gray-400/60 text-lg blur-[0.5px]'}`}>
                        {line.text || '...'}
                    </p>
                ))}
                <div className="h-[40vh]"></div> {/* Padding bottom */}
            </div>

            {/* 底部控制栏 */}
            <div className="relative z-10 p-8 pb-12 bg-gradient-to-t from-black/80 to-transparent">
                {/* 进度条 */}
                <div className="flex items-center gap-3 mb-6">
                    <span className="text-xs text-gray-400">{formatTime(currentTime)}</span>
                    <input 
                        type="range" 
                        min="0" max={duration || 100} 
                        value={currentTime} 
                        onChange={(e) => onSeek(Number(e.target.value))}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                    />
                    <span className="text-xs text-gray-400">{formatTime(duration)}</span>
                </div>

                {/* 按钮 */}
                <div className="flex justify-around items-center">
                    <button onClick={onPrev}><svg width="32" height="32" fill="white" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                    <button onClick={onPlayPause} className="bg-white text-black p-4 rounded-full hover:scale-105 transition-transform">
                        {isPlaying ? 
                            <svg width="32" height="32" fill="black" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : 
                            <svg width="32" height="32" fill="black" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        }
                    </button>
                    <button onClick={onNext}><svg width="32" height="32" fill="white" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
                </div>
            </div>
        </div>
    );
};

const formatTime = (s: number) => {
    if (!s) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
};
