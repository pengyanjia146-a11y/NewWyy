import React, { useState } from 'react';
import { UserProfile } from '../types';
import { NeteaseIcon, CookieIcon, CloseIcon } from './Icons';
import { musicService } from '../services/geminiService';

interface LoginModalProps {
  onLogin: (user: UserProfile) => void;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLogin, onClose }) => {
  const [cookieVal, setCookieVal] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCookieLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      const rawInput = cookieVal.trim();
      if (!rawInput) return;
      
      setLoading(true);
      try {
          // Use the service's smart extraction
          const res = await musicService.getUserStatus(rawInput);
          
          if (res.profile) {
              const user: UserProfile = {
                  id: String(res.profile.userId),
                  nickname: res.profile.nickname,
                  avatarUrl: res.profile.avatarUrl,
                  isVip: res.profile.vipType > 0,
                  platform: 'netease',
                  // Save the cleaned cookie value returned by service
                  cookie: res._cleanedCookie || rawInput 
              };
              onLogin(user);
          } else {
              alert("登录失败：未检测到有效 Cookie。\n请确保粘贴内容中包含 MUSIC_U。");
          }
      } catch (e) {
          alert("登录请求失败，请检查网络");
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-dark-light rounded-2xl w-full max-w-sm p-6 relative border border-white/10 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><CloseIcon size={24} /></button>

        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-netease rounded-full flex items-center justify-center mb-4 shadow-lg shadow-netease/30">
            <NeteaseIcon className="text-white w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold">网易云音乐登录</h2>
          <p className="text-xs text-gray-400 mt-2">智能 Cookie 识别</p>
        </div>

        <form onSubmit={handleCookieLogin} className="flex flex-col space-y-4 animate-fade-in">
             <div className="bg-white/5 p-3 rounded-lg text-xs text-gray-400 leading-relaxed border border-white/5">
                <p className="font-bold text-gray-300 mb-1">使用说明:</p>
                <p className="mb-2">系统会自动提取粘贴内容中的核心密钥。</p>
                <p className="text-gray-500">支持格式：</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                    <li>完整 Request Headers</li>
                    <li>完整 Cookie 字符串</li>
                    <li>单独的 MUSIC_U 值</li>
                </ul>
             </div>
            <textarea 
              placeholder="请粘贴 Cookie 内容..." 
              value={cookieVal}
              onChange={(e) => setCookieVal(e.target.value)}
              className="w-full h-24 bg-black/30 border border-white/10 rounded-lg p-3 text-xs focus:border-netease focus:outline-none transition-colors font-mono resize-none"
              required
            />
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-netease hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : "智 能 识 别 并 登 录"}
            </button>
        </form>
      </div>
    </div>
  );
};