/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageTips } from '@/common/chatLib';
import { Attention, CheckOne } from '@icon-park/react';
import { theme } from '@office-ai/platform';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import MarkdownView from '../components/Markdown';
const icon = {
  success: <CheckOne theme='filled' size='16' fill={theme.Color.FunctionalColor.success} className='m-t-2px' />,
  warning: <Attention theme='filled' size='16' strokeLinejoin='bevel' className='m-t-2px' fill={theme.Color.FunctionalColor.warn} />,
  error: <Attention theme='filled' size='16' strokeLinejoin='bevel' className='m-t-2px' fill={theme.Color.FunctionalColor.error} />,
};

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      return {
        json: true,
        data: json,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

const MessageTips: React.FC<{ message: IMessageTips }> = ({ message }) => {
  const { content, type } = message.content;
  const { json, data } = useFormatContent(content);

  if (json)
    return (
      <div className=' p-x-12px p-y-8px min-w-400px'>
        <MarkdownView>{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
      </div>
    );
  return (
    <div className={classNames('bg-#f0f4ff rd-8px  p-x-12px p-y-8px flex items-start gap-4px')}>
      {icon[type] || icon.warning}
      <span
        className='whitespace-break-spaces   [word-break:break-word]'
        dangerouslySetInnerHTML={{
          __html: content,
        }}
      ></span>
    </div>
  );
};

export default MessageTips;
