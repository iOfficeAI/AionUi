/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { Close, Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SideTab } from './useSideConversation';
import styles from './SideConversationDock.module.css';

type Props = {
  tabs: SideTab[];
  activeTabId?: string;
  onSelect: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
};

const SideConversationTabBar: React.FC<Props> = ({ tabs, activeTabId, onSelect, onCloseTab, onNewTab }) => {
  const { t } = useTranslation();
  return (
    <div className={styles.tabBar}>
      {tabs.map((tab, index) => {
        const active = tab.childId === activeTabId;
        return (
          <div key={tab.childId} className={styles.tabItem}>
            <Button
              type='text'
              size='mini'
              className={active ? styles.tabActive : styles.tab}
              onClick={() => onSelect(tab.childId)}
            >
              <span className={styles.tabLabel}>
                {t('conversation.sideConversation.tabLabel', { index: index + 1 })}
              </span>
            </Button>
            <Button
              type='text'
              size='mini'
              className={styles.tabClose}
              icon={<Close theme='outline' size={12} />}
              aria-label={t('conversation.sideConversation.closeTab')}
              onClick={(event) => {
                event.stopPropagation();
                void onCloseTab(tab.childId);
              }}
            />
          </div>
        );
      })}
      <Button
        type='text'
        size='mini'
        className={styles.tabNew}
        icon={<Plus theme='outline' size={14} />}
        aria-label={t('conversation.sideConversation.newTab')}
        onClick={() => onNewTab()}
      />
    </div>
  );
};

export default SideConversationTabBar;
