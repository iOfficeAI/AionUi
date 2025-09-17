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
 * 共享的PasteService集成hook
 * 消除SendBox组件和GUID页面中的PasteService集成重复代码
 */
export const usePasteService = ({ componentId, supportedExts, onFilesAdded, setInput, input }: UsePasteServiceProps) => {
  // 粘贴事件处理
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

  // PasteService集成
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
