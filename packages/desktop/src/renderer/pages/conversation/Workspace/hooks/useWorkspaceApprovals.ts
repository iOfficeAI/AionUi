/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConfirmation } from '@/common/chat/chatLib';
import { dispatchWorkspaceHasApprovalsEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A pending approval normalized for the workspace Approvals tab.
 *
 * IMPORTANT (verified against the backend): remote/OpenCode permission prompts
 * — including the local-fs `run_shell` approvals — are emitted as
 * `AgentStreamEvent::AcpPermission(Confirmation)`. Because that enum is
 * `#[serde(untagged)]`, the wire payload is a bare `Confirmation`/IConfirmation
 * object: `{ call_id, description, options: [{ label, value, params? }], ... }`
 * — NOT the ACP `{ tool_call, options:[{option_id}] }` shape. The wire `type`
 * is still `"acp_permission"` (the enum variant name), which the chat reducer
 * rewrites to `"permission"` for inline display.
 *
 * So the tab listens for BOTH `acp_permission` and `permission` stream events,
 * treats `data` as `IConfirmation`, and answers via `confirmation.confirm`
 * (call_id + `{ value }`) — the same path the old inline card used.
 *
 * MCP elicitation (`command_type === 'mcp_elicitation'`) is excluded; it needs
 * a schema form and stays inline.
 */
export type WorkspaceApproval = IConfirmation<unknown>;

type ResponseStreamMessage = {
  type: string;
  conversation_id: string;
  msg_id?: string;
  id?: string;
  data?: unknown;
};

type UseWorkspaceApprovalsReturn = {
  approvals: WorkspaceApproval[];
  hasApprovals: boolean;
  /** Answer a pending approval; removes it from the list on success. */
  respond: (approval: WorkspaceApproval, value: string, params?: Record<string, string>) => Promise<void>;
};

function isTabEligible(c: WorkspaceApproval | undefined): c is WorkspaceApproval {
  return Boolean(c && c.call_id && c.command_type !== 'mcp_elicitation');
}

export function useWorkspaceApprovals(conversation_id: string | undefined): UseWorkspaceApprovalsReturn {
  const [approvals, setApprovals] = useState<WorkspaceApproval[]>([]);
  const prevHasRef = useRef(false);

  // Seed + reconcile from the backend-authoritative confirmation list, and
  // reset whenever the conversation changes.
  useEffect(() => {
    if (!conversation_id) {
      setApprovals([]);
      return;
    }
    let cancelled = false;
    void ipcBridge.conversation.confirmation.list
      .invoke({ conversation_id })
      .then((list) => {
        if (cancelled) return;
        setApprovals((list ?? []).filter(isTabEligible));
      })
      .catch((error) => {
        console.error('[useWorkspaceApprovals] Failed to list confirmations:', error);
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
        if (!isTabEligible(conf)) return;
        setApprovals((prev) => {
          const idx = prev.findIndex((a) => a.call_id === conf.call_id);
          if (idx === -1) return [...prev, conf];
          const copy = prev.slice();
          copy[idx] = conf;
          return copy;
        });
        return;
      }

      // Turn boundary: the backend auto-rejects pending approvals on turn end.
      if (message.type === 'finish' || message.type === 'error') {
        setApprovals([]);
      }
    });
  }, [conversation_id]);

  // Server-side removal (answered elsewhere / auto-resolved).
  useEffect(() => {
    return ipcBridge.conversation.confirmation.remove.on((payload) => {
      if (conversation_id && payload.conversation_id !== conversation_id) return;
      setApprovals((prev) => prev.filter((a) => a.id !== payload.id && a.call_id !== payload.id));
    });
  }, [conversation_id]);

  const respond = useCallback(
    async (approval: WorkspaceApproval, value: string, params?: Record<string, string>) => {
      const data: Record<string, unknown> = { value };
      if (params) data.params = params;
      const convId = (approval as { conversation_id?: string }).conversation_id ?? conversation_id ?? '';
      await ipcBridge.conversation.confirmation.confirm.invoke({
        conversation_id: convId,
        call_id: approval.call_id,
        msg_id: approval.id || '',
        data,
        always_allow: value === 'proceed_always',
      });
      setApprovals((prev) => prev.filter((a) => a.call_id !== approval.call_id));
    },
    [conversation_id]
  );

  const hasApprovals = approvals.length > 0;

  useEffect(() => {
    if (hasApprovals !== prevHasRef.current) {
      prevHasRef.current = hasApprovals;
      dispatchWorkspaceHasApprovalsEvent(hasApprovals, conversation_id);
    }
  }, [hasApprovals, conversation_id]);

  return { approvals, hasApprovals, respond };
}
