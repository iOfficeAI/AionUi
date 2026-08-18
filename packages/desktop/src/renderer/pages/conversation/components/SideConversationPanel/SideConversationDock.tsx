/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import React, { useCallback } from 'react';
import useSWR from 'swr';
import SideChildChat from './SideChildChat';
import SideConversationHeader from './SideConversationHeader';
import SideQuickPrompts from './SideQuickPrompts';
import type { SideTab } from './useSideConversation';
import styles from './SideConversationDock.module.css';

type Props = {
  childId: string;
  tabs: SideTab[];
  activeTabId?: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onCollapse: () => void;
  onPromote: () => void;
};

const SideConversationDock: React.FC<Props> = ({
  childId,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onCollapse,
  onPromote,
}) => {
  const { data: conversation } = useSWR(['conversation', childId], () =>
    ipcBridge.conversation.get.invoke({ id: childId })
  );

  const handleQuickPrompt = useCallback(
    (text: string) => {
      emitter.emit('sendbox.fill.scoped', { conversation_id: childId, text });
    },
    [childId]
  );

  const composerPrefix = (
    <div className={styles.composerRail}>
      <div className={styles.quickPromptsWrap}>
        <SideQuickPrompts onPick={handleQuickPrompt} />
      </div>
    </div>
  );

  return (
    <div className={styles.dock}>
      <SideConversationHeader
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onNewTab={onNewTab}
        onCollapse={onCollapse}
        onPromote={onPromote}
      />
      <div className={styles.body}>
        {conversation ? <SideChildChat conversation={conversation} composerPrefix={composerPrefix} /> : null}
      </div>
    </div>
  );
};

export default SideConversationDock;
