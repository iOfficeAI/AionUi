/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from '@arco-design/web-react';
import type { FileMetadata } from '../services/FileService';
import { filterSupportedFiles, FileService } from '../services/FileService';

export interface UseDragUploadOptions {
  supportedExts?: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
}

export const useDragUpload = ({ supportedExts = [], onFilesAdded }: UseDragUploadOptions) => {
  const { t } = useTranslation();
  const [isFileDragging, setIsFileDragging] = useState(false);

  // 拖拽计数器，防止状态闪烁
  const dragCounter = useRef(0);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isFileDragging) {
        setIsFileDragging(true);
        dragCounter.current += 1;
      }
    },
    [isFileDragging]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current += 1;
    setIsFileDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current -= 1;

    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsFileDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // 重置状态
      dragCounter.current = 0;
      setIsFileDragging(false);

      if (!onFilesAdded) return;

      try {
        // Process files through FileService (handles temporary file creation)
        const processedFiles = await FileService.processDroppedFiles(e.nativeEvent.dataTransfer!.files);

        // Filter supported files
        const supportedFiles = filterSupportedFiles(processedFiles, supportedExts);

        if (supportedFiles.length > 0) {
          onFilesAdded(supportedFiles);
        }
      } catch (err) {
        console.error('Failed to process dropped files:', err);
        Message.error(t('sendbox.dropFileError', 'Failed to process dropped files'));
      }
    },
    [onFilesAdded, supportedExts, t]
  );

  const dragHandlers = {
    onDragOver: handleDragOver,
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  return {
    isFileDragging,
    dragHandlers,
  };
};
