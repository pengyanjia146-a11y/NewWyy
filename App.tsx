import React, { useEffect, useRef, useState } from 'react';
import { Song } from '../types';
import { SecureImage } from './SecureImage';

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

export const LyricsOverlay: React.FC<Props> = ({ song, isPlaying, currentTime, duration, onClose, onPlayPause, onNext, onPrev, onSeek }) => {
    const [lyrics, setLyrics] = useState<{time: number, text: string}[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // 解析歌词
    useEffect(() => {
        if (!song?.lyric) return setLyrics([{ time: 0, text: '暂无歌词' }]);
        const lines = song.lyric.split('\n');
        const parsed: {time: number, text: string}[] = [];
        const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
        lines.forEach(line => {
            const match = timeReg.exec(line);
            if (match) parsed.push({
                time: parseInt(match[1])*60 + parseInt(match[2]) + parseInt(match[3].padEnd(3,'0'))/1000,
                text: line.replace(timeReg, '').trim()
            });
        });
        setLyrics(parsed);
    }, [song]);

    // 滚动逻辑
    useEffect(() => {
        const idx = lyrics.findIndex((l, i) => {
            const next = lyrics[i + 1];
            return currentTime >= l.time && (!next || currentTime < next.time);
        });
        if (idx !== -1 && idx !== activeIndex) {
            setActiveIndex(idx);
            scrollRef.current?.children[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentTime, lyrics]);

    if (!song) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black text-white overflow-hidden animate-slide-up">
            <div className="absolute inset-0 z-0">
                <SecureImage src={song.coverUrl} className="w-full h-full object-cover opacity-30 blur-3xl scale-125" />
                <div className="absolute inset-0 bg-black/40" />
            </div>
            <div className="relative z-10 p-6 flex justify-between items-center">
                <button onClick={onClose} className="bg-white/10 p-2 rounded-full">✖</button>
                <div className="text-center w-2/3">
                    <h2 className="text-lg font-bold truncate">{song.title}</h2>
                    <p className="text-sm text-gray-300 truncate">{song.artist}</p>
                </div>
                <div className="w-10"></div>
            </div>
            <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar py-10" ref={scrollRef}>
                <div className="h-[40vh]"></div>
                {lyrics.map((line, i) => (
                    <p key={i} className={`text-center py-3 px-6 transition-all duration-500 origin-center ${i === activeIndex ? 'text-white text-2xl font-bold scale-105' : 'text-gray-400/60 text-lg blur-[0.5px]'}`}>
                        {line.text || '...'}
                    </p>
                ))}
                <div className="h-[40vh]"></div>
            </div>
        </div>
    );
};
