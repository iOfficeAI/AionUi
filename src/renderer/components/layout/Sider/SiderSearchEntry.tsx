/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tooltip } from '@arco-design/web-react';
import { Search } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { iconColors } from '@renderer/styles/colors';
import ConversationSearchPopover from '@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

interface SiderSearchEntryProps {
  isMobile: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onConversationSelect: () => void;
  onSessionClick?: () => void;
}

const SiderSearchEntry: React.FC<SiderSearchEntryProps> = ({
  isMobile,
  collapsed,
  siderTooltipProps,
  onConversationSelect,
  onSessionClick,
}) => {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <Tooltip {...siderTooltipProps} content={t('conversation.historySearch.tooltip')} position='right'>
        <div className='w-full'>
          <ConversationSearchPopover
            onSessionClick={onSessionClick}
            onConversationSelect={onConversationSelect}
            label={t('conversation.historySearch.shortTitle')}
            buttonClassName='!w-full !h-auto !py-6px !px-0 !justify-center !rd-8px !hover:bg-fill-3 !active:bg-fill-4'
          />
        </div>
      </Tooltip>
    );
  }

  return (
    <ConversationSearchPopover
      onSessionClick={onSessionClick}
      onConversationSelect={onConversationSelect}
      renderTrigger={({ onClick }) => (
        <Tooltip {...siderTooltipProps} content={t('conversation.historySearch.tooltip')} position='right'>
          <div
            className={classNames(
              'shrink-0 h-36px flex items-center justify-start gap-10px px-12px rd-0.5rem cursor-pointer transition-colors hover:bg-[rgba(var(--primary-6),0.14)]',
              isMobile && 'sider-action-btn-mobile'
            )}
            onClick={onClick}
          >
            <Search
              theme='outline'
              size='20'
              fill={iconColors.primary}
              className='block leading-none shrink-0'
              style={{ lineHeight: 0 }}
            />
            <span className='collapsed-hidden text-t-primary text-13px'>{t('conversation.historySearch.tooltip')}</span>
          </div>
        </Tooltip>
      )}
    />
  );
};

export default SiderSearchEntry;
