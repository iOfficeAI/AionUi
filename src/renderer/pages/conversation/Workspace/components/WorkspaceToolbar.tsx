/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Dropdown, Input, Menu, Tooltip } from '@arco-design/web-react';
import { Down, Plus, Refresh, Search } from '@icon-park/react';
import React, { useId } from 'react';
import UploadProgressBar from '@/renderer/components/media/UploadProgressBar';
import type { TFunction } from 'i18next';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';

type WorkspaceToolbarProps = {
  t: TFunction;
  isWorkspaceCollapsed: boolean;
  setIsWorkspaceCollapsed: (v: boolean) => void;
  isTemporaryWorkspace: boolean;
  workspaceDisplayName: string;
  // Search
  showSearch: boolean;
  searchText: string;
  setSearchText: (v: string) => void;
  onSearch: (v: string) => void;
  toggleSearch: () => void;
  searchInputRef: React.RefObject<RefInputType | null>;
  // Tree state
  loading: boolean;
  refreshWorkspace: () => void;
  // Upload
  handleSelectHostFiles: () => void;
  handleUploadDeviceFiles: () => void;
  setShowHostFileSelector: (v: boolean) => void;
  // Migration
  handleOpenMigrationModal: () => void;
  handleOpenWorkspaceRoot: () => Promise<void>;
};

/** SVG icon for the "change workspace" action button. */
const ChangeWorkspaceIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({ className, ...rest }) => {
  const clipPathId = useId();
  return (
    <svg className={className} viewBox='0 0 24 24' role='img' aria-hidden='true' focusable='false' {...rest}>
      <rect width='24' height='24' rx='2' fill='var(--workspace-btn-bg, var(--color-bg-1))' />
      <g clipPath={`url(#${clipPathId})`}>
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M10.8215 8.66602L9.15482 6.99935H5.33333V16.9993H18.6667V8.66602H10.8215ZM4.5 6.99935C4.5 6.53912 4.8731 6.16602 5.33333 6.16602H9.15482C9.37583 6.16602 9.5878 6.25382 9.74407 6.41009L11.1667 7.83268H18.6667C19.1269 7.83268 19.5 8.20578 19.5 8.66602V16.9993C19.5 17.4596 19.1269 17.8327 18.6667 17.8327H5.33333C4.8731 17.8327 4.5 17.4596 4.5 16.9993V6.99935Z'
          fill='var(--color-text-3, var(--text-secondary))'
        />
        <path
          d='M13.0775 12.4158L12.1221 11.4603L12.7113 10.8711L14.6726 12.8324L12.7113 14.7937L12.1221 14.2044L13.0774 13.2491H9.5V12.4158H13.0775Z'
          fill='var(--color-text-3, var(--text-secondary))'
        />
      </g>
      <defs>
        <clipPath id={clipPathId}>
          <rect width='20' height='20' fill='transparent' transform='translate(2 2)' />
        </clipPath>
      </defs>
    </svg>
  );
};

/** Toolbar area: workspace name, search toggle, refresh button, upload menu, settings. */
const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
  t,
  isWorkspaceCollapsed,
  setIsWorkspaceCollapsed,
  isTemporaryWorkspace,
  workspaceDisplayName,
  showSearch,
  searchText,
  setSearchText,
  onSearch,
  toggleSearch,
  searchInputRef,
  loading,
  refreshWorkspace,
  handleSelectHostFiles,
  handleUploadDeviceFiles,
  setShowHostFileSelector,
  handleOpenMigrationModal,
  handleOpenWorkspaceRoot,
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
      <Menu.Item key='host'>{t('common.fileAttach.hostFiles')}</Menu.Item>
      <Menu.Item key='device'>{t('common.fileAttach.myDevice')}</Menu.Item>
    </Menu>
  );

  return (
    <div className='px-12px'>
      {/* Search Input */}
      {(showSearch || searchText) && (
        <div className='pb-8px workspace-toolbar-search'>
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
          {isTemporaryWorkspace ? (
            <Tooltip content={t('conversation.workspace.contextMenu.openLocation')}>
              <span
                role='button'
                tabIndex={0}
                className='workspace-title-label font-bold text-14px text-t-primary overflow-hidden text-ellipsis whitespace-nowrap transition-colors hover:text-[rgb(var(--primary-6))] hover:underline underline-offset-3'
                onClick={(event) => {
                  event.stopPropagation();
                  void handleOpenWorkspaceRoot();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleOpenWorkspaceRoot();
                  }
                }}
              >
                {workspaceDisplayName}
              </span>
            </Tooltip>
          ) : (
            <span className='workspace-title-label font-bold text-14px text-t-primary overflow-hidden text-ellipsis whitespace-nowrap'>
              {workspaceDisplayName}
            </span>
          )}
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
          <Tooltip content={t('conversation.workspace.searchPlaceholder')}>
            <span>
              <Search
                className='workspace-toolbar-icon-btn lh-[1] flex cursor-pointer'
                theme='outline'
                size='16'
                fill={showSearch || searchText ? iconColors.primary : iconColors.secondary}
                onClick={toggleSearch}
              />
            </span>
          </Tooltip>
          {isTemporaryWorkspace && (
            <Tooltip content={t('conversation.workspace.changeWorkspace')}>
              <span>
                <ChangeWorkspaceIcon
                  className='workspace-toolbar-icon-btn line-height-0 cursor-pointer w-24px h-24px flex-shrink-0'
                  onClick={handleOpenMigrationModal}
                />
              </span>
            </Tooltip>
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
