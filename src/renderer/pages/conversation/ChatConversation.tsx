/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import { uuid } from '@/common/utils';
import { Button, Dropdown, Menu, Tooltip, Typography } from '@arco-design/web-react';
import { History } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { emitter } from '../../utils/emitter';
import AcpChat from './acp/AcpChat';
import ChatLayout from './ChatLayout';
import ChatSider from './ChatSider';
import GeminiChat from './gemini/GeminiChat';
import CodexChat from './codex/CodexChat';
import { iconColors } from '@/renderer/theme/colors';
import addChatIcon from '@/renderer/assets/add-chat.svg';
import GeminiModelSelector from './gemini/GeminiModelSelector';
import { useGeminiModelSelection } from './gemini/useGeminiModelSelection';
// import SkillRuleGenerator from './components/SkillRuleGenerator'; // Temporarily hidden

const _AssociatedConversation: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { data } = useSWR(['getAssociateConversation', conversation_id], () => ipcBridge.conversation.getAssociateConversation.invoke({ conversation_id }));
  const navigate = useNavigate();
  const list = useMemo(() => {
    if (!data?.length) return [];
    return data.filter((conversation) => conversation.id !== conversation_id);
  }, [data]);
  if (!list.length) return null;
  return (
    <Dropdown
      droplist={
        <Menu
          onClickMenuItem={(key) => {
            Promise.resolve(navigate(`/conversation/${key}`)).catch((error) => {
              console.error('Navigation failed:', error);
            });
          }}
        >
          {list.map((conversation) => {
            return (
              <Menu.Item key={conversation.id}>
                <Typography.Ellipsis className={'max-w-300px'}>{conversation.name}</Typography.Ellipsis>
              </Menu.Item>
            );
          })}
        </Menu>
      }
      trigger={['click']}
    >
      <Button size='mini' icon={<History theme='filled' size='14' fill={iconColors.primary} strokeWidth={2} strokeLinejoin='miter' strokeLinecap='square' />}></Button>
    </Dropdown>
  );
};

const _AddNewConversation: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!conversation.extra?.workspace) return null;
  return (
    <Tooltip content={t('conversation.workspace.createNewConversation')}>
      <Button
        size='mini'
        icon={<img src={addChatIcon} alt='Add chat' className='w-14px h-14px block m-auto' />}
        onClick={() => {
          const id = uuid();
          ipcBridge.conversation.createWithConversation
            .invoke({ conversation: { ...conversation, id, createTime: Date.now(), modifyTime: Date.now() } })
            .then(() => {
              Promise.resolve(navigate(`/conversation/${id}`)).catch((error) => {
                console.error('Navigation failed:', error);
              });
              emitter.emit('chat.history.refresh');
            })
            .catch((error) => {
              console.error('Failed to create conversation:', error);
            });
        }}
      />
    </Tooltip>
  );
};

// 仅抽取 Gemini 会话，确保包含模型信息
// Narrow to Gemini conversations so model field is always available
type GeminiConversation = Extract<TChatConversation, { type: 'gemini' }>;

const GeminiConversationPanel: React.FC<{ conversation: GeminiConversation; sliderTitle: React.ReactNode }> = ({ conversation, sliderTitle }) => {
  // 共享模型选择状态供头部和发送框复用
  // Share model selection state between header and send box
  const modelSelection = useGeminiModelSelection(conversation.id, conversation.model);
  const workspaceEnabled = Boolean(conversation.extra?.workspace);
  const chatLayoutProps = {
    title: conversation.name,
    siderTitle: sliderTitle,
    sider: <ChatSider conversation={conversation} />,
    headerLeft: <GeminiModelSelector selection={modelSelection} />,
    // headerExtra: <SkillRuleGenerator conversationId={conversation.id} workspace={conversation.extra?.workspace} />, // Temporarily hidden
    workspaceEnabled,
  };

  return (
    <ChatLayout {...chatLayoutProps}>
      <GeminiChat conversation_id={conversation.id} workspace={conversation.extra.workspace} modelSelection={modelSelection} />
    </ChatLayout>
  );
};

const ChatConversation: React.FC<{
  conversation?: TChatConversation;
}> = ({ conversation }) => {
  const { t } = useTranslation();
  const workspaceEnabled = Boolean(conversation?.extra?.workspace);

  const isGeminiConversation = conversation?.type === 'gemini';

  const conversationNode = useMemo(() => {
    if (!conversation || isGeminiConversation) return null;
    switch (conversation.type) {
      case 'acp':
        return <AcpChat key={conversation.id} conversation_id={conversation.id} workspace={conversation.extra?.workspace} backend={conversation.extra?.backend || 'claude'}></AcpChat>;
      case 'codex':
        return <CodexChat key={conversation.id} conversation_id={conversation.id} workspace={conversation.extra?.workspace} />;
      default:
        return null;
    }
  }, [conversation, isGeminiConversation]);

  const sliderTitle = useMemo(() => {
    return (
      <div className='flex items-center justify-between'>
        <span className='text-16px font-bold text-t-primary'>{t('conversation.workspace.title')}</span>
      </div>
    );
  }, [t]);

  if (conversation && conversation.type === 'gemini') {
    // Gemini 会话独立渲染，带右上角模型选择
    // Render Gemini layout with dedicated top-right model selector
    return <GeminiConversationPanel conversation={conversation} sliderTitle={sliderTitle} />;
  }

  return (
    <ChatLayout title={conversation?.name} backend={conversation?.type === 'acp' ? conversation?.extra?.backend : conversation?.type === 'codex' ? 'codex' : undefined} agentName={(conversation?.extra as { agentName?: string })?.agentName} siderTitle={sliderTitle} sider={<ChatSider conversation={conversation} />} workspaceEnabled={workspaceEnabled}>
      {conversationNode}
    </ChatLayout>
  );
};

export default ChatConversation;
