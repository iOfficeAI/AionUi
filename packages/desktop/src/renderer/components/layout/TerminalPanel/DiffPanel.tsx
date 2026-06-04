/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Static visual placeholder for the diff-focused layout mode.
 *
 * Per the layout-01 spec this is a stub — no real diff parsing or rendering
 * yet. It exists so the layout mode is observable end-to-end: when the user
 * picks "Diff Focused" from the titlebar selector the panel mounts in the
 * secondary slot, replacing the terminal, with a clear "coming soon"
 * affordance.
 */

import { Code, GithubOne } from '@icon-park/react';
import { Empty } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const DiffPanel: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div
      className='size-full flex flex-col bg-1 min-h-0'
      role='region'
      aria-label={t('terminal.layout.regionDiff', { defaultValue: 'Diff view' })}
      data-testid='diff-panel'
    >
      <div className='flex items-center gap-8px px-12px py-6px border-b border-[var(--border-base)] text-t-primary text-13px font-medium'>
        <GithubOne theme='outline' size={16} fill='currentColor' />
        <span>{t('terminal.layout.regionDiff', { defaultValue: 'Diff view' })}</span>
      </div>
      <div className='flex-1 min-h-0 flex-center'>
        <Empty
          icon={<Code theme='outline' size={48} fill='var(--text-tertiary)' />}
          description={
            <div className='flex flex-col items-center gap-4px'>
              <span className='text-t-primary text-13px font-medium'>
                {t('terminal.layout.diffPlaceholderTitle', { defaultValue: 'Diff view coming soon' })}
              </span>
              <span className='text-t-tertiary text-12px'>
                {t('terminal.layout.diffPlaceholderBody', {
                  defaultValue: 'Static placeholder — no diff parsing is wired in layout-01.',
                })}
              </span>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default DiffPanel;
