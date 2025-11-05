import type { FileMetadata } from '@/renderer/services/FileService';
import { PasteService } from '@/renderer/services/PasteService';
import { useCallback, useEffect, useRef } from 'react';
import { uuid } from '../utils/common';

interface UsePasteServiceProps {
  supportedExts: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
  onTextPaste?: (text: string) => void;
}

/**
 * 通用的PasteService集成hook
 * 为所有组件提供统一的粘贴处理功能
 */
export const usePasteService = ({ supportedExts, onFilesAdded, onTextPaste }: UsePasteServiceProps) => {
  const componentId = useRef('paste-service-' + uuid(4)).current;
  // 统一的粘贴事件处理
  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      // 检查是否有文件，如果有文件立即阻止默认行为
      const files = event.clipboardData?.files;
      if (files && files.length > 0) {
        event.preventDefault();
        event.stopPropagation();
      }

      const handled = await PasteService.handlePaste(event, supportedExts, onFilesAdded || (() => {}), onTextPaste);
      if (handled && (!files || files.length === 0)) {
        // 如果不是文件粘贴但被处理了（比如纯文本粘贴），也阻止默认行为
        event.preventDefault();
        event.stopPropagation();
      }
      return handled;
    },
    [supportedExts, onFilesAdded, onTextPaste]
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
