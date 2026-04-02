/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { ListCheckbox, Plus } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import styles from './Sider.module.css';

interface SiderToolbarProps {
  isMobile: boolean;
  isBatchMode: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onNewChat: () => void;
  onToggleBatchMode: () => void;
}

const SiderToolbar: React.FC<SiderToolbarProps> = ({
  isMobile,
  isBatchMode,
  collapsed,
  siderTooltipProps,
  onNewChat,
  onToggleBatchMode,
}) => {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <div className='mb-8px shrink-0 flex flex-col items-center gap-2px w-full'>
        <Tooltip {...siderTooltipProps} content={t('conversation.welcome.newConversation')} position='right'>
          <div
            className={classNames(
              'w-full py-6px flex items-center justify-center cursor-pointer transition-colors text-t-primary rd-8px hover:bg-fill-3 active:bg-fill-4',
              styles.newChatTrigger
            )}
            onClick={onNewChat}
          >
            <Plus
              theme='outline'
              size='22'
              fill='currentColor'
              className={classNames('block leading-none', styles.newChatIcon)}
              style={{ lineHeight: 0 }}
            />
          </div>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className='mb-8px shrink-0 flex items-center gap-8px'>
      <Tooltip {...siderTooltipProps} content={t('conversation.welcome.newConversation')} position='right'>
        <div
          className={classNames(
            styles.newChatTrigger,
            'h-36px flex-1 flex items-center justify-start gap-8px px-10px rd-0.5rem cursor-pointer group transition-all bg-transparent text-t-primary hover:bg-fill-3 active:bg-fill-4',
            isMobile && 'sider-action-btn-mobile'
          )}
          onClick={onNewChat}
        >
          <div className='size-28px rd-8px bg-aou-2 border border-solid border-[var(--color-border-2)] group-hover:bg-fill-3 group-hover:border-transparent flex items-center justify-center shrink-0 transition-colors'>
            <Plus
              theme='outline'
              size='18'
              fill='currentColor'
              className={classNames('block leading-none', styles.newChatIcon)}
              style={{ lineHeight: 0 }}
            />
          </div>
          <span className='collapsed-hidden text-t-primary text-14px font-medium leading-22px'>
            {t('conversation.welcome.newConversation')}
          </span>
        </div>
      </Tooltip>
      <Tooltip
        {...siderTooltipProps}
        content={isBatchMode ? t('conversation.history.batchModeExit') : t('conversation.history.batchManage')}
        position='right'
      >
        <div
          className={classNames(
            'h-36px w-36px rd-0.5rem flex items-center justify-center cursor-pointer shrink-0 transition-all border border-solid border-transparent',
            isMobile && 'sider-action-icon-btn-mobile',
            {
              'hover:bg-fill-2 hover:border-[var(--color-border-2)]': !isBatchMode,
              'bg-[rgba(var(--primary-6),0.12)] border-[rgba(var(--primary-6),0.24)] text-primary': isBatchMode,
            }
          )}
          onClick={onToggleBatchMode}
        >
          <ListCheckbox theme='outline' size='20' className='block leading-none shrink-0' style={{ lineHeight: 0 }} />
        </div>
      </Tooltip>
    </div>
  );
};

export default SiderToolbar;
