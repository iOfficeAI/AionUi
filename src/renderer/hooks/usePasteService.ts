import { useCallback, useEffect } from 'react';
import { PasteService } from '@/renderer/services/PasteService';
import type { FileMetadata } from '@/renderer/services/FileService';

interface UsePasteServiceProps {
  componentId: string;
  supportedExts: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
  setInput?: (value: string) => void;
  input?: string;
}

/**
 * 通用的PasteService集成hook
 * 为所有组件提供统一的粘贴处理功能
 */
export const usePasteService = ({ componentId, supportedExts, onFilesAdded, setInput, input }: UsePasteServiceProps) => {
  // 统一的粘贴事件处理
  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      if (!onFilesAdded) return false;
      return await PasteService.handlePaste(event, supportedExts, onFilesAdded, setInput, input);
    },
    [supportedExts, onFilesAdded, setInput, input]
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
    handleFocus,
  };
};
