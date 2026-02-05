import React, { useEffect, useState } from 'react';
import { ActivityIcon, CloseIcon } from './Icons';

export type ToastType = 'success' | 'error' | 'loading' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  isVisible: boolean;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, isVisible, onClose }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShow(true);
      if (type !== 'loading') {
        const timer = setTimeout(() => {
          setShow(false);
          setTimeout(onClose, 300); // Wait for animation
        }, 2000);
        return () => clearTimeout(timer);
      }
    } else {
      setShow(false);
    }
  }, [isVisible, type, onClose]);

  if (!isVisible && !show) return null;

  let bgClass = 'bg-gray-800';
  let icon = null;

  switch (type) {
    case 'success':
      bgClass = 'bg-green-600';
      icon = <span className="text-white font-bold">✓</span>;
      break;
    case 'error':
      bgClass = 'bg-red-600';
      icon = <span className="text-white font-bold">✕</span>;
      break;
    case 'loading':
      bgClass = 'bg-blue-600';
      icon = <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>;
      break;
    case 'info':
    default:
      bgClass = 'bg-gray-700';
      icon = <ActivityIcon size={16} />;
      break;
  }

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 transform ${show ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}>
      <div className={`${bgClass} text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 min-w-[200px] justify-center backdrop-blur-md bg-opacity-90 border border-white/10`}>
        {icon}
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
};