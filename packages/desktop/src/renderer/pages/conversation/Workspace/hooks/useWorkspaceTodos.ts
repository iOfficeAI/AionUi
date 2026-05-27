import { ipcBridge } from '@/common';
import type { PlanUpdate } from '@/common/types/platform/acpTypes';
import { dispatchWorkspaceHasTodosEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { useCallback, useEffect, useRef, useState } from 'react';

type TodoEntry = PlanUpdate['update']['entries'][number];

type UseWorkspaceTodosReturn = {
  entries: TodoEntry[];
  hasTodos: boolean;
  completedCount: number;
  totalCount: number;
};

export function useWorkspaceTodos(conversation_id: string | undefined): UseWorkspaceTodosReturn {
  const [entries, setEntries] = useState<TodoEntry[]>([]);
  const prevHasTodosRef = useRef(false);

  const hydrateFromDb = useCallback(async (convId: string) => {
    try {
      const result = await ipcBridge.database.getConversationMessages.invoke({
        conversation_id: convId,
        page: 0,
        page_size: 10000,
      });
      const messages = result?.items ?? [];
      const planMessages = messages.filter((m) => m.type === 'plan');
      if (planMessages.length === 0) {
        setEntries([]);
        return;
      }
      const latest = planMessages[planMessages.length - 1];
      const content = latest.content as { entries?: TodoEntry[] } | undefined;
      if (content?.entries) {
        setEntries(content.entries);
      }
    } catch (error) {
      console.error('[useWorkspaceTodos] Failed to hydrate from DB:', error);
    }
  }, []);

  useEffect(() => {
    if (!conversation_id) {
      setEntries([]);
      return;
    }
    void hydrateFromDb(conversation_id);
  }, [conversation_id, hydrateFromDb]);

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on((message) => {
      if (message.type !== 'plan') return;
      if (conversation_id && message.conversation_id !== conversation_id) return;

      const data = message.data as { entries?: TodoEntry[] } | undefined;
      if (data?.entries) {
        setEntries(data.entries);
      }
    });
  }, [conversation_id]);

  const hasTodos = entries.length > 0;
  const completedCount = entries.filter((e) => e.status === 'completed').length;
  const totalCount = entries.length;

  useEffect(() => {
    if (hasTodos !== prevHasTodosRef.current) {
      prevHasTodosRef.current = hasTodos;
      dispatchWorkspaceHasTodosEvent(hasTodos, conversation_id);
    }
  }, [hasTodos, conversation_id]);

  return { entries, hasTodos, completedCount, totalCount };
}
