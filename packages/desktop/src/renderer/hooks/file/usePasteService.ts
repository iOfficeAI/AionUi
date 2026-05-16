import type { FileMetadata } from '@/renderer/services/FileService';
import type { UploadSource } from '@/renderer/hooks/file/useUploadState';
import type { ImageCounter } from '@/renderer/services/PasteService';
import { PasteService } from '@/renderer/services/PasteService';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from '@arco-design/web-react';
import { uuid } from '@renderer/utils/common';

interface UsePasteServiceProps {
  supportedExts: string[];
  onFilesAdded?: (files: FileMetadata[]) => void;
  onTextPaste?: (text: string) => void;
  /** Conversation ID for WebUI file uploads */
  conversation_id?: string;
  source?: UploadSource;
}

/**
 * 通用的PasteService集成hook
 * 为所有组件提供统一的粘贴处理功能
 */
export const usePasteService = ({
  supportedExts,
  onFilesAdded,
  onTextPaste,
  conversation_id,
  source = 'sendbox',
}: UsePasteServiceProps) => {
  const { t } = useTranslation();
  const componentId = useRef('paste-service-' + uuid(4)).current;

  // 跨 handlePaste 调用保持的粘贴图片序号。生命周期 = hook 实例 = SendBox mount，
  // 每个 SendBox 独立一个计数器；组件卸载 -> 重建时归零，符合“关闭后归零可接受”。
  const pastedImageCounter = useRef(0);
  const imageCounter = useMemo<ImageCounter>(
    () => ({
      next: () => ++pastedImageCounter.current,
    }),
    []
  );

  // 统一的粘贴事件处理
  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      // 检查是否有文件，如果有文件立即阻止默认行为
      const files = event.clipboardData?.files;
      if (files && files.length > 0) {
        event.preventDefault();
        event.stopPropagation();
      }

      try {
        const handled = await PasteService.handlePaste(
          event,
          supportedExts,
          onFilesAdded || (() => {}),
          onTextPaste,
          conversation_id,
          source,
          imageCounter
        );
        if (handled && (!files || files.length === 0)) {
          // 如果不是文件粘贴但被处理了（比如纯文本粘贴），也阻止默认行为
          event.preventDefault();
          event.stopPropagation();
        }
        return handled;
      } catch (err) {
        Message.error(t('common.fileAttach.failed'));
        return false;
      }
    },
    [conversation_id, source, supportedExts, onFilesAdded, onTextPaste, imageCounter, t]
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
