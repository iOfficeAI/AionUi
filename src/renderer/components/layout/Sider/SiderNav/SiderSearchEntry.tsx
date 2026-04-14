/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tooltip } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
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
            buttonClassName='!w-full !h-40px !py-0 !px-0 !justify-center !rd-8px !hover:bg-fill-3 !active:bg-fill-4'
          />
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip {...siderTooltipProps} content={t('conversation.historySearch.tooltip')} position='right'>
      <div className='w-full'>
        <ConversationSearchPopover
          onSessionClick={onSessionClick}
          onConversationSelect={onConversationSelect}
          label={t('conversation.historySearch.shortTitle')}
          fullWidth
          buttonClassName={classNames(isMobile && 'sider-action-btn-mobile')}
        />
      </div>
    </Tooltip>
  );
};

export default SiderSearchEntry;
