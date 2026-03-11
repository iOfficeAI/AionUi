/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageStarOfficeCard } from '@/common/chatLib';
import { iconColors } from '@/renderer/theme/colors';
import { Alert, Message, Tooltip } from '@arco-design/web-react';
import { Copy } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyText } from '@/renderer/utils/clipboard';
import MarkdownView from '../components/Markdown';

const MessageStarOfficeCard: React.FC<{ message: IMessageStarOfficeCard }> = ({ message }) => {
  const { t } = useTranslation();
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const content = message.content.content;

  if (!content?.trim()) return null;

  const handleCopy = () => {
    copyText(content)
      .then(() => {
        setShowCopyAlert(true);
        setTimeout(() => setShowCopyAlert(false), 2000);
      })
      .catch(() => {
        Message.error(t('common.copyFailed'));
      });
  };

  return (
    <>
      <div className='min-w-0 flex flex-col group items-start'>
        <div className='min-w-0 [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px md:max-w-780px w-full'>
          <div
            className='rounded-14px border px-14px py-12px'
            style={{
              borderColor: 'rgb(var(--arcoblue-3))',
              background: 'linear-gradient(135deg, rgba(var(--arcoblue-1), 0.62) 0%, rgba(var(--arcoblue-2), 0.28) 60%, var(--color-bg-2) 100%)',
            }}
          >
            <div className='mb-8px text-12px font-600 tracking-[0.2px]' style={{ color: 'var(--color-text-2)' }}>
              STAR OFFICE ASSISTANT
            </div>
            <MarkdownView codeStyle={{ marginTop: 4, marginBlock: 4 }}>{content}</MarkdownView>
          </div>
        </div>
        <div className='h-32px flex items-center mt-4px justify-start'>
          <Tooltip content={t('common.copy', { defaultValue: 'Copy' })}>
            <div className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto' onClick={handleCopy} style={{ lineHeight: 0 }}>
              <Copy theme='outline' size='16' fill={iconColors.secondary} />
            </div>
          </Tooltip>
        </div>
      </div>
      {showCopyAlert && <Alert type='success' content={t('messages.copySuccess')} showIcon className='fixed top-20px left-50% transform -translate-x-50% z-9999 w-max max-w-[80%]' style={{ boxShadow: '0px 2px 12px rgba(0,0,0,0.12)' }} closable={false} />}
    </>
  );
};

export default MessageStarOfficeCard;
