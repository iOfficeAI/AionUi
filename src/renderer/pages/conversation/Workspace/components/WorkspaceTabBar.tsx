/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge, Tabs } from '@arco-design/web-react';
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

  const branchTag = branch ? (
    <span className='flex items-center gap-4px text-12px text-t-tertiary mr-8px'>
      <BranchOne size={14} />
      <span className='max-w-120px overflow-hidden text-ellipsis whitespace-nowrap'>{branch}</span>
    </span>
  ) : null;

  return (
    <Tabs
      activeTab={activeTab}
      onChange={(key) => onTabChange(key as WorkspaceTab)}
      type='line'
      size='small'
      className='px-12px [&_.arco-tabs-nav]:border-b-0'
      extra={branchTag}
    >
      <Tabs.TabPane key='files' title={t('conversation.workspace.changes.filesTab')} />
      <Tabs.TabPane key='changes' title={changesTitle} />
    </Tabs>
  );
};

export default WorkspaceTabBar;
