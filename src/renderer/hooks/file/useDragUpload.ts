/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from '@arco-design/web-react';
import type { FileMetadata } from '@renderer/services/FileService';
import { isSupportedFile, FileService, MAX_UPLOAD_SIZE_MB } from '@renderer/services/FileService';

// Only show upload progress UI in WebUI remote mode (no Electron path access)
const isWebUIMode = typeof window !== 'undefined' && !(window as Window & { electronAPI?: unknown }).electronAPI;

export interface UseDragUploadOptions {
  supportedExts?: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
  /** Conversation ID for WebUI file uploads */
  conversationId?: string;
}

export const useDragUpload = ({ supportedExts = [], onFilesAdded, conversationId }: UseDragUploadOptions) => {
  const { t } = useTranslation();
  const [isFileDragging, setIsFileDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());

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
        const droppedFiles = e.nativeEvent.dataTransfer!.files;

        // 第一步：先校验文件类型，筛选出支持的文件
        const validFiles: File[] = [];

        for (let i = 0; i < droppedFiles.length; i++) {
          const file = droppedFiles[i];
          if (supportedExts.length === 0 || isSupportedFile(file.name, supportedExts)) {
            validFiles.push(file);
          }
          // 注意：不支持的文件会被静默过滤，与原逻辑保持一致
        }

        // 第二步：只处理校验通过的文件
        if (validFiles.length > 0) {
          // 创建 FileList 对象给 processDroppedFiles
          const validFileList = Object.assign(validFiles, {
            length: validFiles.length,
            item: (index: number) => validFiles[index] || null,
          }) as unknown as FileList;
          // In WebUI remote mode: show progress UI during HTTP upload
          const UPLOAD_MSG_ID = 'aionui-upload-progress';
          if (isWebUIMode) {
            const initialProgress = new Map<string, number>();
            validFiles.forEach((f) => initialProgress.set(f.name, 0));
            setUploadingFiles(initialProgress);
            Message.loading({
              id: UPLOAD_MSG_ID,
              content: `${t('fileUpload.uploading', 'Uploading')}: 0%`,
              duration: 0,
            });
          }

          try {
            const fileProgressMap = new Map<string, number>();
            validFiles.forEach((f) => fileProgressMap.set(f.name, 0));
            const getOverallPct = () => {
              const vals = Array.from(fileProgressMap.values());
              return Math.round(vals.reduce((a, b) => a + b, 0) / validFiles.length);
            };

            const processedFiles = await FileService.processDroppedFiles(
              validFileList,
              conversationId,
              isWebUIMode
                ? (name, pct) => {
                    fileProgressMap.set(name, pct);
                    const overall = getOverallPct();
                    setUploadingFiles(new Map(fileProgressMap));
                    Message.loading({
                      id: UPLOAD_MSG_ID,
                      content: `${t('fileUpload.uploading', 'Uploading')}: ${overall}%`,
                      duration: 0,
                    });
                  }
                : undefined
            );

            if (processedFiles.length > 0) {
              onFilesAdded(processedFiles);
              if (isWebUIMode) {
                Message.success({ id: UPLOAD_MSG_ID, content: t('fileUpload.done', 'Upload complete'), duration: 2 });
              }
            } else if (isWebUIMode) {
              Message.error({
                id: UPLOAD_MSG_ID,
                content: t('conversation.workspace.dragFailed', 'Upload failed'),
                duration: 3,
              });
            }
          } catch (err) {
            if (isWebUIMode) {
              if (err instanceof Error && err.message === 'FILE_TOO_LARGE') {
                Message.error({
                  id: UPLOAD_MSG_ID,
                  content: t('common.fileAttach.tooLarge', { max: MAX_UPLOAD_SIZE_MB }),
                  duration: 3,
                });
              } else {
                Message.error({
                  id: UPLOAD_MSG_ID,
                  content: t('conversation.workspace.dragFailed', 'Upload failed'),
                  duration: 3,
                });
              }
            }
            throw err;
          } finally {
            setUploadingFiles(new Map());
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'FILE_TOO_LARGE') {
          if (!isWebUIMode) {
            Message.error(t('common.fileAttach.tooLarge', { max: MAX_UPLOAD_SIZE_MB }));
          }
        } else {
          console.error('Failed to process dropped files:', err);
          if (!isWebUIMode) {
            Message.error(t('conversation.workspace.dragFailed', 'Failed to process dropped files'));
          }
        }
      }
    },
    [conversationId, onFilesAdded, supportedExts, t]
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
    uploadingFiles,
    isUploading: uploadingFiles.size > 0,
  };
};
