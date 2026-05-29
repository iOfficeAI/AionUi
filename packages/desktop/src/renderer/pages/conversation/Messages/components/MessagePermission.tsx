/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessagePermission, TMessage } from '@/common/chat/chatLib';
import { ipcBridge } from '@/common';
import { useUpdateMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { Button, Card, Radio, Tag, Typography } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MessageMcpElicitation from './MessageMcpElicitation';

const { Text } = Typography;

interface MessagePermissionProps {
  message: IMessagePermission;
}

const actionIcons: Record<string, string> = {
  exec: '⚡',
  edit: '✏️',
  info: '📖',
  mcp: '🔌',
};

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

  const { options = [], description, title, action, call_id, command_type, parent_session_id } = content;

  // Pre-select the safest option (whichever value contains "once") so a fast
  // double-click doesn't accidentally land on "always", which would silence
  // every subsequent shell prompt in the session via the backend's
  // `approval_memory`. The user can still flip to "always"/"reject"
  // deliberately, but they have to actually pick it.
  const defaultSelected = useMemo(() => {
    const onceOption = options.find((opt) => String(opt.value).toLowerCase().includes('once'));
    return onceOption ? String(onceOption.value) : null;
  }, [options]);

  // CRITICAL: `hasResponded` MUST stay in sync with `message.content.responded`
  // because the PendingApprovalsBanner ("Approve all") calls
  // `updateMessageList` to flip `content.responded = true` on every card it
  // resolves. The OLD code did `useState(initialResponded)`, which captures
  // the value ONLY on first mount — when the banner later mutated the prop,
  // the card never re-rendered as "responded" and stayed stuck on the
  // pending UI. That was the "I'm hitting autoapprove but the inline
  // prompts still show requesting approval" bug.
  //
  // Fix: derive `hasResponded` from `message.content.responded` on every
  // render (so the banner-driven mutation propagates immediately), OR from
  // a local `locallyResponded` flag (so this card's own Confirm click
  // optimistically flips before the upstream re-renders flow back through
  // the message list).
  const propResponded = Boolean((message.content as { responded?: boolean } | undefined)?.responded);
  const [selected, setSelected] = useState<string | null>(defaultSelected);
  const [isResponding, setIsResponding] = useState(false);
  const [locallyResponded, setLocallyResponded] = useState(false);
  const hasResponded = propResponded || locallyResponded;
  // Compat shim for the existing `setHasResponded(true)` call sites — just
  // flip the local flag; the prop will catch up via updateMessageList.
  const setHasResponded = (_v: boolean) => setLocallyResponded(true);

  const icon = actionIcons[action || ''] || '🔐';
  const displayTitle = title || description || t('messages.permissionRequest');

  const handleConfirm = async () => {
    // Synchronous guard against rapid double-submit. Without `isResponding`
    // here, a fast double-click between user click and HTTP completion would
    // POST the same call_id twice — the backend dedupes now but the
    // round-trip is wasted and OpenCode logs a `PermissionNotFoundError` on
    // the second hit (the cause of the noisy 404s in the prior trace).
    if (hasResponded || isResponding || !selected) return;

    setIsResponding(true);
    try {
      const always_allow = selected === 'proceed_always';
      // When the user picks an "allow_dir" / "allow_session" option, the
      // matching params (`path` / `sessionID`) need to ride along so the
      // backend knows what to bless. We look up the selected option to
      // grab its `params` and pack them into the `data` payload — the
      // backend reads `data.params.{path,sessionID}` (or `data.path` /
      // `data.sessionID` as a fallback).
      const chosen = options.find((opt) => String(opt.value) === selected);
      const extraParams = chosen?.params ?? undefined;
      const payload: Record<string, unknown> = { value: selected };
      if (extraParams) payload.params = extraParams;
      await ipcBridge.conversation.confirmation.confirm.invoke({
        conversation_id: message.conversation_id,
        call_id,
        msg_id: message.msg_id || '',
        data: payload,
        always_allow,
      });
      setHasResponded(true);
      // Persist the responded state onto the message so siblings (banner)
      // can filter this card out of the "pending" count. Mutating
      // `content.responded` is intentional: the renderer's compose merge
      // for permission messages is keyed by call_id and does a shallow
      // merge of new content, so this update lands without disturbing the
      // rest of the list.
      updateMessageList((list) =>
        list.map((m) => {
          if (m.id !== message.id) return m;
          const next = {
            ...m,
            content: { ...(m.content as object), responded: true, response: selected },
          } as unknown as TMessage;
          return next;
        })
      );
    } catch (error) {
      console.error('Error confirming permission:', error);
    } finally {
      setIsResponding(false);
    }
  };

  // Pull the target path off the allow_dir option's params (set by the
  // backend in the `permission.asked` handler). For external_directory
  // prompts this is the most reliable source of the requested path — the
  // top-level `description` field is best-effort and varies per permission
  // type, so we prefer the explicit path when available. Used to render
  // the path prominently below so the user can tell rapid-fire cards apart
  // at a glance instead of squinting at a sea of identical
  // "external_directory" labels.
  const targetPath = useMemo<string | undefined>(() => {
    for (const opt of options) {
      if (opt?.value !== 'allow_dir') continue;
      const p = (opt as { params?: Record<string, string> })?.params?.path;
      if (typeof p === 'string' && p.startsWith('/')) return p;
    }
    return undefined;
  }, [options]);

  return (
    <Card className='mb-4' bordered={false} style={{ background: 'var(--bg-1)' }} data-testid='message-permission-card'>
      <div className='space-y-4'>
        <div className='flex items-center space-x-2'>
          {/*
            Sub-agent attribution: when `parent_session_id` is set, the
            confirmation came from a child OpenCode session. Flagging it
            visibly so the user knows they're approving a sub-agent's
            action rather than the main agent's.
          */}
          {parent_session_id && (
            <Tag color='arcoblue' size='small'>
              {t('messages.remoteSubagent.tag')}
            </Tag>
          )}
          <span className='text-2xl'>{icon}</span>
          <Text className='block'>{displayTitle}</Text>
        </div>
        {targetPath && (
          /*
           * Path prominence: when the request is a directory/file access,
           * surface the exact path as the primary identifier. Rapid bursts
           * of "external_directory" prompts were indistinguishable without
           * this — they all rendered with the same generic title.
           */
          <div>
            <Text className='text-xs text-t-secondary mb-1'>Path</Text>
            <code className='text-xs bg-1 p-2 rounded block text-t-primary break-all'>{targetPath}</code>
          </div>
        )}
        {command_type && command_type !== 'external_directory' && (
          <div>
            <Text className='text-xs text-t-secondary mb-1'>{t('messages.command')}</Text>
            <code className='text-xs bg-1 p-2 rounded block text-t-primary break-all'>{command_type}</code>
          </div>
        )}
        {description && description !== displayTitle && description !== targetPath && (
          <div>
            <Text className='text-xs text-t-secondary'>{description}</Text>
          </div>
        )}
        {!hasResponded && (
          <>
            <div className='mt-10px'>{t('messages.chooseAction')}</div>
            <Radio.Group direction='vertical' size='mini' value={selected} onChange={setSelected}>
              {options.length > 0 ? (
                options.map((option, index) => (
                  <div
                    key={String(option.value) || `option_${index}`}
                    data-testid={`message-permission-option-${String(option.value) || `option_${index}`}`}
                  >
                    <Radio value={String(option.value)}>
                      {t(option.label, { ...option.params, defaultValue: option.label })}
                    </Radio>
                  </div>
                ))
              ) : (
                <Text type='secondary'>{t('messages.noOptionsAvailable')}</Text>
              )}
            </Radio.Group>
            <div className='flex justify-start pl-20px'>
              <Button
                type='primary'
                size='mini'
                disabled={!selected || isResponding}
                onClick={handleConfirm}
                data-testid='message-permission-confirm'
              >
                {isResponding ? t('messages.processing') : t('messages.confirm')}
              </Button>
            </div>
          </>
        )}
        {hasResponded && (
          <div
            className='mt-10px p-2 rounded-md border'
            style={{ backgroundColor: 'var(--color-success-light-1)', borderColor: 'rgb(var(--success-3))' }}
          >
            <Text className='text-sm' style={{ color: 'rgb(var(--success-6))' }}>
              ✓ {t('messages.responseSentSuccessfully')}
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
});

export default MessagePermission;
