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
import { useTranslation } from 'react-i18next';
import MarkdownView from '../components/Markdown';
import CollapsibleContent from '../components/CollapsibleContent';
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
  const { t } = useTranslation();

  // Handle structured error messages with error codes
  const getDisplayContent = (content: string): string => {
    if (content.startsWith('ERROR_')) {
      const parts = content.split(': ');
      const errorCode = parts[0].replace('ERROR_', '');
      const originalMessage = parts[1] || '';

      // Map error codes to i18n keys
      const errorMap: Record<string, string> = {
        CLOUDFLARE_BLOCKED: 'codex.network.cloudflare_blocked',
        NETWORK_TIMEOUT: 'codex.network.network_timeout',
        CONNECTION_REFUSED: 'codex.network.connection_refused',
        SESSION_TIMEOUT: 'codex.error.session_timeout',
        SYSTEM_INIT_FAILED: 'codex.error.system_init_failed',
        INVALID_MESSAGE_FORMAT: 'codex.error.invalid_message_format',
        INVALID_INPUT: 'codex.error.invalid_input',
        PERMISSION_DENIED: 'codex.error.permission_denied',
      };

      const i18nKey = errorMap[errorCode];
      if (i18nKey) {
        return t(i18nKey, { defaultValue: originalMessage });
      }
    }
    return content;
  };

  const displayContent = getDisplayContent(content);

  if (json)
    return (
      <div className=' p-x-12px p-y-8px w-full max-w-100% min-w-0'>
        <CollapsibleContent maxHeight={300} defaultCollapsed={true}>
          <MarkdownView>{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
        </CollapsibleContent>
      </div>
    );
  return (
    <div className={classNames('bg-message-tips rd-8px  p-x-12px p-y-8px flex items-start gap-4px')}>
      {icon[type] || icon.warning}
      <CollapsibleContent maxHeight={200} defaultCollapsed={true} className='flex-1' useMask={true}>
        <span
          className='whitespace-break-spaces text-t-primary [word-break:break-word]'
          dangerouslySetInnerHTML={{
            __html: displayContent,
          }}
        ></span>
      </CollapsibleContent>
    </div>
  );
};

export default MessageTips;
