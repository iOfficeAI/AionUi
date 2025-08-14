/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ChatLayout from './ChatLayout';
import ChatSider from './ChatSider';
import GeminiChat from './gemini/GeminiChat';

const ChatConversation: React.FC<{
  conversation: TChatConversation;
}> = ({ conversation }) => {
  const { t } = useTranslation();
  const conversationNode = useMemo(() => {
    switch (conversation.type) {
      case 'gemini':
        return <GeminiChat conversation_id={conversation.id} workspace={conversation.extra.workspace} model={conversation.model}></GeminiChat>;
      default:
        return null;
    }
  }, [conversation]);

  const siderTitle = useMemo(() => {
    switch (conversation?.type) {
      case 'gemini':
        return <span className='text-16px font-bold color-#111827'>{t('conversation.workspace.title')}</span>;
    }
    return null;
  }, [conversation]);

  return (
    <ChatLayout title={conversation.name} siderTitle={siderTitle} sider={<ChatSider conversation={conversation} />}>
      {conversationNode}
    </ChatLayout>
  );
};

export default ChatConversation;
