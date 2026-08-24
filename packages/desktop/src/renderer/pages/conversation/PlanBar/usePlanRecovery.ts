/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { normalizeDbMessage, useUpdateMessageList } from '@renderer/pages/conversation/Messages/hooks';
import { useConversationRuntimeView } from '@renderer/pages/conversation/runtime/useConversationRuntimeView';
import { useEffect, useRef } from 'react';

/**
 * Restore the running turn's plan when a conversation is reopened mid-turn.
 *
 * The paginated message load is not enough: `upsert_message` does not refresh
 * `created_at`, so a plan row stays anchored at the START of its turn and a turn
 * with many tool calls buries it outside the default page.
 *
 * Gated on `hydrated`, NOT on the first `isProcessing` snapshot — the runtime
 * view resolves that flag asynchronously, so firing early reads a false `false`
 * and the bar silently stays empty in exactly the case this hook exists for.
 */
export const usePlanRecovery = (conversation_id: string): void => {
  const update = useUpdateMessageList();
  const { hydrated, isProcessing } = useConversationRuntimeView(conversation_id);
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversation_id || !hydrated || !isProcessing) return;
    if (requestedRef.current === conversation_id) return;
    requestedRef.current = conversation_id;

    let cancelled = false;
    void ipcBridge.database.getLatestConversationMessageOfType
      .invoke({ conversation_id, type: 'plan' })
      .then((message) => {
        if (cancelled || !message) return;
        const normalized = normalizeDbMessage(message);
        update((list) => (list.some((item) => item.id === normalized.id) ? list : list.concat(normalized)));
      })
      .catch(() => {
        // Best-effort: the bar still fills in from the next live plan frame, and
        // clearing the latch lets a later mount retry.
        requestedRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [conversation_id, hydrated, isProcessing, update]);
};
