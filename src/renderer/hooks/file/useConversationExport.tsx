import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import { Button } from '@arco-design/web-react';
import type { SlashCommandMenuItem } from '@/renderer/components/chat/SlashCommandMenu';
import {
  type ExportTranscriptLabels,
  buildConversationExportText,
  buildDefaultExportFileName,
  getDefaultExportFileNameSource,
  joinFilePath,
  normalizeExportFileName,
  resolveExportBaseDirectory,
} from '@/renderer/utils/chat/conversationExport';
import { copyText } from '@/renderer/utils/ui/clipboard';
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

type ExportFlowStep = 'closed' | 'menu' | 'filename';

type MessageApi = {
  success?: (content: ReactNode | { content: ReactNode; duration?: number }) => void;
  error?: (content: ReactNode | { content: ReactNode; duration?: number }) => void;
};

type UseConversationExportOptions = {
  conversationId?: string;
  workspace?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  messageApi: MessageApi;
};

type UseConversationExportResult = {
  step: ExportFlowStep;
  activeIndex: number;
  filename: string;
  loading: boolean;
  menuItems: SlashCommandMenuItem[];
  isOpen: boolean;
  pathPreview: string;
  openExportFlow: () => Promise<void>;
  closeExportFlow: () => void;
  showMenu: () => void;
  setFilename: (value: string) => void;
  setActiveIndex: (value: number) => void;
  onSelectMenuItem: (key: string) => void;
  handleKeyDown: (event: ReactKeyboardEvent) => boolean;
  submitFilename: () => Promise<void>;
};

export function useConversationExport(options: UseConversationExportOptions): UseConversationExportResult {
  const { conversationId, workspace, t, messageApi } = options;
  const [step, setStep] = useState<ExportFlowStep>('closed');
  const [activeIndex, setActiveIndex] = useState(0);
  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(false);
  const conversationRef = useRef<TChatConversation | null>(null);
  const baseDirectoryRef = useRef('');
  const messagesRef = useRef<TMessage[] | null>(null);
  const transcriptRef = useRef<string | null>(null);
  const transcriptLabels = useMemo<ExportTranscriptLabels>(
    () => ({
      conversation: t('messages.export.conversationLabel'),
      conversationId: t('messages.export.conversationIdLabel'),
      exportedAt: t('messages.export.exportedAtLabel'),
      type: t('messages.export.typeLabel'),
      noMessages: t('messages.export.noMessages'),
      user: t('messages.export.userLabel'),
      assistant: t('messages.export.assistantLabel'),
      system: t('messages.export.systemLabel'),
    }),
    [t]
  );

  const closeExportFlow = useCallback(() => {
    setStep('closed');
    setActiveIndex(0);
    setLoading(false);
  }, []);

  const showMenu = useCallback(() => {
    setStep('menu');
    setActiveIndex(0);
  }, []);

  const loadConversation = useCallback(async (): Promise<TChatConversation | null> => {
    if (!conversationId) {
      return null;
    }
    if (conversationRef.current?.id === conversationId) {
      return conversationRef.current;
    }

    const conversation = await ipcBridge.conversation.get.invoke({ id: conversationId });
    conversationRef.current = conversation;
    transcriptRef.current = null;
    return conversation;
  }, [conversationId]);

  const loadTranscript = useCallback(async (): Promise<string | null> => {
    if (!conversationId) {
      return null;
    }
    if (transcriptRef.current) {
      return transcriptRef.current;
    }

    const conversation = await loadConversation();
    if (!conversation) {
      return null;
    }

    const messages =
      messagesRef.current ??
      (await ipcBridge.database.getConversationMessages.invoke({
        conversation_id: conversationId,
        page: 0,
        pageSize: 10000,
      }));
    messagesRef.current = messages;
    const transcript = buildConversationExportText(conversation, messages, transcriptLabels);
    transcriptRef.current = transcript;
    return transcript;
  }, [conversationId, loadConversation, transcriptLabels]);

  const openExportFlow = useCallback(async () => {
    if (!conversationId) {
      messageApi.error?.(t('messages.export.unavailable'));
      return;
    }

    try {
      conversationRef.current = null;
      messagesRef.current = null;
      transcriptRef.current = null;
      const conversation = await loadConversation();
      if (!conversation) {
        messageApi.error?.(t('messages.export.unavailable'));
        return;
      }

      let desktopPath = '';
      if (!workspace?.trim()) {
        try {
          desktopPath = await ipcBridge.application.getPath.invoke({ name: 'desktop' });
        } catch {
          desktopPath = '';
        }
      }

      baseDirectoryRef.current = resolveExportBaseDirectory(workspace, desktopPath);
      const messages = await ipcBridge.database.getConversationMessages.invoke({
        conversation_id: conversationId,
        page: 0,
        pageSize: 10000,
      });
      messagesRef.current = messages;
      setFilename(buildDefaultExportFileName(conversation.id, getDefaultExportFileNameSource(conversation, messages)));
      setActiveIndex(0);
      setStep('menu');
    } catch (error) {
      console.error('[useConversationExport] Failed to open export flow:', error);
      messageApi.error?.(t('messages.export.prepareFailed'));
    }
  }, [conversationId, loadConversation, messageApi, t, workspace]);

  const handleCopy = useCallback(async () => {
    try {
      setLoading(true);
      const transcript = await loadTranscript();
      if (!transcript) {
        messageApi.error?.(t('messages.export.unavailable'));
        closeExportFlow();
        return;
      }
      await copyText(transcript);
      messageApi.success?.(t('messages.export.copySuccess'));
      closeExportFlow();
    } catch (error) {
      console.error('[useConversationExport] Failed to copy export:', error);
      messageApi.error?.(t('messages.export.copyFailed'));
    } finally {
      setLoading(false);
    }
  }, [closeExportFlow, loadTranscript, messageApi, t]);

  const handleSave = useCallback(async () => {
    try {
      setLoading(true);
      const transcript = await loadTranscript();
      if (!transcript) {
        messageApi.error?.(t('messages.export.unavailable'));
        closeExportFlow();
        return;
      }

      const normalizedFileName = normalizeExportFileName(filename);
      const targetPath = joinFilePath(baseDirectoryRef.current, normalizedFileName);
      const success = await ipcBridge.fs.writeFile.invoke({
        path: targetPath,
        data: transcript,
      });

      if (!success) {
        messageApi.error?.(t('messages.export.saveFailed'));
        return;
      }

      messageApi.success?.({
        content: (
          <div className='flex flex-col gap-8px'>
            <div>{t('messages.export.saveSuccess', { path: targetPath })}</div>
            <div className='flex justify-end'>
              <Button
                size='mini'
                type='text'
                onClick={() => {
                  void copyText(targetPath)
                    .then(() => {
                      messageApi.success?.(t('common.copySuccess'));
                    })
                    .catch(() => {
                      messageApi.error?.(t('common.copyFailed'));
                    });
                }}
              >
                {t('messages.copy')}
              </Button>
            </div>
          </div>
        ),
        duration: 5000,
      });
      closeExportFlow();
    } catch (error) {
      console.error('[useConversationExport] Failed to save export:', error);
      messageApi.error?.(t('messages.export.saveFailed'));
    } finally {
      setLoading(false);
    }
  }, [closeExportFlow, filename, loadTranscript, messageApi, t]);

  const onSelectMenuItem = useCallback(
    (key: string) => {
      if (loading) {
        return;
      }
      if (key === 'copy') {
        void handleCopy();
        return;
      }
      if (key === 'save') {
        setStep('filename');
      }
    },
    [handleCopy, loading]
  );

  const submitFilename = useCallback(async () => {
    if (loading) {
      return;
    }
    if (!baseDirectoryRef.current) {
      messageApi.error?.(t('messages.export.unavailable'));
      return;
    }
    await handleSave();
  }, [handleSave, loading, messageApi, t]);

  const menuItems = useMemo<SlashCommandMenuItem[]>(
    () => [
      {
        key: 'copy',
        label: t('messages.export.copyLabel'),
        description: t('messages.export.copyDescription'),
      },
      {
        key: 'save',
        label: t('messages.export.saveLabel'),
        description: t('messages.export.saveDescription'),
      },
    ],
    [t]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (step === 'closed') {
        return false;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (step === 'filename') {
          showMenu();
        } else {
          closeExportFlow();
        }
        return true;
      }

      if (step === 'menu') {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % menuItems.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActiveIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
          return true;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          const activeMenuItem = menuItems[activeIndex] ?? menuItems[0];
          if (activeMenuItem) {
            onSelectMenuItem(activeMenuItem.key);
          }
          return true;
        }
        return false;
      }

      if (step === 'filename' && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void submitFilename();
        return true;
      }

      return false;
    },
    [activeIndex, closeExportFlow, menuItems, onSelectMenuItem, showMenu, step, submitFilename]
  );

  return {
    step,
    activeIndex,
    filename,
    loading,
    menuItems,
    isOpen: step !== 'closed',
    pathPreview: baseDirectoryRef.current
      ? joinFilePath(baseDirectoryRef.current, normalizeExportFileName(filename))
      : normalizeExportFileName(filename),
    openExportFlow,
    closeExportFlow,
    showMenu,
    setFilename,
    setActiveIndex,
    onSelectMenuItem,
    handleKeyDown,
    submitFilename,
  };
}
