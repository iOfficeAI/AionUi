/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Image } from '@arco-design/web-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFileAsBlob, revokeFileBlob } from '@/renderer/utils/file/staticFile';

interface ImagePreviewProps {
  file_path?: string;
  content?: string;
  file_name?: string;
  workspace?: string;
  conversationId?: string;
  relativePath?: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
  file_path,
  content,
  file_name,
  workspace,
  conversationId,
  relativePath,
}) => {
  const { t } = useTranslation();
  const [imageSrc, setImageSrc] = useState<string>(content || '');
  const [loading, setLoading] = useState<boolean>(!!file_path && !content);
  const [error, setError] = useState<string | null>(null);
  const blobRef = useRef<{ conversationId: string; relativePath: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadImage = async () => {
      if (content) {
        setImageSrc(content);
        setLoading(false);
        setError(null);
        return;
      }

      if (!file_path && !relativePath) {
        setImageSrc('');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        let loaded = false;

        if (conversationId && relativePath) {
          try {
            const blobUrl = await fetchFileAsBlob(conversationId, relativePath, controller.signal);
            if (controller.signal.aborted) return;
            blobRef.current = { conversationId, relativePath };
            setImageSrc(blobUrl);
            loaded = true;
          } catch {
            if (controller.signal.aborted) return;
          }
        }

        if (!loaded && file_path) {
          const base64 = await ipcBridge.fs.getImageBase64.invoke({ path: file_path, workspace });
          if (controller.signal.aborted) return;
          if (!base64) {
            throw new Error('Image file not found');
          }
          setImageSrc(base64);
        } else if (!loaded) {
          throw new Error('No source available');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('[ImagePreview] Failed to load image:', err);
        setError(t('messages.imageLoadFailed', { defaultValue: 'Failed to load image' }));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadImage();

    return () => {
      controller.abort();
      if (blobRef.current) {
        revokeFileBlob(blobRef.current.conversationId, blobRef.current.relativePath);
        blobRef.current = null;
      }
    };
  }, [content, file_path, t, workspace, conversationId, relativePath]);

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
