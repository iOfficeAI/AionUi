/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Image } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ImagePreviewProps {
  file_path?: string;
  content?: string;
  file_name?: string;
  workspace?: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ file_path, content, file_name, workspace }) => {
  const { t } = useTranslation();
  const [imageSrc, setImageSrc] = useState<string>(content || '');
  const [loading, setLoading] = useState<boolean>(!!file_path && !content);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadImage = async () => {
      if (content) {
        setImageSrc(content);
        setLoading(false);
        setError(null);
        return;
      }

      if (!file_path) {
        setImageSrc('');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const base64 = await ipcBridge.fs.getImageBase64.invoke({ path: file_path, workspace });
        if (!base64) {
          throw new Error('Image file not found');
        }
        if (!isMounted) return;
        setImageSrc(base64);
      } catch (err) {
        if (!isMounted) return;
        console.error('[ImagePreview] Failed to load image:', err);
        setError(t('messages.imageLoadFailed', { defaultValue: 'Failed to load image' }));
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadImage();

    return () => {
      isMounted = false;
    };
  }, [content, file_path, t, workspace]);

  const renderStatus = () => {
    if (loading) {
      return <div className='text-14px text-t-secondary'>{t('common.loading', { defaultValue: 'Loading...' })}</div>;
    }

    if (error) {
      return (
        <div className='text-center text-14px text-t-secondary'>
          <div>{error}</div>
          {file_path && <div className='text-12px'>{file_path}</div>}
        </div>
      );
    }

    return (
      <Image
        src={imageSrc}
        alt={file_name || file_path || 'Image preview'}
        className='w-full h-full flex items-center justify-center [&_.arco-image-img]:w-full [&_.arco-image-img]:h-full [&_.arco-image-img]:object-contain'
        preview={!!imageSrc}
      />
    );
  };

  return <div className='flex-1 flex items-center justify-center bg-bg-1 p-24px overflow-auto'>{renderStatus()}</div>;
};

export default ImagePreview;
