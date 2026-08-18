/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import {
  Aiming,
  Attention,
  Caution,
  CheckCorrect,
  Comment,
  Copy,
  DocSearch,
  ErrorPrompt,
  Exchange,
  FileText,
  Helpcenter,
  Light,
  MindmapList,
  Refresh,
  Shield,
  SortAmountUp,
  Success,
  Table,
  Target,
  User,
} from '@icon-park/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SIDE_QUICK_PROMPT_KEYS,
  SIDE_QUICK_PROMPT_ROTATE_MS,
  SIDE_QUICK_PROMPT_VISIBLE_COUNT,
  type SideQuickPromptKey,
} from './sideQuickPromptKeys';
import styles from './SideQuickPrompts.module.css';

type Props = {
  onPick: (text: string) => void;
};

/**
 * Per-prompt category icon. The visible label already carries the meaning, so
 * icons are decorative (`aria-hidden`) — they exist to make the rotating set
 * scannable at a glance.
 */
const PROMPT_ICONS: Record<SideQuickPromptKey, React.ReactNode> = {
  catchMeUp: <Refresh />,
  changedFiles: <FileText />,
  inPlainTerms: <Helpcenter />,
  explainSelection: <DocSearch />,
  explainError: <ErrorPrompt />,
  safeToContinue: <Shield />,
  confidenceLevel: <Target />,
  didIForget: <Attention />,
  stillWorks: <Success />,
  isOffTrack: <Aiming />,
  existingSolution: <Copy />,
  whichIsBetter: <Exchange />,
  whyThisApproach: <MindmapList />,
  moreIdeas: <Light />,
  yourWay: <User />,
  useTable: <Table />,
  stepByStep: <SortAmountUp />,
  howToVerify: <CheckCorrect />,
  worstCase: <Caution />,
  explainToOthers: <Comment />,
};

function pickVisibleKeys(offset: number): SideQuickPromptKey[] {
  const keys: SideQuickPromptKey[] = [];
  for (let i = 0; i < SIDE_QUICK_PROMPT_VISIBLE_COUNT; i += 1) {
    keys.push(SIDE_QUICK_PROMPT_KEYS[(offset + i) % SIDE_QUICK_PROMPT_KEYS.length]);
  }
  return keys;
}

const SideQuickPrompts: React.FC<Props> = ({ onPick }) => {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  // Pause the rotation while the user is reading or aiming at the chips, so
  // the visible window is never yanked away mid-interaction.
  const pausedRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (pausedRef.current) return;
      setOffset((current) => (current + SIDE_QUICK_PROMPT_VISIBLE_COUNT) % SIDE_QUICK_PROMPT_KEYS.length);
    }, SIDE_QUICK_PROMPT_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const visibleKeys = useMemo(() => pickVisibleKeys(offset), [offset]);

  return (
    <div
      className={styles.container}
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
      onFocus={() => {
        pausedRef.current = true;
      }}
      onBlur={() => {
        pausedRef.current = false;
      }}
    >
      {/* key on the row remounts the chips on rotation so the entrance animation plays. */}
      <div
        key={offset}
        className={styles.row}
        role='group'
        aria-label={t('conversation.sideConversation.quickPrompts.label')}
      >
        {visibleKeys.map((key, index) => {
          const label = t(`conversation.sideConversation.quickPrompts.${key}`);
          return (
            <Button
              key={key}
              size='mini'
              type='secondary'
              className={styles.chip}
              style={{ animationDelay: `${index * 40}ms` }}
              title={label}
              onClick={() => onPick(label)}
            >
              <span className={styles.chipIcon} aria-hidden='true'>
                {PROMPT_ICONS[key]}
              </span>
              <span className={styles.chipText}>{label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};

export default SideQuickPrompts;
