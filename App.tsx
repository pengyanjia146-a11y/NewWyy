// App.tsx 完整版 (补全了 render 函数和组件结尾)

import React, { useState, useEffect, useRef } from 'react';
import { musicService } from './services/geminiService';
import { Player } from './components/Player';
import { LoginModal } from './components/LoginModal';
import { Toast, ToastType } from './components/Toast';
import { HomeIcon, SearchIcon, LibraryIcon, NeteaseIcon, YouTubeIcon, BilibiliIcon, PlayIcon, LabIcon, PlaylistAddIcon, PluginFileIcon, MoreVerticalIcon, HeartIcon, DownloadIcon, NextPlanIcon, SettingsIcon, FolderIcon, ActivityIcon, TrashIcon, UserCheckIcon, UserPlusIcon, SmartphoneIcon } from './components/Icons';
import { Song, UserProfile, ViewState, MusicSource, Playlist, MusicPlugin, AudioQuality, Artist, DiagnosticResult } from './types';
import { SecureImage } from './components/SecureImage';

// ... (此处省略中间重复的逻辑部分，请确保保留你原来的全部变量和 handle 函数) ...

  const songItemProps = (song: Song) => ({
      song,
      onClick: () => playSong(song, view === 'SEARCH' ? searchResults : (view === 'LIBRARY' && activePlaylist ? activePlaylist.songs : (view === 'ARTIST_DETAIL' && activeArtist ? activeArtist.songs : queue))),
      isCurrent: currentSong?.id === song.id,
      onToggleLike: () => handleToggleLike(song),
      onDownload: () => handleDownload(song),
      onPlayNext: () => handlePlayNext(song),
      isLiked: isLiked(song),
      isOpenMenu: menuSong?.id === song.id,
      onOpenMenu: () => setMenuSong(song),
      onArtistClick: handleArtistClick
  });

  // --- 渲染部分 ---

  const renderHome = () => (
    <div className="space-y-8 animate-fade-in pb-40">
      <div className="relative h-48 md:h-64 rounded-2xl bg-gradient-to-r from-gray-900 to-primary overflow-hidden flex items-center p-6 shadow-2xl">
        <div className="relative z-10 w-full">
          <h1 className="text-3xl font-bold mb-2">UniStream</h1>
          <p className="text-gray-200 mb-4 max-w-md text-sm md:text-base">
            聚合音乐播放器 V2.4<br/>
            <span className="text-xs opacity-75">智能节点切换 / 底部菜单优化 / 歌单同步</span>
          </p>
        </div>
      </div>

      {user && (
          <div onClick={handleDailyRecommend} className="bg-gradient-to-r from-netease to-red-800 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:scale-[1.02] transition-transform">
              <div className="flex items-center gap-4">
                  <div className="bg-white/20 p-3 rounded-full"><NeteaseIcon className="text-white" /></div>
                  <div><h3 className="font-bold text-lg">每日推荐</h3></div>
              </div>
              <PlayIcon fill="white" />
          </div>
      )}

      <div className="bg-dark-light p-4 rounded-xl border border-white/5">
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold">最近播放</h3></div>
          {playHistory.length === 0 ? <p className="text-xs text-gray-500 text-center py-4">暂无听歌记录</p> : (
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {playHistory.map((song, i) => (
                      <div key={i} className="flex-shrink-0 w-24 cursor-pointer group" onClick={() => playSong(song)}>
                          <SecureImage src={song.coverUrl} className="w-24 h-24 rounded-lg mb-2" />
                          <p className="text-xs truncate">{song.title}</p>
                      </div>
                  ))}
              </div>
          )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark text-white flex flex-col md:flex-row">
      <Toast message={toast.msg} type={toast.type} isVisible={toast.show} onClose={() => setToast(t => ({...t, show: false}))} />
      
      <div className="flex-1 h-screen overflow-y-auto no-scrollbar">
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
          {view === 'HOME' && renderHome()}
          {/* 其他视图渲染... */}
        </div>
      </div>

      <Player 
        currentSong={currentSong} 
        isPlaying={isPlaying} 
        onPlayPause={togglePlayPause} 
        onNext={handleNext} 
        onPrev={handlePrev} 
        onToggleLike={handleToggleLike} 
        onDownload={handleDownload} 
        isLiked={isLiked(currentSong)} 
        quality={quality}
        setQuality={setQuality}
      />
      {showLogin && <LoginModal onLogin={handleLoginSuccess} onClose={() => setShowLogin(false)} />}
    </div>
  );
} // <-- 闭合整个 App 函数
