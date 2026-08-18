/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setOffset((current) => (current + SIDE_QUICK_PROMPT_VISIBLE_COUNT) % SIDE_QUICK_PROMPT_KEYS.length);
    }, SIDE_QUICK_PROMPT_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const visibleKeys = useMemo(() => pickVisibleKeys(offset), [offset]);

  return (
    <div className={styles.container}>
      <div className={styles.row} role='group' aria-label={t('conversation.sideConversation.quickPrompts.label')}>
        {visibleKeys.map((key) => {
          const label = t(`conversation.sideConversation.quickPrompts.${key}`);
          return (
            <Button
              key={key}
              size='mini'
              type='secondary'
              className={styles.chip}
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
