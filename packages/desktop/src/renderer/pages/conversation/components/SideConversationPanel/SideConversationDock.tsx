/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import SideChildChat from './SideChildChat';
import SideQuickPrompts from './quickPrompts/SideQuickPrompts';
import styles from './SideConversationDock.module.css';

type Props = {
  /** Active side thread; undefined when no thread exists yet (empty hint). */
  childId?: string;
};

/**
 * Pure side-conversation content view hosted inside the native sidebar's
 * 侧边会话 tab — no title row, no tab strip, no collapse/promote chrome (the
 * ExplorerContainer tab + dropdown own all of that). Starts directly with the
 * child chat; quick prompts ride the composer rail.
 */
const SideConversationDock: React.FC<Props> = ({ childId }) => {
  const { t } = useTranslation();
  const { data: conversation } = useSWR(childId ? ['conversation', childId] : null, () =>
    ipcBridge.conversation.get.invoke({ id: childId as string })
  );

  const handleQuickPrompt = useCallback(
    (text: string) => {
      if (!childId) return;
      emitter.emit('sendbox.fill.scoped', { conversation_id: childId, text });
    },
    [childId]
  );

  if (!childId) {
    return (
      <div className='flex flex-1 items-center justify-center h-full px-16px'>
        <span className='text-13px text-t-3 text-center'>{t('conversation.sideConversation.noThreads')}</span>
      </div>
    );
  }

  const composerPrefix = (
    <div className={styles.composerRail}>
      <div className={styles.quickPromptsWrap}>
        <SideQuickPrompts onPick={handleQuickPrompt} />
      </div>
    </div>
  );

  return (
    <div className={styles.dock}>
      <div className={styles.body}>
        {conversation ? <SideChildChat conversation={conversation} composerPrefix={composerPrefix} /> : null}
      </div>
    </div>
  );
};

export default SideConversationDock;
