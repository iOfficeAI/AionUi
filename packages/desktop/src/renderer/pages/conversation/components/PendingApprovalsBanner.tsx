/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import { useMessageList, useUpdateMessageList } from '@/renderer/pages/conversation/Messages/hooks';
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

type PermissionOption = {
  label?: string;
  value?: unknown;
  params?: Record<string, string>;
};

type PermissionContent = {
  call_id?: string;
  callId?: string;
  description?: string;
  command_type?: string;
  title?: string;
  responded?: boolean;
  options?: PermissionOption[];
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
    content?.command_type || content?.tool_call?.rawInput?.command || content?.description || content?.title || '';
  const flat = raw.split('\n')[0].trim();
  return flat.length > MAX_PREVIEW_CHARS ? `${flat.slice(0, MAX_PREVIEW_CHARS - 1)}…` : flat;
}

// Pull the directory-tree path that aioncore stamped onto the "Allow this
// directory tree" option's `params.path`. When present, blessing this path
// auto-resolves not just THIS request but every subsequent one whose target
// path is a descendant — see backend `auto_accept_paths`. Banner uses this
// to offer a single "Approve all + trust tree" action instead of N
// individual `once` POSTs that fix nothing for future prompts.
function allowDirPathOf(content: PermissionContent | undefined): string | undefined {
  if (!content?.options) return undefined;
  for (const opt of content.options) {
    if (opt?.value !== 'allow_dir') continue;
    const p = opt?.params?.path;
    if (typeof p === 'string' && p.startsWith('/') && p.length > 1) return p;
  }
  return undefined;
}

// Longest common path-ancestor of a non-empty list of absolute POSIX paths.
// `/a/b/c` and `/a/b/d` → `/a/b`. `/a` and `/x` → `/`. Trailing slashes are
// normalised; the result never has a trailing slash unless it IS the root.
// Returns `undefined` when the list is empty or any path is non-absolute.
function commonPathAncestor(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  const segLists = paths.map((p) => p.replace(/\/+$/, '').split('/').filter(Boolean));
  if (paths.some((p) => !p.startsWith('/'))) return undefined;
  if (segLists.some((segs) => segs.length === 0)) return '/';
  const minLen = Math.min(...segLists.map((s) => s.length));
  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const candidate = segLists[0][i];
    if (segLists.every((s) => s[i] === candidate)) {
      common.push(candidate);
    } else {
      break;
    }
  }
  return common.length === 0 ? '/' : `/${common.join('/')}`;
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
  const updateMessageList = useUpdateMessageList();
  const [approved, setApproved] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const pending = useMemo(() => {
    const out: Array<{ call_id: string; msg_id?: string; preview: string; allowDirPath?: string }> = [];
    for (const msg of list) {
      const content = readPermissionContent(msg);
      if (!content) continue;
      // Skip cards the user (or this banner) has already resolved.
      if (content.responded) continue;
      const call_id = callIdOf(content);
      if (!call_id) continue;
      if (approved.has(call_id)) continue;
      out.push({
        call_id,
        msg_id: msg.msg_id,
        preview: previewOf(content),
        allowDirPath: allowDirPathOf(content),
      });
    }
    return out;
  }, [list, approved]);

  // If every pending card carries an allow_dir option, compute the deepest
  // common directory ancestor. Blessing it through a single allow_dir POST
  // on the first card resolves the entire batch via aioncore's `drain_now`
  // loop AND silently auto-resolves every future request under the same
  // tree — turning a 14-prompt cascade into one click.
  //
  // Only offer this when the ancestor has ≥ 2 path segments (e.g.
  // `/Users/matt` is fine; bare `/` is too broad and gets hidden so users
  // don't accidentally bless the entire filesystem).
  const blessableAncestor = useMemo<string | undefined>(() => {
    if (pending.length === 0) return undefined;
    const paths = pending.map((p) => p.allowDirPath).filter((p): p is string => Boolean(p));
    if (paths.length !== pending.length) return undefined;
    const ancestor = commonPathAncestor(paths);
    if (!ancestor) return undefined;
    if (ancestor === '/') return undefined;
    const segments = ancestor.split('/').filter(Boolean);
    if (segments.length < 2) return undefined;
    return ancestor;
  }, [pending]);

  /**
   * Bless `path` as auto-accept for the rest of the conversation, then
   * approve every currently-pending card.
   *
   * Implementation: send ONE confirm POST with `value=allow_dir` +
   * `params.path=<ancestor>` to the first card. The backend
   * (`agent.rs::confirm`) then:
   *   1. Adds the path to `auto_accept_paths` for this conversation.
   *   2. Walks `state.confirmations` and drains every other pending
   *      confirmation whose target matches the prefix — POSTs each as
   *      `once` to OpenCode without a UI round-trip.
   *   3. Future `permission.asked` events whose target falls under the
   *      blessed prefix never queue a card at all (auto-respond
   *      short-circuit in the SSE handler).
   *
   * So one click here replaces N pending POSTs AND prevents the next M
   * prompts that would otherwise fire in the same tree.
   */
  const handleTrustTree = useCallback(async () => {
    if (busy || pending.length === 0 || !blessableAncestor) return;
    setBusy(true);
    const batch = pending.slice();
    // Optimistic UI: hide all from the banner immediately.
    setApproved((prev) => {
      const next = new Set(prev);
      for (const item of batch) next.add(item.call_id);
      return next;
    });
    const successful = new Set<string>(batch.map((b) => b.call_id));
    try {
      const lead = batch[0];
      await ipcBridge.conversation.confirmation.confirm.invoke({
        conversation_id,
        call_id: lead.call_id,
        msg_id: lead.msg_id || '',
        data: { value: 'allow_dir', params: { path: blessableAncestor } },
        always_allow: false,
      });
      // Mark every batched card as responded — backend `drain_now` handles
      // the others server-side, but the UI list needs to know they're
      // done so the inline cards flip to the success state.
      updateMessageList((messages) =>
        messages.map((message) => {
          const content = readPermissionContent(message);
          const call_id = callIdOf(content);
          if (!call_id || !successful.has(call_id)) return message;
          return {
            ...message,
            content: { ...(message.content as object), responded: true, response: 'allow_dir' },
          } as unknown as TMessage;
        })
      );
    } catch (error) {
      console.warn('[PendingApprovalsBanner] trust-tree failed', error);
      // Roll back optimistic hide so the user can retry per-card.
      setApproved((prev) => {
        const next = new Set(prev);
        for (const item of batch) next.delete(item.call_id);
        return next;
      });
    } finally {
      setBusy(false);
    }
  }, [busy, pending, blessableAncestor, conversation_id, updateMessageList]);

  const handleApproveAll = useCallback(async () => {
    // `busy` already guards re-entry but we re-check here so a fast
    // double-click between render passes can't slip past. The backend now
    // dedupes via `recently_replied_permissions`, but it's cleaner to never
    // send the duplicate at all.
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
    const successful = new Set<string>();
    const failed = new Set<string>();
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
          successful.add(item.call_id);
        } catch (error) {
          failed.add(item.call_id);
          console.warn('[PendingApprovalsBanner] approve failed', item.call_id, error);
        }
      }
      if (successful.size > 0) {
        updateMessageList((messages) =>
          messages.map((message) => {
            const content = readPermissionContent(message);
            const call_id = callIdOf(content);
            if (!call_id || !successful.has(call_id)) return message;
            return {
              ...message,
              content: { ...(message.content as object), responded: true, response: 'once' },
            } as unknown as TMessage;
          })
        );
      }
      if (failed.size > 0) {
        setApproved((prev) => {
          const next = new Set(prev);
          for (const call_id of failed) next.delete(call_id);
          return next;
        });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, pending, conversation_id, updateMessageList]);

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
      <div className='flex flex-col items-end gap-1.5 shrink-0'>
        {blessableAncestor && (
          <Button
            type='primary'
            size='small'
            loading={busy}
            disabled={busy}
            onClick={handleTrustTree}
            icon={<CheckOne theme='outline' size='14' />}
            data-testid='pending-approvals-trust-tree'
            title={t('messages.trustTreeHint', { path: blessableAncestor })}
          >
            {t('messages.trustTreeShort', { path: shortenPath(blessableAncestor) })}
          </Button>
        )}
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
    </div>
  );
};

// Trim a long absolute path to its trailing two segments for display
// (`/Users/matt/chisl-full/AionUi/packages` → `…/AionUi/packages`).
function shortenPath(p: string): string {
  const segs = p.split('/').filter(Boolean);
  if (segs.length <= 2) return p;
  return `…/${segs.slice(-2).join('/')}`;
}

export default PendingApprovalsBanner;
