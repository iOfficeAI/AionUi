import { useCallback, useEffect } from 'react';
import { PasteService } from '@/renderer/services/PasteService';
import type { FileMetadata } from '@/renderer/services/FileService';

interface UsePasteServiceProps {
  componentId: string;
  supportedExts: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
  setInput?: (value: string) => void;
  input?: string;
  /** 粘贴模式：'standard' 为标准模式，'codex' 为 Codex 专用模式（避免文本重复） */
  mode?: 'standard' | 'codex';
}

/**
 * 共享的PasteService集成hook
 * 消除SendBox组件和GUID页面中的PasteService集成重复代码
 * 支持 Codex 专用模式，解决文本粘贴重复问题
 */
export const usePasteService = ({ componentId, supportedExts, onFilesAdded, setInput, input, mode = 'standard' }: UsePasteServiceProps) => {
  // 粘贴事件处理
  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      if (!onFilesAdded) return false;

      // Codex 专用模式：避免文本粘贴重复问题
      if (mode === 'codex') {
        const clipboardText = event.clipboardData?.getData('text');
        const files = event.clipboardData?.files;

        // Codex 特定逻辑：如果有文本但没有文件，只允许默认行为，不手动设置
        if (clipboardText && (!files || files.length === 0)) {
          // 不手动设置文本，让浏览器默认行为处理，避免重复
          return false; // 允许默认行为继续处理文本
        }

        // 如果有文件，使用标准的文件处理逻辑
        if (files && files.length > 0) {
          return await PasteService.handlePaste(event, supportedExts, onFilesAdded);
        }

        return false;
      }

      // 标准模式：使用完整的 PasteService 功能
      return await PasteService.handlePaste(event, supportedExts, onFilesAdded, setInput, input);
    },
    [supportedExts, onFilesAdded, setInput, input, mode]
  );

  // 焦点处理
  const handleFocus = useCallback(() => {
    // Codex 模式使用动态导入避免循环依赖
    if (mode === 'codex') {
      import('@/renderer/services/PasteService').then(({ PasteService }) => {
        PasteService.setLastFocusedComponent(componentId);
      });
    } else {
      PasteService.setLastFocusedComponent(componentId);
    }
  }, [componentId, mode]);

  // PasteService集成
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (mode === 'codex') {
      // Codex 模式使用动态导入避免循环依赖
      import('@/renderer/services/PasteService').then(({ PasteService }) => {
        PasteService.init();
        PasteService.registerHandler(componentId, handlePaste);

        cleanup = () => {
          PasteService.unregisterHandler(componentId);
        };
      });
    } else {
      // 标准模式直接使用
      PasteService.init();
      PasteService.registerHandler(componentId, handlePaste);

      cleanup = () => {
        PasteService.unregisterHandler(componentId);
      };
    }

    return () => {
      cleanup?.();
    };
  }, [componentId, handlePaste, mode]);

  return {
    handleFocus,
  };
};

/**
 * Codex 专用的粘贴服务集成hook（向后兼容别名）
 * @deprecated 请使用 usePasteService({ mode: 'codex', ... }) 替代
 */
export const useCodexPasteService = (props: Omit<UsePasteServiceProps, 'mode'>) => {
  return usePasteService({ ...props, mode: 'codex' });
};
