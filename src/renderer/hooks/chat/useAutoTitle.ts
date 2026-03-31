import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { useConversationTabs } from '@/renderer/pages/conversation/hooks/ConversationTabsContext';
import { deriveAutoTitleFromMessages } from '@/renderer/utils/chat/autoTitle';
import { emitter } from '@/renderer/utils/emitter';

export const useAutoTitle = () => {
  const { t } = useTranslation();
  const { updateTabName } = useConversationTabs();

  const syncTitleFromHistory = useCallback(
    async (conversationId: string, fallbackContent?: string) => {
      const defaultTitle = t('conversation.welcome.newConversation');
      try {
        const conversation = await ipcBridge.conversation.get.invoke({ id: conversationId });
        if (!conversation || conversation.name !== defaultTitle) {
          return;
        }

        const messages = await ipcBridge.database.getConversationMessages.invoke({
          conversation_id: conversationId,
          page: 0,
          pageSize: 1000,
        });
        const newTitle = deriveAutoTitleFromMessages(messages, fallbackContent);
        if (!newTitle) {
          return;
        }

        const success = await ipcBridge.conversation.update.invoke({
          id: conversationId,
          updates: { name: newTitle },
        });
        if (!success) {
          return;
        }

        updateTabName(conversationId, newTitle);
        emitter.emit('chat.history.refresh');
      } catch (error) {
        console.error('Failed to auto-update conversation title:', error);
      }
    },
    [t, updateTabName]
  );

  const checkAndUpdateTitle = useCallback(
    async (conversationId: string, messageContent: string) => {
      await syncTitleFromHistory(conversationId, messageContent);
    },
    [syncTitleFromHistory]
  );

  return {
    checkAndUpdateTitle,
    syncTitleFromHistory,
  };
};
