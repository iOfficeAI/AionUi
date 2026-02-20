/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import type { AcpBackend } from '@/types/acpTypes';
import { ConversationProvider } from '@/renderer/context/ConversationContext';
import FlexFullContainer from '@renderer/components/FlexFullContainer';
import MessageList from '@renderer/messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConversationChatConfirm from '../components/ConversationChatConfirm';
import AcpSendBox from '../acp/AcpSendBox';
import AcpChat from '../acp/AcpChat';
import classNames from 'classnames';

type SwarmGroupChatProps = {
  conversation: TChatConversation;
};

type AgentTab = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  conversationId: string;
};

/**
 * Swarm group chat component.
 * Shows the main group conversation as primary tab, with individual
 * agent conversations as additional tabs.
 */
const SwarmGroupChatInner: React.FC<SwarmGroupChatProps> = ({ conversation }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>('group');
  const [childConversations, setChildConversations] = useState<TChatConversation[]>([]);

  const conversationId = conversation.id;
  const extra = conversation.extra as { workspace?: string; backend?: string; agentName?: string };
  const workspace = extra?.workspace;
  const backend = (extra?.backend || 'claude') as AcpBackend;

  useMessageLstCache(conversationId);

  // Load child agent conversations
  useEffect(() => {
    ipcBridge.database.getChildConversations
      .invoke({ parent_id: conversationId })
      .then((children) => {
        setChildConversations(children || []);
      })
      .catch((error) => {
        console.error('[SwarmGroupChat] Failed to load child conversations:', error);
      });
  }, [conversationId]);

  // Build agent tabs from child conversations
  const agentTabs: AgentTab[] = useMemo(() => {
    return childConversations.map((child) => {
      const nameParts = child.name?.split('/') || [];
      const role = nameParts[nameParts.length - 1] || 'agent';
      const childExtra = child.extra as { agentName?: string };
      return {
        id: child.id,
        name: childExtra?.agentName || role,
        role,
        avatar: role === 'driver' ? '🔧' : role === 'navigator' ? '🧭' : '🤖',
        conversationId: child.id,
      };
    });
  }, [childConversations]);

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  // The group tab shows the unified group chat
  const isGroupActive = activeTab === 'group';

  return (
    <div className='flex-1 flex flex-col h-full'>
      {/* Swarm tab bar */}
      <div className='flex items-center h-36px border-b border-solid border-[color:var(--border-base)] bg-2 shrink-0 px-4px overflow-x-auto'>
        {/* Group tab (primary) */}
        <div className={classNames('flex items-center gap-4px px-12px h-full cursor-pointer transition-colors text-13px shrink-0', isGroupActive ? 'bg-1 text-[color:var(--color-text-1)] font-medium border-b-2 border-solid border-[color:rgb(var(--primary-6))]' : 'text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-2)]')} onClick={() => handleTabClick('group')}>
          <span>💬</span>
          <span>{t('conversation.swarm.groupChat', 'Group Chat')}</span>
        </div>

        {/* Agent tabs (secondary) */}
        {agentTabs.map((tab) => (
          <div key={tab.id} className={classNames('flex items-center gap-4px px-12px h-full cursor-pointer transition-colors text-13px shrink-0', activeTab === tab.id ? 'bg-1 text-[color:var(--color-text-1)] font-medium border-b-2 border-solid border-[color:rgb(var(--primary-6))]' : 'text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-2)]')} onClick={() => handleTabClick(tab.id)}>
            <span>{tab.avatar}</span>
            <span>{tab.name}</span>
          </div>
        ))}
      </div>

      {/* Content area */}
      <div className='flex-1 flex flex-col min-h-0'>
        {isGroupActive ? (
          /* Group chat view - shows all agent responses in one unified chat */
          <ConversationProvider value={{ conversationId, workspace, type: 'acp' }}>
            <div className='flex-1 flex flex-col px-20px'>
              <FlexFullContainer>
                <MessageList className='flex-1' />
              </FlexFullContainer>
              <ConversationChatConfirm conversation_id={conversationId}>
                <AcpSendBox conversation_id={conversationId} backend={backend} />
              </ConversationChatConfirm>
            </div>
          </ConversationProvider>
        ) : (
          /* Individual agent chat view */
          <AcpChat key={activeTab} conversation_id={activeTab} workspace={workspace} backend={backend} />
        )}
      </div>
    </div>
  );
};

const SwarmGroupChat = HOC(MessageListProvider)(SwarmGroupChatInner);

export default SwarmGroupChat;
