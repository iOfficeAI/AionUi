/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Info } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './NotesHint.module.css';

const NotesHint: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className={styles.hint}>
      <Info size={12} theme='outline' fill='currentColor' />
      <span>{t('settings.notesHint')}</span>
    </div>
  );
};

export default NotesHint;
