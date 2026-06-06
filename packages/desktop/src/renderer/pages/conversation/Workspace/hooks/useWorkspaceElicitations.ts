/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceApproval } from './useWorkspaceApprovals';

/**
 * A pending MCP elicitation normalized for the workspace Questions tab.
 *
 * Mirrors useWorkspaceApprovals.ts exactly in structure: same IPC
 * subscriptions (ipcBridge.conversation.responseStream.on,
 * ipcBridge.conversation.confirmation.list.invoke,
 * ipcBridge.conversation.confirmation.remove.on) and the same respond()
 * signature — but the filter is inverted. This hook KEEPS only
 * `command_type === 'mcp_elicitation'` items; the approvals hook drops
 * them. Same wire payload, same answer path.
 */

type ResponseStreamMessage = {
  type: string;
  conversation_id: string;
  msg_id?: string;
  id?: string;
  data?: unknown;
};

type UseWorkspaceElicitationsReturn = {
  elicitations: WorkspaceApproval[];
  hasElicitations: boolean;
  /** Answer a pending elicitation; removes it from the list on success. */
  respond: (elicitation: WorkspaceApproval, value: string, params?: Record<string, string>) => Promise<void>;
};

function isElicitation(c: WorkspaceApproval | undefined): c is WorkspaceApproval {
  return Boolean(c && c.call_id && c.command_type === 'mcp_elicitation');
}

export function useWorkspaceElicitations(conversation_id: string | undefined): UseWorkspaceElicitationsReturn {
  const [elicitations, setElicitations] = useState<WorkspaceApproval[]>([]);
  const prevHasRef = useRef(false);

  // Seed + reconcile from the backend-authoritative confirmation list, and
  // reset whenever the conversation changes.
  useEffect(() => {
    if (!conversation_id) {
      setElicitations([]);
      return;
    }
    let cancelled = false;
    void ipcBridge.conversation.confirmation.list
      .invoke({ conversation_id })
      .then((list) => {
        if (cancelled) return;
        setElicitations((list ?? []).filter(isElicitation));
      })
      .catch((error) => {
        console.error('[useWorkspaceElicitations] Failed to list confirmations:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  // New permission requests arrive on the response stream. Remote emits them
  // under `acp_permission`; some paths use `permission`. Both carry an
  // IConfirmation-shaped payload here.
  useEffect(() => {
    return ipcBridge.conversation.responseStream.on((raw) => {
      const message = raw as ResponseStreamMessage;
      if (conversation_id && message.conversation_id !== conversation_id) return;

      if (message.type === 'acp_permission' || message.type === 'permission') {
        const conf = message.data as WorkspaceApproval | undefined;
        if (!isElicitation(conf)) return;
        setElicitations((prev) => {
          const idx = prev.findIndex((a) => a.call_id === conf.call_id);
          if (idx === -1) return [...prev, conf];
          const copy = prev.slice();
          copy[idx] = conf;
          return copy;
        });
        return;
      }

      // Turn boundary: the backend auto-rejects pending items on turn end.
      if (message.type === 'finish' || message.type === 'error') {
        setElicitations([]);
      }
    });
  }, [conversation_id]);

  // Server-side removal (answered elsewhere / auto-resolved).
  useEffect(() => {
    return ipcBridge.conversation.confirmation.remove.on((payload) => {
      if (conversation_id && payload.conversation_id !== conversation_id) return;
      setElicitations((prev) => prev.filter((a) => a.id !== payload.id && a.call_id !== payload.id));
    });
  }, [conversation_id]);

  const respond = useCallback(
    async (elicitation: WorkspaceApproval, value: string, params?: Record<string, string>) => {
      const data: Record<string, unknown> = { value };
      if (params) data.params = params;
      const convId = (elicitation as { conversation_id?: string }).conversation_id ?? conversation_id ?? '';
      await ipcBridge.conversation.confirmation.confirm.invoke({
        conversation_id: convId,
        call_id: elicitation.call_id,
        msg_id: elicitation.id || '',
        data,
        always_allow: value === 'proceed_always',
      });
      setElicitations((prev) => prev.filter((a) => a.call_id !== elicitation.call_id));
    },
    [conversation_id]
  );

  const hasElicitations = elicitations.length > 0;

  // Note: elicitations intentionally do NOT dispatch the
  // workspace-has-approvals event — that signal is approvals-only and the
  // bottom panel reads `hasElicitations` directly.
  useEffect(() => {
    prevHasRef.current = hasElicitations;
  }, [hasElicitations]);

  return { elicitations, hasElicitations, respond };
}
