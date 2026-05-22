/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge, Dropdown, Tabs } from '@arco-design/web-react';
import { BranchOne } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React from 'react';
import type { WorkspaceTab } from '../types';

type WorkspaceTabBarProps = {
  t: TFunction;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  changeCount: number;
  branch: string | null;
};

const WorkspaceTabBar: React.FC<WorkspaceTabBarProps> = ({ t, activeTab, onTabChange, changeCount, branch }) => {
  const changesTitle = (
    <span className='flex items-center gap-4px'>
      {t('conversation.workspace.changes.tab')}
      {changeCount > 0 && <Badge count={changeCount} maxCount={99} style={{ fontSize: '11px' }} />}
    </span>
  );

  const branchIcon = (
    <span className='flex items-center text-t-tertiary mx-8px hover:text-t-secondary transition-colors cursor-pointer'>
      <BranchOne size={14} className='shrink-0' />
    </span>
  );

  // Branches are read-only (no checkout support yet) — clicking the icon
  // surfaces just the current branch name instead of an unactionable list.
  const branchDropdown = branch ? (
    <Dropdown
      trigger='click'
      position='bl'
      droplist={
        <div
          className='rounded-6px px-12px py-8px shadow-lg text-12px text-t-primary'
          style={{
            maxWidth: 320,
            background: 'var(--color-bg-popup)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className='text-t-tertiary mb-2px'>{t('conversation.workspace.changes.currentBranchLabel')}</div>
          <div className='font-medium break-all'>{branch}</div>
        </div>
      }
    >
      {branchIcon}
    </Dropdown>
  ) : null;

  return (
    <Tabs
      activeTab={activeTab}
      onChange={(key) => onTabChange(key as WorkspaceTab)}
      type='line'
      size='small'
      className='px-12px [&_.arco-tabs-nav]:border-b-0'
      extra={branchDropdown}
    >
      <Tabs.TabPane key='files' title={t('conversation.workspace.changes.filesTab')} />
      <Tabs.TabPane key='changes' title={changesTitle} />
    </Tabs>
  );
};

export default WorkspaceTabBar;
