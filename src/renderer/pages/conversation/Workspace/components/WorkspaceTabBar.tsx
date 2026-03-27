/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge } from '@arco-design/web-react';
import type { TFunction } from 'i18next';
import React from 'react';
import type { WorkspaceTab } from '../types';

type WorkspaceTabBarProps = {
  t: TFunction;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  changeCount: number;
};

const WorkspaceTabBar: React.FC<WorkspaceTabBarProps> = ({ t, activeTab, onTabChange, changeCount }) => {
  return (
    <div className='flex border-b border-b-base px-12px'>
      <button
        type='button'
        className={`px-16px py-8px text-13px border-b-2 bg-transparent cursor-pointer ${
          activeTab === 'files'
            ? 'font-semibold text-[rgb(var(--primary-6))] border-b-[rgb(var(--primary-6))]'
            : 'text-t-secondary border-b-transparent hover:text-t-primary'
        }`}
        onClick={() => onTabChange('files')}
      >
        {t('conversation.workspace.changes.filesTab')}
      </button>
      <button
        type='button'
        className={`px-16px py-8px text-13px border-b-2 bg-transparent cursor-pointer flex items-center gap-4px ${
          activeTab === 'changes'
            ? 'font-semibold text-[rgb(var(--primary-6))] border-b-[rgb(var(--primary-6))]'
            : 'text-t-secondary border-b-transparent hover:text-t-primary'
        }`}
        onClick={() => onTabChange('changes')}
      >
        {t('conversation.workspace.changes.tab')}
        {changeCount > 0 && (
          <Badge
            count={changeCount}
            maxCount={99}
            style={{ fontSize: '11px' }}
          />
        )}
      </button>
    </div>
  );
};

export default WorkspaceTabBar;
