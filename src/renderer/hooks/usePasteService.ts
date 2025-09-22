import type { FileMetadata } from '@/renderer/services/FileService';
import { PasteService } from '@/renderer/services/PasteService';
import { useCallback, useEffect, useRef } from 'react';
import { uuid } from '../utils/common';

interface UsePasteServiceProps {
  supportedExts: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
}

/**
 * 通用的PasteService集成hook
 * 为所有组件提供统一的粘贴处理功能
 */
export const usePasteService = ({ supportedExts, onFilesAdded }: UsePasteServiceProps) => {
  const componentId = useRef('paste-service-' + uuid(4)).current;
  // 统一的粘贴事件处理
  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      if (!onFilesAdded) return false;
      return await PasteService.handlePaste(event, supportedExts, onFilesAdded);
    },
    [supportedExts, onFilesAdded]
  );

  // 焦点处理
  const handleFocus = useCallback(() => {
    PasteService.setLastFocusedComponent(componentId);
  }, [componentId]);

  // 注册粘贴处理器
  useEffect(() => {
    PasteService.init();
    PasteService.registerHandler(componentId, handlePaste);

    return () => {
      PasteService.unregisterHandler(componentId);
    };
  }, [componentId, handlePaste]);

  return {
    onFocus: handleFocus,
    onPaste: handlePaste,
  };
};
