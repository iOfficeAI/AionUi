/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageTips, IMessageTipsErrorMeta } from '@/common/chat/chatLib';
import { Attention, CheckOne } from '@icon-park/react';
import { theme } from '@office-ai/platform';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationContextSafe } from '@renderer/hooks/context/ConversationContext';
import MarkdownView from '@renderer/components/Markdown';
import CollapsibleContent from '@renderer/components/chat/CollapsibleContent';
import { emitter } from '@renderer/utils/emitter';

const icon = {
  success: <CheckOne theme='filled' size='16' fill={theme.Color.FunctionalColor.success} className='m-t-2px' />,
  warning: (
    <Attention
      theme='filled'
      size='16'
      strokeLinejoin='bevel'
      className='m-t-2px'
      fill={theme.Color.FunctionalColor.warn}
    />
  ),
  error: (
    <Attention
      theme='filled'
      size='16'
      strokeLinejoin='bevel'
      className='m-t-2px'
      fill={theme.Color.FunctionalColor.error}
    />
  ),
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

/** Codes for which we ship a dedicated title + hint in i18n. Unknown codes
 * fall back to showing the raw code as the title. */
const KNOWN_ERROR_CODES = new Set([
  'KSC_PROXY_STREAM_IDLE',
  'KSC_PROXY_STREAM_ERROR',
  'KSC_PROXY_TIMEOUT',
  'KSC_PROXY_FAILED',
  'AIONRS_NETWORK_ERROR',
  'AIONRS_UPSTREAM_5XX',
  'AIONRS_UNAUTHORIZED',
  'AIONRS_RATE_LIMITED',
  'AIONRS_PROCESS_EXIT',
  'AIONRS_BOOTSTRAP_FAILED',
  'AIONRS_UNKNOWN_ERROR',
]);

const StructuredErrorTips: React.FC<{ message: string; errorMeta: IMessageTipsErrorMeta }> = ({
  message,
  errorMeta,
}) => {
  const { t } = useTranslation();
  const conversation = useConversationContextSafe();
  const known = KNOWN_ERROR_CODES.has(errorMeta.code);

  const title = known
    ? t(`conversation.error.${errorMeta.code}.title` as any, { defaultValue: errorMeta.code })
    : errorMeta.code;
  const hint =
    errorMeta.hint ?? (known ? t(`conversation.error.${errorMeta.code}.hint` as any, { defaultValue: '' }) : '');

  const handleRetry = () => {
    if (!conversation?.conversationId) return;
    emitter.emit('chat.retry.last', { conversationId: conversation.conversationId });
  };

  return (
    <div className='w-full'>
      <div className='bg-message-tips rd-8px p-x-12px p-y-8px flex items-start gap-8px'>
        {icon.error}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-8px flex-wrap'>
            <span className='font-medium text-t-primary'>{title}</span>
            <span className='text-12px text-t-tertiary font-mono'>[{errorMeta.code}]</span>
          </div>
          {message && (
            <CollapsibleContent maxHeight={48} defaultCollapsed={true} className='mt-4px' useMask={true}>
              <span className='whitespace-break-spaces text-12px text-t-secondary [word-break:break-word]'>
                {message}
              </span>
            </CollapsibleContent>
          )}
          {hint && <div className='mt-4px text-12px text-t-secondary'>{hint}</div>}
          {errorMeta.retryable && conversation?.conversationId && (
            <button
              type='button'
              onClick={handleRetry}
              className='mt-8px text-12px text-arcoblue-6 hover:text-arcoblue-7 bg-transparent border-none cursor-pointer p-0'
            >
              {t('conversation.error.retry')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const MessageTips: React.FC<{ message: IMessageTips }> = ({ message }) => {
  const { content, type, errorMeta } = message.content;

  if (type === 'error' && errorMeta) {
    return <StructuredErrorTips message={content} errorMeta={errorMeta} />;
  }

  const { json, data } = useFormatContent(content);

  const displayContent = json ? '' : content;

  if (json)
    return (
      <div className='w-full'>
        <div className={classNames('bg-message-tips rd-8px p-x-12px p-y-8px flex items-start gap-4px')}>
          {icon[type] || icon.warning}
          <MarkdownView>{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
        </div>
      </div>
    );
  return (
    <div className='w-full'>
      <div className={classNames('bg-message-tips rd-8px  p-x-12px p-y-8px flex items-start gap-4px')}>
        {icon[type] || icon.warning}
        <CollapsibleContent maxHeight={48} defaultCollapsed={true} className='flex-1' useMask={true}>
          <span
            className='whitespace-break-spaces text-t-primary [word-break:break-word]'
            dangerouslySetInnerHTML={{
              __html: displayContent,
            }}
          ></span>
        </CollapsibleContent>
      </div>
    </div>
  );
};

export default MessageTips;
