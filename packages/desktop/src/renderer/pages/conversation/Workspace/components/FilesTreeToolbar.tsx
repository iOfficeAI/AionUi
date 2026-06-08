/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { FullScreen, Refresh, CheckOne, Help } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React from 'react';
import { WorkspaceToolbarActionBtn } from './WorkspaceToolbarActionBtn';
import type { WorkspaceTab } from '../types';

type FilesTreeToolbarProps = {
  t: TFunction;
  label: string;
  loading: boolean;
  onRefresh: () => void;
  onExpandFlyout?: () => void;
  activeTab?: WorkspaceTab;
  onTabChange?: (tab: WorkspaceTab) => void;
  hasTodos?: boolean;
  todoPendingCount?: number;
  hasApprovals?: boolean;
  approvalPendingCount?: number;
};

/** Matches GitChangeList top toolbar (summary + expand + refresh). */
const FilesTreeToolbar: React.FC<FilesTreeToolbarProps> = ({
  t,
  label,
  loading,
  onRefresh,
  onExpandFlyout,
  activeTab,
  onTabChange,
  hasTodos,
  todoPendingCount,
  hasApprovals,
  approvalPendingCount,
}) => (
  <div className='px-8px py-4px border-b border-b-base flex items-center justify-between flex-shrink-0 bg-fill-2'>
    <div className='flex items-center gap-8px min-w-0 flex-1'>
      <span
        className={`text-12px truncate min-w-0 cursor-pointer ${
          activeTab === 'files' ? 'font-medium text-t-primary' : 'text-t-secondary hover:text-t-primary'
        }`}
        onClick={() => onTabChange?.('files')}
        title={label}
      >
        {label}
      </span>
      {hasTodos && (
        <span
          className={`flex items-center gap-4px px-6px py-2px rounded-4px text-11px cursor-pointer transition-colors ${
            activeTab === 'todos' ? 'bg-primary text-inverse' : 'bg-bg-1 text-t-tertiary hover:text-t-primary'
          }`}
          onClick={() => onTabChange?.('todos')}
        >
          <CheckOne size={12} />
          {todoPendingCount !== undefined && todoPendingCount > 0 ? todoPendingCount : ''}
        </span>
      )}
      {hasApprovals && (
        <span
          className={`flex items-center gap-4px px-6px py-2px rounded-4px text-11px cursor-pointer transition-colors ${
            activeTab === 'approvals' ? 'bg-warning text-inverse' : 'bg-warning-1 text-warning-6 hover:bg-warning-2'
          }`}
          onClick={() => onTabChange?.('approvals')}
        >
          <Help size={12} />
          {approvalPendingCount !== undefined && approvalPendingCount > 0 ? approvalPendingCount : ''}
        </span>
      )}
    </div>
    <div className='flex items-center gap-2px flex-shrink-0'>
      {onExpandFlyout ? (
        <WorkspaceToolbarActionBtn
          tooltip={t('conversation.workspace.files.expandFlyout')}
          icon={<FullScreen size={14} />}
          onClick={onExpandFlyout}
        />
      ) : null}
      <WorkspaceToolbarActionBtn
        tooltip={t('conversation.workspace.refresh')}
        icon={<Refresh size={14} className={loading ? 'animate-spin' : undefined} />}
        onClick={onRefresh}
        disabled={loading}
      />
    </div>
  </div>
);

export default FilesTreeToolbar;
