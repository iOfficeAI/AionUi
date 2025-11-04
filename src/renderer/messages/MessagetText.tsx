/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chatLib';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import MarkdownView from '../components/Markdown';
import CollapsibleContent from '../components/CollapsibleContent';
import { Copy } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { iconColors } from '@/renderer/theme/colors';
import { Tooltip } from '@arco-design/web-react';

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
      <div className='flex flex-col'>
        <div className={classNames('rd-8px rd-tr-2px [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px', { 'bg-message-user p-8px': message.position === 'right' })}>
          {/* JSON 内容使用折叠组件 Use CollapsibleContent for JSON content */}
          {json ? (
            <CollapsibleContent maxHeight={200} defaultCollapsed={true}>
              <MarkdownView codeStyle={{ marginLeft: 16, marginTop: 4, marginBlock: 4 }}>{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
            </CollapsibleContent>
          ) : (
            <MarkdownView codeStyle={{ marginLeft: 16, marginTop: 4, marginBlock: 4 }}>{data}</MarkdownView>
          )}
        </div>
        <div
          className={classNames('flex items-center mt-4px', {
            'justify-end': message.position === 'right',
            'justify-start': message.position !== 'right',
          })}
        >
          <Tooltip content={t('common.copy', { defaultValue: 'Copy' })}>
            <div className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors' onClick={handleCopy} style={{ lineHeight: 0 }}>
              <Copy theme='outline' size='16' fill={iconColors.secondary} />
            </div>
          </Tooltip>
        </div>
      </div>
      {showToast && (
        <div className='fixed top-20px left-50% transform -translate-x-50% px-16px py-8px rd-6px text-14px shadow-lg z-9999' style={{ backgroundColor: 'rgb(var(--success-6))', color: 'var(--color-white)' }}>
          {t('messages.copySuccess')}
        </div>
      )}
    </>
  );
};

export default MessageText;
