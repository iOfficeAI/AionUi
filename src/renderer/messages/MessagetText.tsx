/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chatLib';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import MarkdownView from '../components/Markdown';

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

  // 过滤空内容，避免渲染空DOM
  if (!message.content.content || (typeof message.content.content === 'string' && !message.content.content.trim())) {
    return null;
  }

  return (
    <div className={classNames('rd-8px  rd-tr-2px  [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px max-w-80%', { 'bg-#E9EFFF p-8px': message.position === 'right' })}>
      <MarkdownView codeStyle={{ marginLeft: 16, marginTop: 4, marginBlock: 4 }}>{json ? `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` : data}</MarkdownView>
    </div>
  );
};

export default MessageText;
