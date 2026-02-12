/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAvailableCommands } from '@/common/chatLib';
import AionCollapse from '@/renderer/components/base/AionCollapse';
import CollapsibleContent from '@/renderer/components/CollapsibleContent';
import { iconColors } from '@/renderer/theme/colors';
import { HammerAndAnvil } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface MessageAvailableCommandsProps {
  message: IMessageAvailableCommands;
}

const MessageAvailableCommands: React.FC<MessageAvailableCommandsProps> = ({ message }) => {
  const { t } = useTranslation();
  const { commands } = message.content;

  if (!commands || commands.length === 0) {
    return null;
  }

  return (
    <div className='w-full'>
      <div className='flex items-center gap-8px mb-8px'>
        <HammerAndAnvil theme='outline' size='16' fill={iconColors.primary} />
        <span className='text-t-secondary text-13px font-medium'>{t('messages.availableCommands', { count: commands.length })}</span>
      </div>
      <CollapsibleContent maxHeight={150} defaultCollapsed={true}>
        <AionCollapse accordion bordered={false} expandIconPosition='right'>
          {commands.map((command) => (
            <AionCollapse.Item key={command.name} name={command.name} header={<span className='text-t-primary font-medium'>{command.name}</span>}>
              <div className='p-12px text-13px text-t-secondary'>
                {command.description}
                {command.hint && <span className='text-t-tertiary ml-4px'>({command.hint})</span>}
              </div>
            </AionCollapse.Item>
          ))}
        </AionCollapse>
      </CollapsibleContent>
    </div>
  );
};

export default MessageAvailableCommands;
