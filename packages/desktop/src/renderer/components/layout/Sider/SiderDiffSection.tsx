/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Visual scaffold for the diff section in the Sider workspace panel.
 *
 * This is a static placeholder — no diff parsing or rendering is wired.
 * It renders a header row and an Empty-style placeholder body to indicate
 * the upcoming diff view. Distinct from TerminalPanel/DiffPanel.tsx.
 */

import React from 'react';
import { Empty } from '@arco-design/web-react';
import { Code, GithubOne } from '@icon-park/react';

const SiderDiffSection: React.FC = () => {
  return (
    <div className='size-full flex flex-col min-h-0' role='region' aria-label='Diff' data-testid='sider-diff-section'>
      <div className='flex items-center gap-8px px-12px py-6px border-b border-[var(--border-base)] text-t-primary text-13px font-medium'>
        <GithubOne theme='outline' size={16} fill='currentColor' />
        <span>Diff</span>
      </div>
      <div className='flex-1 min-h-0 flex-center'>
        <Empty
          icon={<Code theme='outline' size={48} fill='var(--text-tertiary)' />}
          description={
            <div className='flex flex-col items-center gap-4px'>
              <span className='text-t-primary text-13px font-medium'>Diff view coming soon</span>
              <span className='text-t-tertiary text-12px'>No diff wired yet.</span>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default SiderDiffSection;
