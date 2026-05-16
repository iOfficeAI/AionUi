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
    async (conversation_id: string, fallbackContent?: string) => {
      const defaultTitle = t('conversation.welcome.newConversation');
      try {
        const conversation = await ipcBridge.conversation.get.invoke({ id: conversation_id });
        if (!conversation || conversation.name !== defaultTitle) {
          return;
        }

        const messagesResult = await ipcBridge.database.getConversationMessages.invoke({
          conversation_id: conversation_id,
          page: 0,
          page_size: 1000,
        });
        const newTitle = deriveAutoTitleFromMessages(messagesResult.items, fallbackContent);
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

        updateTabName(conversation_id, newTitle);
        emitter.emit('chat.history.refresh');
      } catch (error) {
        console.error('Failed to auto-update conversation title:', error);
      }
    },
    [t, updateTabName]
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
