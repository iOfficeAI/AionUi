import { useCallback, useEffect } from 'react';
import type { FileMetadata } from '@/renderer/services/FileService';

interface UseCodexPasteServiceProps {
  componentId: string;
  supportedExts: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
  setInput?: (value: string) => void;
  input?: string;
}

/**
 * Codex 专用的粘贴服务集成hook
 * 解决文本粘贴重复问题，同时保持与其他智能体的兼容性
 */
export const useCodexPasteService = ({ componentId, supportedExts, onFilesAdded, setInput, input }: UseCodexPasteServiceProps) => {
  // Codex 专用的粘贴事件处理
  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      if (!onFilesAdded) return false;

      const clipboardText = event.clipboardData?.getData('text');
      const files = event.clipboardData?.files;

      // Codex 特定逻辑：如果有文本但没有文件，只允许默认行为，不手动设置
      if (clipboardText && (!files || files.length === 0)) {
        // 不手动设置文本，让浏览器默认行为处理，避免重复
        return false; // 允许默认行为继续处理文本
      }

      // 如果有文件，使用标准的文件处理逻辑
      if (files && files.length > 0) {
        // 这里可以复用 PasteService 的文件处理逻辑
        // 但为了避免依赖，我们可以实现一个简化版本
        // 或者调用 PasteService.handlePaste 但不传递 onTextAdded
        const { PasteService } = await import('@/renderer/services/PasteService');
        return await PasteService.handlePaste(event, supportedExts, onFilesAdded);
      }

      return false;
    },
    [supportedExts, onFilesAdded]
  );

  // 焦点处理
  const handleFocus = useCallback(() => {
    // 使用动态导入避免循环依赖
    import('@/renderer/services/PasteService').then(({ PasteService }) => {
      PasteService.setLastFocusedComponent(componentId);
    });
  }, [componentId]);

  // PasteService集成
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    import('@/renderer/services/PasteService').then(({ PasteService }) => {
      PasteService.init();
      PasteService.registerHandler(componentId, handlePaste);

      cleanup = () => {
        PasteService.unregisterHandler(componentId);
      };
    });

    return () => {
      cleanup?.();
    };
  }, [componentId, handlePaste]);

  return {
    handleFocus,
  };
};
