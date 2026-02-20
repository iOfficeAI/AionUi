/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageSwarmDirective } from '@/common/chatLib';
import { Down, Right } from '@icon-park/react';
import { iconColors } from '@/renderer/theme/colors';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

type MessageSwarmDirectiveProps = {
  message: IMessageSwarmDirective;
};

const MessageSwarmDirective: React.FC<MessageSwarmDirectiveProps> = ({ message }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { fromName, fromAvatar, summary } = message.content;

  return (
    <div className='w-full my-8px'>
      <div className='flex items-center gap-8px px-12px py-6px rd-8px bg-[color:var(--color-fill-2)] cursor-pointer hover:bg-[color:var(--color-fill-3)] transition-colors' onClick={() => setExpanded(!expanded)}>
        <span className='text-14px'>{fromAvatar}</span>
        <span className='text-12px font-medium text-[color:var(--color-text-2)]'>{t('conversation.swarm.directiveFrom', { name: fromName, defaultValue: `Directive from ${fromName}` })}</span>
        <div className='flex-1' />
        {expanded ? <Down theme='outline' size='12' fill={iconColors.secondary} /> : <Right theme='outline' size='12' fill={iconColors.secondary} />}
      </div>
      {expanded && <div className='mt-4px px-12px py-8px rd-8px bg-[color:var(--color-fill-1)] text-12px text-[color:var(--color-text-3)] whitespace-pre-wrap break-words max-h-200px overflow-y-auto'>{summary}</div>}
    </div>
  );
};

export default MessageSwarmDirective;
