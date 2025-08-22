/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import MarkdownView from '../components/Markdown';
import classNames from 'classnames';
import type { IMessageText } from '@/common/chatLib';
import { useThemeColors, useTextColor } from '../themes/index';

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      const isJson = typeof json === 'object';
      return {
        json: isJson,
        data: isJson ? json : content,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

const MessageText: React.FC<{ message: IMessageText }> = ({ message }) => {
  const { data, json } = useFormatContent(message.content.content);
  const themeColors = useThemeColors();
  const getTextColor = useTextColor();

  const isUserMessage = message.position === 'right';

  return (
    <div
      className={classNames('rd-8px rd-tr-2px [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px max-w-80%', { 'p-8px': isUserMessage })}
      style={{
        backgroundColor: isUserMessage ? themeColors.surfaceSelected : 'transparent',
        color: getTextColor('message.text', 'textPrimary'),
      }}
    >
      <MarkdownView codeStyle={{ marginLeft: 16, marginTop: 4, marginBlock: 4 }}>{json ? `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` : data}</MarkdownView>
    </div>
  );
};

export default MessageText;
