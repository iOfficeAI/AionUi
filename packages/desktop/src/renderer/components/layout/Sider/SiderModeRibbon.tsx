/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import siderStyles from './Sider.module.css';

export type SiderMode = 'conversations' | 'settings';

interface SiderModeRibbonProps {
  mode: SiderMode;
  collapsed?: boolean;
  onBackToChat: () => void;
}

/**
 * Slim ribbon rendered at the top of the Sider above the mode-swapped menu.
 * Mode label distinguishes Conversations history from the Settings menu so
 * the route flip is unambiguous; the "Back to chat" affordance reuses the
 * existing route handler kept by the parent Sider via `lastNonSettingsPathRef`.
 *
 * The divider below the label is a 1:1 replica of the existing search-vs-
 * projects divider already used elsewhere in this Sider (same color, same
 * margins, same height) so the ribbon reads as part of the established
 * Sider language instead of a new visual invention.
 */
const SiderModeRibbon: React.FC<SiderModeRibbonProps> = ({ mode, collapsed = false, onBackToChat }) => {
  const { t } = useTranslation();

  if (mode !== 'settings') {
    return null;
  }

  const divider = (
    <div
      className={classNames('shrink-0 mt-4px mb-1px h-1px bg-[var(--color-border-2)]', collapsed ? 'mx-4px' : 'mx-6px')}
      aria-hidden='true'
    />
  );

  if (collapsed) {
    return <div className='sider-mode-ribbon sider-mode-ribbon--collapsed shrink-0'>{divider}</div>;
  }

  const label =
    mode === 'settings'
      ? t('common.settings', { defaultValue: 'Settings' })
      : t('sider.modeConversations', { defaultValue: 'Conversations' });

  return (
    <div className='sider-mode-ribbon shrink-0 mb-8px'>
      <div className='h-24px px-12px flex items-center gap-12px'>
        <span className='text-t-secondary text-xs uppercase tracking-wide font-[500] truncate'>{label}</span>
        {mode === 'settings' && (
          <button
            type='button'
            onClick={onBackToChat}
            className={classNames(
              siderStyles.modeBack,
              'ml-auto inline-flex items-center justify-center',
              'text-brand text-xs font-[500] cursor-pointer',
              'h-24px min-w-88px px-8px rounded-control bg-transparent border-0',
              'transition-colors hover:bg-fill-2'
            )}
          >
            <span aria-hidden='true' className='mr-4px'>
              ←
            </span>
            {t('common.back', { defaultValue: 'Back to Chat' })}
          </button>
        )}
      </div>
      {divider}
    </div>
  );
};

export default SiderModeRibbon;
