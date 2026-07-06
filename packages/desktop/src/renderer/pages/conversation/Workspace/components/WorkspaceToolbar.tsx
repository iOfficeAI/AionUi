/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Dropdown, Input, Menu, Radio, Tooltip } from '@arco-design/web-react';
import { Down, Plus, Refresh, Search } from '@icon-park/react';
import React from 'react';
import UploadProgressBar from '@/renderer/components/media/UploadProgressBar';
import type { TFunction } from 'i18next';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import type { WorkspaceSearchScope } from '../hooks/useWorkspaceSearch';
import type { WorkspaceSearchMode } from '../hooks/useWorkspaceTree';

type WorkspaceToolbarProps = {
  t: TFunction;
  isWorkspaceCollapsed: boolean;
  setIsWorkspaceCollapsed: (v: boolean) => void;
  workspaceDisplayName: string;
  // Search
  showSearch: boolean;
  searchText: string;
  setSearchText: (v: string) => void;
  onSearch: (v: string) => void;
  searchInputRef: React.RefObject<RefInputType | null>;
  searchScope: WorkspaceSearchScope;
  setSearchScope: (v: WorkspaceSearchScope) => void;
  searchMode: WorkspaceSearchMode;
  setSearchMode: (v: WorkspaceSearchMode) => void;
  currentFolderLabel: string;
  // Tree state
  loading: boolean;
  refreshWorkspace: () => void;
  // Upload
  handleSelectHostFiles: () => void;
  handleUploadDeviceFiles: () => void;
  setShowHostFileSelector: (v: boolean) => void;
};

/** Toolbar area: workspace name, search toggle, refresh button, upload menu, settings. */
const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
  t,
  isWorkspaceCollapsed,
  setIsWorkspaceCollapsed,
  workspaceDisplayName,
  showSearch,
  searchText,
  setSearchText,
  onSearch,
  searchInputRef,
  searchScope,
  setSearchScope,
  searchMode,
  setSearchMode,
  currentFolderLabel,
  loading,
  refreshWorkspace,
  handleSelectHostFiles,
  handleUploadDeviceFiles,
  setShowHostFileSelector,
}) => {
  const workspaceUploadMenu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'host') {
          if (isElectronDesktop()) {
            handleSelectHostFiles();
          } else {
            setShowHostFileSelector(true);
          }
        }
        if (key === 'device') {
          handleUploadDeviceFiles();
        }
      }}
    >
      <Menu.Item key='host'>{t('common.fileAttach.addFiles')}</Menu.Item>
      <Menu.Item key='device'>{t('common.fileAttach.myDevice')}</Menu.Item>
    </Menu>
  );

  return (
    <div className='px-12px'>
      {/* Search Input */}
      {(showSearch || searchText) && (
        <div className='py-8px workspace-toolbar-search'>
          <Input
            className='w-full workspace-search-input'
            ref={searchInputRef}
            placeholder={t('conversation.workspace.searchPlaceholder')}
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              onSearch(value);
            }}
            allowClear
            prefix={<Search theme='outline' size='14' fill={iconColors.primary} />}
          />
          <div className='workspace-search-controls mt-6px'>
            <Radio.Group
              className='workspace-search-segment'
              size='mini'
              type='button'
              value={searchScope}
              onChange={(value) => setSearchScope(value as WorkspaceSearchScope)}
            >
              <Radio value='workspace'>{t('conversation.workspace.searchScope.workspace')}</Radio>
              <Radio value='currentFolder'>
                {t('conversation.workspace.searchScope.currentFolder', { folder: currentFolderLabel })}
              </Radio>
            </Radio.Group>
            <Radio.Group
              className='workspace-search-segment'
              size='mini'
              type='button'
              value={searchMode}
              onChange={(value) => setSearchMode(value as WorkspaceSearchMode)}
            >
              <Radio value='all'>{t('conversation.workspace.searchMode.all')}</Radio>
              <Radio value='name'>{t('conversation.workspace.searchMode.name')}</Radio>
              <Radio value='content'>{t('conversation.workspace.searchMode.content')}</Radio>
            </Radio.Group>
          </div>
        </div>
      )}

      {/* Border divider below search */}
      {!isWorkspaceCollapsed && (showSearch || searchText) && <div className='border-b border-b-base' />}

      {/* Directory name with collapse and action icons */}
      <div className='workspace-toolbar-row flex items-center justify-between gap-8px'>
        <div
          className='flex items-center gap-8px cursor-pointer flex-1 min-w-0'
          onClick={() => setIsWorkspaceCollapsed(!isWorkspaceCollapsed)}
        >
          <Down
            size={16}
            fill={iconColors.primary}
            className={`line-height-0 transition-transform duration-200 flex-shrink-0 ${isWorkspaceCollapsed ? '-rotate-90' : 'rotate-0'}`}
          />
          <span className='workspace-title-label font-bold text-14px text-t-primary overflow-hidden text-ellipsis whitespace-nowrap'>
            {workspaceDisplayName}
          </span>
        </div>
        <div className='workspace-toolbar-actions flex items-center gap-8px flex-shrink-0'>
          {!isElectronDesktop() && (
            <Dropdown droplist={workspaceUploadMenu} trigger='click' position='bl'>
              <span>
                <Plus
                  className='workspace-toolbar-icon-btn lh-[1] flex cursor-pointer'
                  theme='outline'
                  size='16'
                  fill={iconColors.secondary}
                />
              </span>
            </Dropdown>
          )}
          <Tooltip content={t('conversation.workspace.refresh')}>
            <span>
              <Refresh
                className={
                  loading
                    ? 'workspace-toolbar-icon-btn loading lh-[1] flex cursor-pointer'
                    : 'workspace-toolbar-icon-btn flex cursor-pointer'
                }
                theme='outline'
                size='16'
                fill={iconColors.secondary}
                onClick={() => refreshWorkspace()}
              />
            </span>
          </Tooltip>
        </div>
      </div>
      <UploadProgressBar source='workspace' />
    </div>
  );
};

export default WorkspaceToolbar;
