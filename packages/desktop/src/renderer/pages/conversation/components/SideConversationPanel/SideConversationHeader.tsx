/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tooltip } from '@arco-design/web-react';
import { ReduceOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import SideConversationTabBar from './SideConversationTabBar';
import type { SideTab } from './useSideConversation';
import styles from './SideConversationDock.module.css';

type Props = {
  tabs: SideTab[];
  activeTabId?: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onCollapse: () => void;
  /** Keep the active side thread as a normal conversation in history. */
  onPromote: () => void;
};

const SideConversationHeader: React.FC<Props> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onCollapse,
  onPromote,
}) => {
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.headerTitleGroup}>
          <span className={styles.title}>{t('conversation.sideConversation.title')}</span>
        </div>
        <div className={styles.headerActions}>
          <Tooltip content={t('conversation.sideConversation.promoteHint')} mini>
            <Button size='mini' type='text' onClick={onPromote}>
              {t('conversation.sideConversation.promote')}
            </Button>
          </Tooltip>
          <Button
            size='mini'
            type='text'
            icon={<ReduceOne theme='outline' size={14} />}
            onClick={onCollapse}
            aria-label={t('conversation.sideConversation.close')}
          >
            {t('conversation.sideConversation.close')}
          </Button>
        </div>
      </div>
      <div className={styles.headerTabs}>
        <SideConversationTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={onSelectTab}
          onCloseTab={onCloseTab}
          onNewTab={onNewTab}
        />
      </div>
    </header>
  );
};

export default SideConversationHeader;
