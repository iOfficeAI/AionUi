/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpPermission, TMessage } from '@/common/chat/chatLib';
import { conversation } from '@/common/adapter/ipcBridge';
import { useUpdateMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { Button, Card, Radio, Tag, Typography } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface MessageAcpPermissionProps {
  message: IMessageAcpPermission;
}

const MessageAcpPermission: React.FC<MessageAcpPermissionProps> = React.memo(({ message }) => {
  const { options = [], tool_call } = message.content || {};
  const { t } = useTranslation();
  const updateMessageList = useUpdateMessageList();

  // 基于实际数据生成显示信息
  const getToolInfo = () => {
    if (!tool_call) {
      return {
        title: t('messages.permissionRequest'),
        description: t('messages.agentRequestingPermission'),
        icon: '🔐',
      };
    }

    const displayTitle = tool_call.title || tool_call.raw_input?.description || t('messages.permissionRequest');

    // 简单的图标映射
    const kindIcons: Record<string, string> = {
      edit: '✏️',
      read: '📖',
      fetch: '🌐',
      execute: '⚡',
    };

    return {
      title: displayTitle,
      icon: kindIcons[tool_call.kind || 'execute'] || '⚡',
    };
  };
  const { title, icon } = getToolInfo();
  const [selected, setSelected] = useState<string | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  // hasResponded MUST follow message.content.responded so when the
  // PendingApprovalsBanner ("Approve all") flips that flag via
  // updateMessageList, this card re-renders as resolved instead of staying
  // stuck on the radio prompt. useState(false) captured only the initial
  // mount value and ignored every subsequent prop update — that's the
  // "approve all does nothing visible" bug.
  const propResponded = Boolean((message.content as { responded?: boolean } | undefined)?.responded);
  const [locallyResponded, setLocallyResponded] = useState(false);
  const hasResponded = propResponded || locallyResponded;
  const setHasResponded = (_v: boolean) => setLocallyResponded(true);

  const handleConfirm = async () => {
    // Guard rapid double-submit on top of `hasResponded` (which only flips
    // *after* the await). Without this an over-eager click bursts the same
    // `confirm.invoke` twice — wasted round-trip and noisy 404 from
    // OpenCode's PermissionNotFoundError. Backend dedupe catches it too but
    // we should never get there.
    if (hasResponded || isResponding || !selected) return;

    setIsResponding(true);
    try {
      const invokeData = {
        confirm_key: selected,
        msg_id: message.id,
        conversation_id: message.conversation_id,
        call_id: tool_call?.tool_call_id || message.id,
      };

      await conversation.confirmMessage.invoke(invokeData);
      setHasResponded(true);
      updateMessageList((list) =>
        list.map((m) => {
          if (m.id !== message.id) return m;
          return {
            ...m,
            content: { ...(m.content as object), responded: true, response: selected },
          } as unknown as TMessage;
        })
      );
    } catch (error) {
      // Handle error case - could add error logging here
      console.error('Error confirming permission:', error);
    } finally {
      setIsResponding(false);
    }
  };

  if (!tool_call) {
    return null;
  }

  return (
    <Card
      className='mb-4'
      bordered={false}
      style={{ background: 'var(--bg-1)' }}
      data-testid='message-acp-permission-card'
    >
      <div className='space-y-4'>
        {/* Header with icon and title */}
        <div className='flex items-center space-x-2'>
          {/*
            Sub-agent attribution: a permission whose `parent_session_id` is set
            originated from a child OpenCode session. Flag it visibly so the
            user knows they're approving a sub-agent's action, not the main
            agent's — and can decide whether to scope the grant accordingly.
          */}
          {(message.content as { parent_session_id?: string })?.parent_session_id && (
            <Tag color='arcoblue' size='small'>
              {t('messages.remoteSubagent.tag')}
            </Tag>
          )}
          <span className='text-2xl'>{icon}</span>
          <Text className='block'>{title}</Text>
        </div>
        {(tool_call.raw_input?.command || tool_call.title) && (
          <div>
            <Text className='text-xs text-t-secondary mb-1'>{t('messages.command')}</Text>
            <code className='text-xs bg-1 p-2 rounded block text-t-primary break-all'>
              {tool_call.raw_input?.command || tool_call.title}
            </code>
          </div>
        )}
        {!hasResponded && (
          <>
            <div className='mt-10px'>{t('messages.chooseAction')}</div>
            <Radio.Group direction='vertical' size='mini' value={selected} onChange={setSelected}>
              {options && options.length > 0 ? (
                options.map((option, index) => {
                  const optionName = option?.name || `${t('messages.option')} ${index + 1}`;
                  const option_id = option?.option_id || `option_${index}`;
                  return (
                    <div key={option_id} data-testid={`message-acp-permission-option-${option_id}`}>
                      <Radio value={option_id}>{optionName}</Radio>
                    </div>
                  );
                })
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
                data-testid='message-acp-permission-confirm'
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

export default MessageAcpPermission;
