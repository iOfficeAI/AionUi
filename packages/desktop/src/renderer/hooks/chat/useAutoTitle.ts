import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { deriveAutoTitleFromMessages } from '@/renderer/utils/chat/autoTitle';
import { DEFAULT_MESSAGE_PAGE_LIMIT, loadLatestConversationMessages } from '@/renderer/utils/chat/messagePagination';
import { emitter } from '@/renderer/utils/emitter';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';

export const useAutoTitle = () => {
  const { t } = useTranslation();

  const syncTitleFromHistory = useCallback(
    async (conversation_id: string, fallbackContent?: string) => {
      const defaultTitle = t('conversation.welcome.newConversation');
      try {
        const conversation = await getConversationOrNull(conversation_id);
        if (!conversation || conversation.name !== defaultTitle) {
          return;
        }

        const messages = await loadLatestConversationMessages(conversation_id, {
          limit: DEFAULT_MESSAGE_PAGE_LIMIT,
          contentMode: 'compact',
        });
        const newTitle = deriveAutoTitleFromMessages(messages.items, fallbackContent);
        if (!newTitle) {
          return;
        }

        const success = await ipcBridge.conversation.update.invoke({
          id: conversation_id,
          updates: { name: newTitle },
        });
        if (!success) {
          return;
        }

        emitter.emit('chat.history.refresh');
      } catch (error) {
        console.error('Failed to auto-update conversation title:', error);
      }
    },
    [t]
  );

  const checkAndUpdateTitle = useCallback(
    async (conversation_id: string, messageContent: string) => {
      await syncTitleFromHistory(conversation_id, messageContent);
    },
    [syncTitleFromHistory]
  );

  return {
    checkAndUpdateTitle,
    syncTitleFromHistory,
  };
};
