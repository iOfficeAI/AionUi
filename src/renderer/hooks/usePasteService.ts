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

      const clipboardText = event.clipboardData?.getData('text');
      const files = event.clipboardData?.files;

      // 如果有文本但没有文件，只允许默认行为，不手动设置
      if (clipboardText && (!files || files.length === 0)) {
        // 不手动设置文本，让浏览器默认行为处理，避免重复
        return false; // 允许默认行为继续处理文本
      }

      // 如果有文件，使用标准的文件处理逻辑
      if (files && files.length > 0) {
        return await PasteService.handlePaste(event, supportedExts, onFilesAdded);
      }

      // 如果有文本，使用自定义的文本处理逻辑
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
