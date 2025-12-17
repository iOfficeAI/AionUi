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
import { Alert, Tooltip } from '@arco-design/web-react';

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
  const { t } = useTranslation();
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const isUserMessage = message.position === 'right';

  // 过滤空内容，避免渲染空DOM
  if (!message.content.content || (typeof message.content.content === 'string' && !message.content.content.trim())) {
    return null;
  }

  const handleCopy = () => {
    const textToCopy = json ? JSON.stringify(data, null, 2) : message.content.content;
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setShowCopyAlert(true);
        setTimeout(() => setShowCopyAlert(false), 2000);
      })
      .catch((error) => {
        console.error('Copy failed:', error);
      });
  };

  const copyButton = (
    <Tooltip content={t('common.copy', { defaultValue: 'Copy' })}>
      <div className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto' onClick={handleCopy} style={{ lineHeight: 0 }}>
        <Copy theme='outline' size='16' fill={iconColors.secondary} />
      </div>
    </Tooltip>
  );

  return (
    <>
      <div className={classNames('flex flex-col group', isUserMessage ? 'items-end' : 'items-start')}>
        <div
          className={classNames('max-w-[95%] md:max-w-[90%] rd-8px rd-tr-2px [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px', {
            'bg-aou-2 p-8px': isUserMessage,
          })}
        >
          {/* JSON 内容使用折叠组件 Use CollapsibleContent for JSON content */}
          {json ? (
            <CollapsibleContent maxHeight={200} defaultCollapsed={true}>
              <MarkdownView codeStyle={{ marginTop: 4, marginBlock: 4 }}>{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
            </CollapsibleContent>
          ) : (
            <MarkdownView codeStyle={{ marginTop: 4, marginBlock: 4 }}>{data}</MarkdownView>
          )}
        </div>
        <div
          className={classNames('h-32px flex items-center mt-4px', {
            'justify-end': isUserMessage,
            'justify-start': !isUserMessage,
          })}
        >
          {copyButton}
        </div>
      </div>
      {showCopyAlert && <Alert type='success' content={t('messages.copySuccess')} showIcon className='fixed top-20px left-50% transform -translate-x-50% z-9999 w-max max-w-[80%]' style={{ boxShadow: '0px 2px 12px rgba(0,0,0,0.12)' }} closable={false} />}
    </>
  );
};

export default MessageText;
