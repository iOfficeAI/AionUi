/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessagePermission, TMessage } from '@/common/chat/chatLib';
import { ipcBridge } from '@/common';
import { useUpdateMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { ApprovalCardBase, fromChislOptions } from '@renderer/components/approval';
import { Checkbox } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MessageMcpElicitation from './MessageMcpElicitation';

interface MessagePermissionProps {
  message: IMessagePermission;
}

/** P1.2a (D6): hard-coded high-risk opt-out for the inheritance row.
 * Mirrors `HIGH_RISK_INHERITANCE_KINDS` in `agent.rs` — toggle defaults OFF
 * for these kinds so a session grant on a low-risk prompt never auto-runs
 * a high-risk sibling in a sub-agent. PM-mandated list per master prompt.
 */
const HIGH_RISK_KINDS: ReadonlySet<string> = new Set([
  'shell',
  'write_outside_workspace',
  'exec_binary',
  'network_write',
]);

const MessagePermission: React.FC<MessagePermissionProps> = React.memo(({ message }) => {
  const { t } = useTranslation();
  const updateMessageList = useUpdateMessageList();
  const content = message.content || ({} as IMessagePermission['content']);

  // MCP elicitation confirmations carry `command_type === 'mcp_elicitation'`
  // and need a schema-driven form rather than a yes/no/once radio choice.
  // Route them to the dedicated renderer; the rest of the body is unchanged.
  if (content.command_type === 'mcp_elicitation') {
    return <MessageMcpElicitation message={message} />;
  }

  const { options = [], description, title, action, call_id, command_type, parent_session_id, session_id } = content;
  const shellCommandLine =
    command_type === 'run_shell' && description
      ? (description
          .split('\n')
          .find((line) => line.trimStart().startsWith('$ '))
          ?.trimStart()
          .slice(2) ?? null)
      : null;
  const normalized = fromChislOptions(options);

  // CRITICAL banner-sync fix (do not regress): `hasResponded` MUST stay in
  // sync with `message.content.responded` because the PendingApprovalsBanner
  // ("Approve all") calls `updateMessageList` to flip `content.responded =
  // true` on every card it resolves. The OLD code captured the value only
  // on first mount, so when the banner later mutated the prop the card
  // never re-rendered as "responded" and stayed stuck on the pending UI.
  // The fix: derive from `message.content.responded` on every render (so
  // the banner-driven mutation propagates immediately), OR from a local
  // `locallyResponded` flag (so this card's own Confirm click optimistically
  // flips before the upstream re-renders flow back through the message
  // list). `ApprovalCardBase` does this for us — we just hand it
  // `responded` and let its internal `locallyResponded` keep the success
  // state visible across transient prop flips.
  const propResponded = Boolean((message.content as { responded?: boolean } | undefined)?.responded);
  const [isResponding, setIsResponding] = useState(false);

  // P1.2a (D6): inheritance row. Only shown for sub-agent-attributed
  // prompts (parent_session_id set), AND for kinds that aren't in the
  // high-risk opt-out list. High-risk kinds default OFF (the toggle is
  // shown but the default is unchecked) so a low-risk grant on the parent
  // never accidentally blesses a high-risk sibling in a sub-agent.
  const kind = action ?? '';
  const isHighRisk = HIGH_RISK_KINDS.has(kind);
  const showInheritanceRow = Boolean(parent_session_id);
  const [inheritToSubagents, setInheritToSubagents] = useState(false);

  // Pull the target path off the allow_dir option's params (set by the
  // backend in the `permission.asked` handler). For external_directory
  // prompts this is the most reliable source of the requested path —
  // the top-level `description` field is best-effort and varies per
  // permission type, so we prefer the explicit path when available.
  const allowDirOption = (options || []).find((opt) => String(opt?.value) === 'allow_dir');
  const targetPath = (allowDirOption as { params?: Record<string, string> } | undefined)?.params?.path;

  const handleConfirm = useCallback(
    async (option: { id: string; params?: Record<string, string> }) => {
      if (isResponding) return;
      setIsResponding(true);
      try {
        const always_allow = option.id === 'proceed_always' || inheritToSubagents;
        const extraParams = option.params;
        const payload: Record<string, unknown> = { value: option.id };
        if (extraParams) payload.params = extraParams;
        if (inheritToSubagents && parent_session_id) {
          // Ride-along so the backend can record the inheritance on the
          // blessable sub-agent set. The backend reads
          // `data.inherit_to_subagents` only when `value` is a granting
          // option (allow_dir / allow_session / always); for once/reject
          // the flag is ignored.
          payload.inherit_to_subagents = true;
        }
        await ipcBridge.conversation.confirmation.confirm.invoke({
          conversation_id: message.conversation_id,
          call_id,
          msg_id: message.msg_id || '',
          data: payload,
          always_allow,
        });
        updateMessageList((list) =>
          list.map((m) => {
            if (m.id !== message.id) return m;
            const next = {
              ...m,
              content: { ...(m.content as object), responded: true, response: option.id },
            } as unknown as TMessage;
            return next;
          })
        );
      } catch (error) {
        console.error('Error confirming permission:', error);
      } finally {
        setIsResponding(false);
      }
    },
    [
      isResponding,
      call_id,
      message.conversation_id,
      message.msg_id,
      message.id,
      updateMessageList,
      inheritToSubagents,
      parent_session_id,
    ]
  );

  return (
    <ApprovalCardBase
      testIdPrefix='message-permission'
      parentSessionId={parent_session_id ?? null}
      sessionId={session_id ?? null}
      action={action ?? null}
      title={title ?? null}
      description={description ?? null}
      commandType={shellCommandLine ?? command_type ?? null}
      approvalCallId={call_id ?? null}
      targetPath={typeof targetPath === 'string' && targetPath.startsWith('/') ? targetPath : null}
      options={normalized}
      responded={propResponded}
      onConfirm={handleConfirm}
      onReject={() => {
        void handleConfirm({ id: 'reject' });
      }}
      bodySlot={
        showInheritanceRow ? (
          <div className='flex items-center gap-8px px-20px' data-testid='message-permission-inheritance-row'>
            <Checkbox
              checked={inheritToSubagents}
              onChange={(v) => setInheritToSubagents(Boolean(v))}
              disabled={isHighRisk}
            >
              {isHighRisk ? t('conversation.approval.inheritanceHighRiskOff') : t('conversation.approval.inheritance')}
            </Checkbox>
          </div>
        ) : null
      }
    />
  );
});

export default MessagePermission;
