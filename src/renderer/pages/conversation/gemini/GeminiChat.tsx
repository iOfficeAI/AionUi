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
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeColors, useTextColor } from '../../../themes/index';
import GeminiSendBox from './GeminiSendBox';

const GeminiChat: React.FC<{
  workspace: string;
  conversation_id: string;
  model: TModelWithConversation;
}> = ({ conversation_id, model }) => {
  const { t } = useTranslation();
  const themeColors = useThemeColors();
  const getTextColor = useTextColor();

  useMessageLstCache(conversation_id);

  return (
    <div className='h-full flex flex-col px-20px' style={{ backgroundColor: themeColors.background, color: themeColors.textPrimary }}>
      <FlexFullContainer>
        <MessageList className='flex-1'></MessageList>
      </FlexFullContainer>
      <GeminiSendBox conversation_id={conversation_id} model={model}></GeminiSendBox>
    </div>
  );
};

export default HOC(MessageListProvider)(GeminiChat);
