/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import { useMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { Button, Tag } from '@arco-design/web-react';
import { CheckOne } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Maximum number of command previews to render inline. Beyond this we
// show a "+N more" summary chip — keeps the banner one-line tall so it
// doesn't shove the chat scrollback when the model fires off a long
// burst of parallel tool calls.
const MAX_PREVIEW_ITEMS = 3;
const MAX_PREVIEW_CHARS = 70;

type PermissionContent = {
  call_id?: string;
  callId?: string;
  description?: string;
  command_type?: string;
  title?: string;
  responded?: boolean;
  tool_call?: { tool_call_id?: string; rawInput?: { command?: string } };
};

function readPermissionContent(msg: TMessage): PermissionContent | undefined {
  if (msg.type !== 'permission' && msg.type !== 'acp_permission') return undefined;
  return msg.content as PermissionContent | undefined;
}

function callIdOf(content: PermissionContent | undefined): string | undefined {
  return content?.call_id || content?.callId || content?.tool_call?.tool_call_id;
}

// Heuristic command-preview extractor. Per-card shells stamp the command
// into `command_type` (see `RemoteShellApprover` in agent.rs); ACP tools
// carry it under `tool_call.rawInput.command`. Fall back to title /
// description so the banner always has *something* readable rather than
// a bare call_id.
function previewOf(content: PermissionContent | undefined): string {
  const raw =
    content?.command_type ||
    content?.tool_call?.rawInput?.command ||
    content?.description ||
    content?.title ||
    '';
  const flat = raw.split('\n')[0].trim();
  return flat.length > MAX_PREVIEW_CHARS ? `${flat.slice(0, MAX_PREVIEW_CHARS - 1)}…` : flat;
}

/**
 * Banner that surfaces a single bulk-approve action when the agent has
 * fired multiple parallel permission requests in one turn. Renders only
 * when there are ≥2 *un-responded* permission cards in the active
 * conversation — already-answered cards are filtered out via
 * `content.responded`, which `MessagePermission.handleConfirm` stamps
 * onto the message after the user approves a single card.
 *
 * The banner is informational by default: it surfaces the actual command
 * text inline so the user knows *what* they would be approving, and the
 * primary "Approve all" button is a secondary affordance — the user can
 * still ignore the banner and approve each card individually.
 *
 * Failure mode: backend reject of a single call_id is logged and counted
 * but does not abort the loop — the remaining permissions still get
 * approved so a single transient error can't block the rest.
 */
const PendingApprovalsBanner: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const list = useMessageList();
  const [approved, setApproved] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const pending = useMemo(() => {
    const out: Array<{ call_id: string; msg_id?: string; preview: string }> = [];
    for (const msg of list) {
      const content = readPermissionContent(msg);
      if (!content) continue;
      // Skip cards the user (or this banner) has already resolved.
      if (content.responded) continue;
      const call_id = callIdOf(content);
      if (!call_id) continue;
      if (approved.has(call_id)) continue;
      out.push({ call_id, msg_id: msg.msg_id, preview: previewOf(content) });
    }
    return out;
  }, [list, approved]);

  const handleApproveAll = useCallback(async () => {
    if (busy || pending.length === 0) return;
    setBusy(true);
    const batch = pending.slice();
    // Optimistically hide the cards from the banner so the user doesn't
    // get a stuttery double-count while the backend round-trips happen.
    setApproved((prev) => {
      const next = new Set(prev);
      for (const item of batch) next.add(item.call_id);
      return next;
    });
    try {
      // Sequential — confirming in parallel is a noisier ask of the
      // OpenCode server (one POST /permission/.../reply each) and the
      // number of permissions in flight is always small (single-digit
      // tool calls per turn). The serial loop also makes error logs
      // easier to correlate to a specific call_id.
      for (const item of batch) {
        try {
          await ipcBridge.conversation.confirmation.confirm.invoke({
            conversation_id,
            call_id: item.call_id,
            msg_id: item.msg_id || '',
            data: { value: 'once' },
            always_allow: false,
          });
        } catch (error) {
          console.warn('[PendingApprovalsBanner] approve failed', item.call_id, error);
        }
      }
    } finally {
      setBusy(false);
    }
  }, [busy, pending, conversation_id]);

  if (pending.length < 2) return null;

  const visiblePreviews = pending.slice(0, MAX_PREVIEW_ITEMS);
  const overflowCount = pending.length - visiblePreviews.length;

  return (
    <div
      className='mx-auto mb-2 flex w-full items-start gap-3 rounded-md border px-3 py-2'
      style={{
        background: 'var(--bg-1)',
        borderColor: 'var(--border-1)',
      }}
      data-testid='pending-approvals-banner'
      role='status'
      aria-live='polite'
    >
      <div className='flex flex-col gap-1 min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <Tag color='orange' bordered size='small'>
            {pending.length}
          </Tag>
          <span className='text-sm text-t-primary'>
            {t('messages.pendingApprovalsHeader', { count: pending.length })}
          </span>
        </div>
        <ul className='flex flex-col gap-0.5 pl-2 m-0 list-none'>
          {visiblePreviews.map((item) => (
            <li key={item.call_id} className='text-xs text-t-secondary truncate'>
              <code className='font-mono'>{item.preview || item.call_id}</code>
            </li>
          ))}
          {overflowCount > 0 && (
            <li className='text-xs text-t-secondary italic'>
              {t('messages.pendingApprovalsMoreShort', { count: overflowCount })}
            </li>
          )}
        </ul>
        <span className='text-xs text-t-tertiary'>{t('messages.pendingApprovalsHint')}</span>
      </div>
      <Button
        type='secondary'
        size='small'
        loading={busy}
        disabled={busy}
        onClick={handleApproveAll}
        icon={<CheckOne theme='outline' size='14' />}
        data-testid='pending-approvals-approve-all'
      >
        {busy ? t('messages.approveAllInProgress') : t('messages.approveAllPending', { count: pending.length })}
      </Button>
    </div>
  );
};

export default PendingApprovalsBanner;
