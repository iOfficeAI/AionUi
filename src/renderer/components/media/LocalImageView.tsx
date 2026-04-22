import { ipcBridge } from '@/common';
import { joinPath } from '@/common/chat/chatLib';
import { LoadingTwo } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { createContext } from '@renderer/utils/ui/createContext';
import { iconColors } from '@/renderer/styles/colors';
import { IMAGE_RETRY_DELAY_MS, MAX_IMAGE_RETRIES, isImageNotFoundPlaceholder } from './imagePlaceholder';

const [useLocalImage, LocalImageProvider, useUpdateLocalImage] = createContext({ root: '' });

const LocalImageView: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> & {
  Provider: typeof LocalImageProvider;
  useUpdateLocalImage: typeof useUpdateLocalImage;
} = ({ src, alt, className }) => {
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(src);
  const { root } = useLocalImage();

  const absolutePath = useMemo(() => {
    if (!root) return src;
    if (
      src.startsWith('http') ||
      src.startsWith('data:') ||
      src.startsWith('/') ||
      src.startsWith('file:') ||
      src.startsWith('\\') ||
      /^[A-Za-z]:/.test(src)
    ) {
      return src;
    }
    return joinPath(root, src);
  }, [src, root]);

  useEffect(() => {
    setLoading(true);
    // Retry when the file is not found yet (race condition: chat message rendered
    // before the backend finishes writing the pasted/uploaded image to disk).
    let cancelled = false;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout>;

    const loadImage = () => {
      ipcBridge.fs.getImageBase64
        .invoke({ path: absolutePath })
        .then((base64) => {
          if (cancelled) return;
          if (isImageNotFoundPlaceholder(base64) && retryCount < MAX_IMAGE_RETRIES) {
            retryCount++;
            retryTimer = setTimeout(loadImage, IMAGE_RETRY_DELAY_MS);
            return;
          }
          setUrl(base64);
          setLoading(false);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error('[LocalImageView] Failed to load image:', {
            path: absolutePath,
            error,
          });
          setLoading(false);
        });
    };

    loadImage();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [absolutePath]);
  if (loading)
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <LoadingTwo
          className='loading'
          style={{ display: 'flex' }}
          theme='outline'
          size='14'
          fill={iconColors.primary}
          strokeWidth={2}
        />
        <span>{alt}</span>
      </span>
    );
  return <img src={url} alt={alt} className={className} />;
};

LocalImageView.Provider = LocalImageProvider;
LocalImageView.useUpdateLocalImage = useUpdateLocalImage;

export default LocalImageView;
