/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chatLib';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import MarkdownView from '../components/Markdown';
import { Copy } from '@icon-park/react';
import { useTranslation } from 'react-i18next';

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
  const [isHovered, setIsHovered] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const { t } = useTranslation();

  // 过滤空内容，避免渲染空DOM
  if (!message.content.content || (typeof message.content.content === 'string' && !message.content.content.trim())) {
    return null;
  }

  const handleCopy = () => {
    const textToCopy = json ? JSON.stringify(data, null, 2) : message.content.content;
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
      })
      .catch((error) => {
        console.error('Copy failed:', error);
      });
  };

  return (
    <>
      <div className='flex flex-col' onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
        <div className={classNames('rd-8px  rd-tr-2px  [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px', { 'bg-#E9EFFF p-8px': message.position === 'right' })}>
          <MarkdownView codeStyle={{ marginLeft: 16, marginTop: 4, marginBlock: 4 }}>{json ? `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` : data}</MarkdownView>
        </div>
        {isHovered && (
          <div
            className={classNames('flex items-center mt-4px', {
              'justify-end': message.position === 'right',
              'justify-start': message.position !== 'right',
            })}
          >
            <div className='p-4px rd-4px cursor-pointer hover:bg-#e5e6eb transition-colors' onClick={handleCopy} title={t('messages.copy')}>
              <Copy theme='outline' size='16' fill='#86909c' />
            </div>
          </div>
        )}
      </div>
      {showToast && <div className='fixed top-20px left-50% transform -translate-x-50% bg-green-600 text-white px-16px py-8px rd-6px text-14px shadow-lg z-9999'>{t('messages.copySuccess')}</div>}
    </>
  );
};

export default MessageText;
