/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tag, Tooltip } from '@arco-design/web-react';
import { ReduceOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import SideConversationTabBar from './SideConversationTabBar';
import type { SideForkMode, SideTab } from './useSideConversation';
import styles from './SideConversationDock.module.css';

type Props = {
  tabs: SideTab[];
  activeTabId?: string;
  forkMode?: SideForkMode;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onCollapse: () => void;
};

const SideConversationHeader: React.FC<Props> = ({
  tabs,
  activeTabId,
  forkMode,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onCollapse,
}) => {
  const { t } = useTranslation();
  const forkTag = forkMode
    ? forkMode === 'agent_fork'
      ? { color: 'arcoblue' as const, label: t('conversation.sideConversation.forkModeAgent') }
      : { color: 'orange' as const, label: t('conversation.sideConversation.forkModeSnapshot') }
    : null;

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.headerTitleGroup}>
          <span className={styles.title}>{t('conversation.sideConversation.title')}</span>
          {forkTag ? (
            <Tooltip
              content={
                forkMode === 'text_snapshot' ? t('conversation.sideConversation.snapshotModeHint') : forkTag.label
              }
              mini
            >
              <Tag size='small' color={forkTag.color} className={styles.forkTag}>
                {forkTag.label}
              </Tag>
            </Tooltip>
          ) : null}
        </div>
        <div className={styles.headerActions}>
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
