// Saved on 2026-02-05
// Original: components/Player.tsx

import React, { useEffect, useRef, useState } from 'react';
import { Song } from '../types';

interface PlayerProps {
  currentSong?: Song | null;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
}

const Player: React.FC<PlayerProps> = ({ currentSong, isPlaying, setIsPlaying }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    if (!audioRef.current) return;
    if (!currentSong) {
      audioRef.current.pause();
      audioRef.current.src = '';
      return;
    }

    if (currentSong.audioUrl) {
      const prevSrc = audioRef.current.src;
      audioRef.current.src = currentSong.audioUrl;
      audioRef.current.load();
      audioRef.current.play().then(() => setIsPlaying(true)).catch((e) => {
        console.warn('Auto-play blocked or failed', e);
      });
    } else {
      console.warn('No audioUrl provided for currentSong');
    }
  }, [currentSong]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  return (
    <div className="player">
      <audio ref={audioRef} controls preload="auto" />
      <div className="controls">
        <button onClick={() => { if (audioRef.current) { if (audioRef.current.paused) audioRef.current.play(); else audioRef.current.pause(); } }}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
      </div>
    </div>
  );
};

export default Player;
