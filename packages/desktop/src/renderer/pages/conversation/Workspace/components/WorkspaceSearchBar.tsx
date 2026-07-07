/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { Input, Radio } from '@arco-design/web-react';
import { Search } from '@icon-park/react';
import React from 'react';
import type { TFunction } from 'i18next';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import type { WorkspaceSearchScope, WorkspaceSearchStats } from '../hooks/useWorkspaceSearch';
import type { WorkspaceSearchMode } from '../hooks/useWorkspaceTree';

type WorkspaceSearchBarProps = {
  t: TFunction;
  isMobile: boolean;
  showSearch: boolean;
  searchText: string;
  setSearchText: (v: string) => void;
  onSearch: (v: string) => void;
  searchInputRef: React.RefObject<RefInputType | null>;
  searchScope: WorkspaceSearchScope;
  setSearchScope: (v: WorkspaceSearchScope) => void;
  searchFolderLabel: string;
  searchStats: WorkspaceSearchStats | null;
  searchMode: WorkspaceSearchMode;
  setSearchMode: (v: WorkspaceSearchMode) => void;
};

const WorkspaceSearchBar: React.FC<WorkspaceSearchBarProps> = ({
  t,
  isMobile,
  showSearch,
  searchText,
  setSearchText,
  onSearch,
  searchInputRef,
  searchScope,
  setSearchScope,
  searchFolderLabel,
  searchStats,
  searchMode,
  setSearchMode,
}) => {
  if (!showSearch && !searchText) return null;

  const hasSearchStats = Boolean(searchText.trim() && searchStats);

  return (
    <div className='px-12px'>
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
            <Radio value='currentFolder'>{t('conversation.workspace.searchScope.currentFolder')}</Radio>
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
          <div className='workspace-search-meta'>
            {searchScope === 'currentFolder' &&
              (searchFolderLabel ? (
                <span className='workspace-search-folder-name'>
                  {t('conversation.workspace.searchScope.selectedFolder', { folder: searchFolderLabel })}
                </span>
              ) : (
                <span>
                  {t(
                    isMobile
                      ? 'conversation.workspace.searchScope.folderHintMobile'
                      : 'conversation.workspace.searchScope.folderHintDesktop'
                  )}
                </span>
              ))}
            {hasSearchStats && (
              <span className='workspace-search-stats'>
                {t('conversation.workspace.searchStats', {
                  fileCount: searchStats?.fileCount ?? 0,
                  contentBlockCount: searchStats?.contentBlockCount ?? 0,
                })}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className='border-b border-b-base' />
    </div>
  );
};

export default WorkspaceSearchBar;
