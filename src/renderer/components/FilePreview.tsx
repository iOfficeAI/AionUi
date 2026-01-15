/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Close } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { getFileExtension } from '@/renderer/services/FileService';
import { ipcBridge } from '@/common';
import { Image } from '@arco-design/web-react';
import fileIcon from '@/renderer/assets/file-icon.svg';

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];

const isImageFile = (path: string): boolean => {
  const ext = path.toLowerCase().slice(path.lastIndexOf('.'));
  return IMAGE_EXTS.includes(ext);
};

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
};

interface FilePreviewProps {
  path: string;
  onRemove: () => void;
  readonly?: boolean;
}

const FilePreview: React.FC<FilePreviewProps> = ({ path, onRemove, readonly = false }) => {
  // Defensive check: ensure path is a string
  if (typeof path !== 'string') {
    console.error('[FilePreview] Invalid path type:', typeof path, path);
    return null;
  }

  const isImage = isImageFile(path);
  // 直接从路径中提取文件名，不清理时间戳后缀
  // Extract filename directly from path without cleaning timestamp suffix
  const fileName = path.split(/[\\/]/).pop() || '';
  const fileExt = getFileExtension(path).toUpperCase().replace('.', '');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');

  useEffect(() => {
    // 获取文件大小
    ipcBridge.fs.getFileMetadata
      .invoke({ path })
      .then((metadata) => {
        setFileSize(formatFileSize(metadata.size));
      })
      .catch((error) => {
        console.error('[FilePreview] Failed to get file metadata:', { path, error });
      });

    // 如果是图片，获取图片的base64
    if (isImage) {
      ipcBridge.fs.getImageBase64
        .invoke({ path })
        .then((base64) => {
          setImageUrl(base64);
        })
        .catch((error) => {
          console.error('[FilePreview] Failed to load image:', { path, error });
        });
    }
  }, [path, isImage]);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  if (isImage) {
    return (
      <div className='relative inline-block'>
        <div className='rd-8px overflow-hidden border-1 border-solid b-color-border-2'>
          <Image src={imageUrl} alt={fileName} width={60} height={60} className='object-cover cursor-pointer' style={{ display: imageUrl ? 'block' : 'none' }} preview={imageUrl ? true : false} />
          {!imageUrl && <div className='w-60px h-60px bg-bg-3'></div>}
        </div>
        {!readonly && (
          <div className='absolute -top-4px -right-4px w-16px h-16px rd-50% bg-white dark:bg-gray-700 cursor-pointer flex items-center justify-center shadow-md hover:shadow-lg transition-all z-10 border-1 border-solid border-gray-200 dark:border-gray-600' onClick={handleRemove}>
            <Close theme='filled' size='10' fill='#666' />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className='relative inline-block mb-10px'>
      <div className='h-60px flex items-center gap-12px px-12px rd-8px bg-bg-2 border border-solid' style={{ borderColor: 'var(--border-base)', boxShadow: '0 0 0 1px rgba(0,0,0,0.02)' }}>
        <div className='w-40px h-40px rd-8px flex items-center justify-center flex-shrink-0'>
          <img className='w-full h-full object-contain' src={fileIcon} alt='File Icon' />
        </div>
        <div className='flex flex-col gap-2px min-w-0'>
          <span className='text-14px text-t-primary max-w-150px truncate'>{fileName}</span>
          <span className='text-12px text-t-secondary'>
            {fileExt}: {fileSize || '...'}
          </span>
        </div>
      </div>
      {!readonly && (
        <div className='absolute -top-4px -right-4px w-16px h-16px rd-50% bg-white dark:bg-gray-700 cursor-pointer flex items-center justify-center shadow-md hover:shadow-lg transition-all z-10 border-1 border-solid border-gray-200 dark:border-gray-600' onClick={handleRemove}>
          <Close theme='filled' size='10' fill='#666' />
        </div>
      )}
    </div>
  );
};

export default FilePreview;
