import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { TProviderWithModel } from '@/common/config/storage';
import { deriveAutoTitleFromMessages, generateTitleWithAI } from '@/renderer/utils/chat/autoTitle';
import { emitter } from '@/renderer/utils/emitter';

export const useAutoTitle = () => {
  const { t, i18n } = useTranslation();

  const syncTitleFromHistory = useCallback(
    async (conversation_id: string, fallbackContent?: string, provider?: TProviderWithModel) => {
      const defaultTitle = t('conversation.welcome.newConversation');
      try {
        const conversation = await ipcBridge.conversation.get.invoke({ id: conversation_id });
        if (!conversation || conversation.name !== defaultTitle) {
          return;
        }

        // Try AI title generation first if provider is available
        if (provider) {
          const firstMessage = fallbackContent || '';
          const locale = i18n.language || 'en';
          const aiTitle = await generateTitleWithAI(firstMessage, provider, locale);
          if (aiTitle) {
            const success = await ipcBridge.conversation.update.invoke({
              id: conversation_id,
              updates: { name: aiTitle },
            });
            if (success) {
              emitter.emit('chat.history.refresh');
              return;
            }
          }
        }

        // Fallback to rule-based title from message history
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

        emitter.emit('chat.history.refresh');
      } catch (error) {
        console.error('Failed to auto-update conversation title:', error);
      }
    },
    [t, i18n],
  );

  const checkAndUpdateTitle = useCallback(
    async (conversation_id: string, messageContent: string, provider?: TProviderWithModel) => {
      await syncTitleFromHistory(conversation_id, messageContent, provider);
    },
    [syncTitleFromHistory],
  );

  return {
    checkAndUpdateTitle,
    syncTitleFromHistory,
  };
};
