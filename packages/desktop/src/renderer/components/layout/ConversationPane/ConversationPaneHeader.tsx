/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tooltip } from '@arco-design/web-react';
import { Close, ListCheckbox, Plus, Search } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

import ConversationSearchPopover from '@/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';
import styles from './ConversationPane.module.css';

interface ConversationPaneHeaderProps {
  isBatchMode: boolean;
  onToggleBatchMode: () => void;
  onNewChat: () => void;
  onClose: () => void;
  onSessionClick?: () => void;
}

const ConversationPaneHeader: React.FC<ConversationPaneHeaderProps> = ({
  isBatchMode,
  onToggleBatchMode,
  onNewChat,
  onClose,
  onSessionClick,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.header}>
      <h3 className={styles.title}>
        {t('sider.modeConversations', { defaultValue: 'Conversations' })}
      </h3>
      <div className={styles.actions}>
        <Tooltip content={t('conversation.welcome.newConversation', { defaultValue: 'New conversation' })} position='bottom'>
          <button
            type='button'
            className={styles.actionBtn}
            onClick={onNewChat}
            aria-label={t('conversation.welcome.newConversation', { defaultValue: 'New conversation' })}
          >
            <Plus theme='outline' size={14} fill='currentColor' />
          </button>
        </Tooltip>
        <ConversationSearchPopover
          onSessionClick={onSessionClick}
          renderTrigger={({ onClick, isActive }) => (
            <Tooltip content={t('conversation.historySearch.tooltip', { defaultValue: 'Search conversations' })} position='bottom'>
              <button
                type='button'
                className={classNames(styles.actionBtn, { [styles.actionBtnActive]: isActive })}
                onClick={onClick}
                aria-label={t('conversation.historySearch.tooltip', { defaultValue: 'Search conversations' })}
              >
                <Search theme='outline' size={14} fill='currentColor' />
              </button>
            </Tooltip>
          )}
        />
        <Tooltip
          content={isBatchMode
            ? t('conversation.history.batchModeExit', { defaultValue: 'Exit batch mode' })
            : t('conversation.history.batchManage', { defaultValue: 'Batch manage' })}
          position='bottom'
        >
          <button
            type='button'
            className={classNames(styles.actionBtn, { [styles.actionBtnActive]: isBatchMode })}
            onClick={onToggleBatchMode}
            aria-label={isBatchMode
              ? t('conversation.history.batchModeExit', { defaultValue: 'Exit batch mode' })
              : t('conversation.history.batchManage', { defaultValue: 'Batch manage' })}
            aria-pressed={isBatchMode}
          >
            <ListCheckbox theme='outline' size={14} fill='currentColor' />
          </button>
        </Tooltip>
        <Tooltip content={t('common.collapse', { defaultValue: 'Collapse pane' })} position='bottom'>
          <button
            type='button'
            className={styles.actionBtn}
            onClick={onClose}
            aria-label={t('common.collapse', { defaultValue: 'Collapse pane' })}
          >
            <Close theme='outline' size={14} fill='currentColor' />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default ConversationPaneHeader;
