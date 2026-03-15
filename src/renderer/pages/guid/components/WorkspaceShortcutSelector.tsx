/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import SearchableSelectorPanel, { type SearchableSelectorSection } from '@/renderer/components/base/SearchableSelectorPanel';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { useRecentWorkspaces } from '@/renderer/hooks/useRecentWorkspaces';
import { iconColors } from '@/renderer/theme/colors';
import { normalizeWorkspacePath } from '@/renderer/utils/recentWorkspaces';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace';
import { Button, Popover, Tooltip } from '@arco-design/web-react';
import { Down, FolderOpen } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

export type WorkspaceSelectorPopoverProps = {
  workspacePath: string;
  onSelectWorkspace: (workspacePath: string) => void;
  onPickWorkspace: () => void;
  children: (props: { visible: boolean; workspaceLabel: string; workspaceTooltip: string }) => React.ReactElement;
};

export type WorkspaceShortcutSelectorProps = {
  workspacePath: string;
  onSelectWorkspace: (workspacePath: string) => void;
  onPickWorkspace: () => void;
  className?: string;
};

export const WorkspaceSelectorPopover: React.FC<WorkspaceSelectorPopoverProps> = ({ workspacePath, onSelectWorkspace, onPickWorkspace, children }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const { workspaces, refresh } = useRecentWorkspaces();

  const normalizedCurrentWorkspace = useMemo(() => normalizeWorkspacePath(workspacePath).toLowerCase(), [workspacePath]);

  const orderedWorkspaces = useMemo(() => {
    return [...workspaces].sort((left, right) => {
      const leftIsCurrent = normalizeWorkspacePath(left.path).toLowerCase() === normalizedCurrentWorkspace;
      const rightIsCurrent = normalizeWorkspacePath(right.path).toLowerCase() === normalizedCurrentWorkspace;

      if (leftIsCurrent !== rightIsCurrent) {
        return leftIsCurrent ? -1 : 1;
      }

      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }

      return left.label.localeCompare(right.label);
    });
  }, [normalizedCurrentWorkspace, workspaces]);

  const closeSelector = useCallback(() => {
    setVisible(false);
    setQuery('');
  }, []);

  const handleOpenFolder = useCallback(() => {
    closeSelector();
    onPickWorkspace();
  }, [closeSelector, onPickWorkspace]);

  const handleSelectWorkspace = useCallback(
    (nextWorkspacePath: string) => {
      onSelectWorkspace(nextWorkspacePath);
      closeSelector();
    },
    [closeSelector, onSelectWorkspace]
  );

  const handleVisibleChange = useCallback(
    (nextVisible: boolean) => {
      setVisible(nextVisible);
      if (nextVisible) {
        void refresh();
      } else {
        setQuery('');
      }
    },
    [refresh]
  );

  const workspaceButtonLabel = workspacePath ? getWorkspaceDisplayName(workspacePath) : t('conversation.welcome.specifyWorkspace');
  const workspaceButtonTooltip = workspacePath ? `${t('conversation.welcome.currentWorkspace')}: ${workspacePath}` : t('conversation.workspace.changeWorkspace');

  const sections = useMemo<SearchableSelectorSection[]>(() => {
    const nextSections: SearchableSelectorSection[] = [
      {
        key: 'actions',
        title: t('conversation.workspaceSelector.actionsTitle', { defaultValue: '从空文件夹开始' }),
        items: [
          {
            key: 'open-folder',
            label: t('conversation.workspaceSelector.openFolder', { defaultValue: '打开新文件夹' }),
            icon: <FolderOpen theme='outline' size='16' fill={iconColors.secondary} />,
            keywords: [t('conversation.welcome.openFolder'), t('conversation.welcome.specifyWorkspace')],
            onSelect: handleOpenFolder,
          },
        ],
      },
    ];

    if (orderedWorkspaces.length > 0) {
      nextSections.push({
        key: 'recent',
        title: t('conversation.workspaceSelector.recentTitle', { defaultValue: '最近使用' }),
        items: orderedWorkspaces.map((workspace) => ({
          key: workspace.path,
          label: workspace.label,
          description: workspace.path,
          icon: <FolderOpen theme='outline' size='16' fill={iconColors.secondary} />,
          keywords: [workspace.path],
          active: normalizeWorkspacePath(workspace.path).toLowerCase() === normalizedCurrentWorkspace,
          onSelect: () => handleSelectWorkspace(workspace.path),
        })),
      });
    }

    return nextSections;
  }, [handleOpenFolder, handleSelectWorkspace, normalizedCurrentWorkspace, orderedWorkspaces, t]);

  const content = <SearchableSelectorPanel sections={sections} query={query} onQueryChange={setQuery} searchPlaceholder={t('conversation.workspaceSelector.searchPlaceholder', { defaultValue: '搜索工作空间' })} emptyText={t('conversation.workspaceSelector.empty', { defaultValue: '没有匹配的工作空间' })} />;

  return (
    <Popover trigger='click' position='bl' popupVisible={visible} onVisibleChange={handleVisibleChange} content={content} unmountOnExit>
      <span className='inline-flex'>
        {children({
          visible,
          workspaceLabel: workspaceButtonLabel,
          workspaceTooltip: workspaceButtonTooltip,
        })}
      </span>
    </Popover>
  );
};

const WorkspaceShortcutSelector: React.FC<WorkspaceShortcutSelectorProps> = ({ workspacePath, onSelectWorkspace, onPickWorkspace, className }) => {
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);

  return (
    <WorkspaceSelectorPopover workspacePath={workspacePath} onSelectWorkspace={onSelectWorkspace} onPickWorkspace={onPickWorkspace}>
      {({ visible, workspaceLabel, workspaceTooltip }) => (
        <Tooltip content={workspaceTooltip} disabled={isMobile || visible}>
          <Button type='secondary' className={`${styles.workspaceShortcutButton}${className ? ` ${className}` : ''}`} aria-label={workspaceTooltip}>
            <FolderOpen theme='outline' size='14' fill={iconColors.secondary} style={{ lineHeight: 0, flexShrink: 0 }} />
            <span className={styles.workspaceShortcutLabel}>{workspaceLabel}</span>
            <Down className={styles.workspaceShortcutCaret} theme='outline' size='12' fill={iconColors.secondary} />
          </Button>
        </Tooltip>
      )}
    </WorkspaceSelectorPopover>
  );
};

export default WorkspaceShortcutSelector;
