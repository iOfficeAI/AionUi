/**
 * @license
 * Copyright 2025 AICore (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Magic, Close } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

const LS_KEY = 'welcomeBannerDismissed';

const WelcomeBanner: React.FC<{ visible: boolean }> = ({ visible }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(LS_KEY, 'true');
    } catch { /* noop */ }
  }, []);

  if (!visible || dismissed) return null;

  return (
    <div className={styles.welcomeBanner}>
      <button
        type="button"
        className={styles.welcomeBannerClose}
        onClick={handleDismiss}
        aria-label={t('common.close', { defaultValue: 'Close' })}
      >
        <Close theme="outline" size={14} fill="currentColor" />
      </button>

      <div className={styles.welcomeBannerInner}>
        <div className={styles.welcomeBannerHeader}>
          <Magic theme="filled" size={18} fill="var(--color-text-0)" />
          <span className={styles.welcomeBannerTitle}>
            企业级AI 研发平台<span className={styles.welcomeBannerEmoji}>✨</span>
          </span>
        </div>

        <div className={styles.welcomeBannerItems}>
          <span className={styles.welcomeBannerItem}>
            <span className={styles.welcomeBannerItemBadge}>🎉</span>
            Skills 技能觉醒
          </span>
          <span className={styles.welcomeBannerItem}>
            国内顶尖大模型
          </span>
          <span className={styles.welcomeBannerItem}>
            <span className={styles.welcomeBannerItemBadge}>🔒</span>
            企业级安全保障
          </span>
        </div>
      </div>
    </div>
  );
};

export default WelcomeBanner;
