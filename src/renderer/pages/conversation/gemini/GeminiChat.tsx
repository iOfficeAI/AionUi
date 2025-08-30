/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TModelWithConversation } from '@/common/storage';
import FlexFullContainer from '@renderer/components/FlexFullContainer';
import MessageList from '@renderer/messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/messages/hooks';
import HOC from '@renderer/utils/HOC';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import GeminiSendBox from './GeminiSendBox';

const GeminiChat: React.FC<{
  workspace: string;
  conversation_id: string;
  model: TModelWithConversation;
}> = ({ conversation_id, model }) => {
  const { t } = useTranslation();

  useMessageLstCache(conversation_id);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const nearRight = rect.right - e.clientX <= 12 && rect.right - e.clientX >= -2;
      if (nearRight) el.classList.add('scrollbar-gentle--hover');
      else el.classList.remove('scrollbar-gentle--hover');
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div className='h-full  flex flex-col px-20px'>
      <FlexFullContainer containerRef={containerRef} containerClassName=''>
        <MessageList className='flex-1'></MessageList>
      </FlexFullContainer>
      <GeminiSendBox conversation_id={conversation_id} model={model}></GeminiSendBox>
    </div>
  );
};

export default HOC(MessageListProvider)(GeminiChat);
