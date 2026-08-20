/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
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
              type='outline'
              className={styles.chip}
              style={{ animationDelay: `${index * 40}ms` }}
              title={label}
              onClick={() => onPick(label)}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
};

export default SideQuickPrompts;
