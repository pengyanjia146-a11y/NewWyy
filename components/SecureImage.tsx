
import React, { useEffect, useState } from 'react';
import { CapacitorHttp } from '@capacitor/core';

interface SecureImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallbackSrc?: string;
}

export const SecureImage: React.FC<SecureImageProps> = ({ src, fallbackSrc, className, alt, ...props }) => {
  const [imgSrc, setImgSrc] = useState<string>(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // List of domains requiring special headers
    const restrictedDomains = ['i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com', 'music.126.net', 'p1.music.126.net', 'p2.music.126.net', 'p3.music.126.net', 'p4.music.126.net'];
    const needsProxy = restrictedDomains.some(d => src.includes(d));

    if (!needsProxy) {
        setImgSrc(src);
        return;
    }

    let active = true;
    const fetchImage = async () => {
        try {
            let referer = '';
            if (src.includes('hdslb.com')) referer = 'https://www.bilibili.com/';
            if (src.includes('music.126.net')) referer = 'https://music.163.com/';

            const response = await CapacitorHttp.get({
                url: src,
                responseType: 'blob', // Capacitor returns base64 string in 'data' for blob type
                headers: {
                    'Referer': referer,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (active && response.data) {
                // Determine mime type
                const mimeType = response.headers['content-type'] || 'image/jpeg';
                // CapacitorHttp returns base64 data directly for blob requests
                setImgSrc(`data:${mimeType};base64,${response.data}`);
            }
        } catch (error) {
            console.error('SecureImage load failed:', error);
            if(active) setHasError(true);
        }
    };

    fetchImage();
    return () => { active = false; };
  }, [src]);

  if (hasError && fallbackSrc) {
      return <img src={fallbackSrc} className={className} alt={alt} {...props} />;
  }

  return <img src={imgSrc} className={className} alt={alt} {...props} onError={() => setHasError(true)} />;
};
