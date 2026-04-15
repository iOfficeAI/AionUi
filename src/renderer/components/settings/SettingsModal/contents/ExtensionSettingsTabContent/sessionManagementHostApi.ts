import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { IManagedConversationSearchParams } from '@/common/types/database';

export type SessionManagementHostContext = {
  activeWorkspace: string | null;
  closeAllTabs: () => void;
  openTab: (conversation: TChatConversation) => void;
  navigateToConversation: (conversationId: string) => Promise<void>;
};

type SessionManagementPayload =
  | IManagedConversationSearchParams
  | {
      ids?: string[];
      conversation?: TChatConversation;
    };

const getConversationIds = (payload: SessionManagementPayload | null | undefined): string[] => {
  const ids = payload && 'ids' in payload ? payload.ids : undefined;
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids.filter((id) => typeof id === 'string' && id.trim().length > 0);
};

const getConversation = (payload: SessionManagementPayload | null | undefined): TChatConversation | null => {
  if (!payload || !('conversation' in payload)) {
    return null;
  }

  return payload.conversation ?? null;
};

export function getSessionManagementHostApiHandlers(
  payload: SessionManagementPayload | null | undefined,
  context: SessionManagementHostContext
): Record<string, () => Promise<unknown>> {
  return {
    'conversation.searchManaged': async () =>
      ipcBridge.database.searchManagedConversations.invoke((payload ?? {}) as IManagedConversationSearchParams),
    'conversation.removeMany': async () => {
      const ids = getConversationIds(payload);
      const results = await Promise.all(ids.map((id) => ipcBridge.conversation.remove.invoke({ id })));

      return {
        ids,
        successCount: results.filter(Boolean).length,
      };
    },
    'conversation.open': async () => {
      const conversation = getConversation(payload);
      if (!conversation) {
        throw new Error('Missing conversation');
      }

      const customWorkspace = conversation.extra?.customWorkspace;
      const nextWorkspace = conversation.extra?.workspace ?? null;

      if (!customWorkspace) {
        context.closeAllTabs();
      } else {
        if (!context.activeWorkspace || context.activeWorkspace !== nextWorkspace) {
          context.closeAllTabs();
        }
        context.openTab(conversation);
      }

      await context.navigateToConversation(conversation.id);
      return { success: true };
    },
  };
}
