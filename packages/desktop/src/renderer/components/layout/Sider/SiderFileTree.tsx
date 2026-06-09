/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File-tree region in the Sider workspace panel.
 *
 * Resolves the active conversation from the route param, fetches it via
 * `ipcBridge.conversation.get`, and renders the shared `ChatWorkspace`
 * panel when the conversation has a `extra.workspace` path. Falls back
 * to a localized "No active workspace" empty state otherwise.
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import ChatWorkspace from '@/renderer/pages/conversation/Workspace';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';
import { Empty } from '@arco-design/web-react';
import { Code, FullScreen, Refresh } from '@icon-park/react';
import { SiderWorkspaceActionBtn } from './SiderWorkspaceActionBtn';
import panelStyles from './SiderWorkspacePanel.module.css';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import SiderWorkspaceSectionHeader from './SiderWorkspaceSectionHeader';
import WorkspaceFilesFlyoutModal from './WorkspaceFilesFlyoutModal';

type SiderFileTreeProps = {
  /**
   * When true, the internal `SiderWorkspaceSectionHeader` (title + action
   * buttons) is omitted so the component can sit inside a parent accordion
   * section that provides its own header. Default false — preserves the
   * standalone behavior for any other caller.
   */
  headerless?: boolean;
};

const SiderFileTree: React.FC<SiderFileTreeProps> = ({ headerless = false }) => {
  const { t } = useTranslation();
  const { id: conversationId } = useParams<{ id: string }>();
  const { data: conversation } = useSWR<TChatConversation | undefined>(
    conversationId ? `sider-file-tree.conversation.${conversationId}` : null,
    () => ipcBridge.conversation.get.invoke({ id: conversationId as string }),
    { revalidateOnFocus: false }
  );

  const workspace = conversation?.extra?.workspace;
  const isTemporaryWorkspace = (conversation?.extra as { is_temporary_workspace?: boolean } | undefined)
    ?.is_temporary_workspace;
  const eventPrefix = conversation?.type;
  const [refreshWorkspace, setRefreshWorkspace] = useState<(() => void) | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);

  const workspaceLabel = useMemo(
    () => (workspace ? getWorkspaceDisplayName(workspace, isTemporaryWorkspace ?? false, (key) => t(key)) : ''),
    [workspace, isTemporaryWorkspace, t]
  );

  const handleSiderRefreshReady = useCallback((refresh: () => void) => {
    setRefreshWorkspace(() => refresh);
  }, []);

  const handleRefreshClick = useCallback(() => {
    if (!refreshWorkspace) return;
    setTreeLoading(true);
    void Promise.resolve(refreshWorkspace()).finally(() => setTreeLoading(false));
  }, [refreshWorkspace]);

  if (workspace && conversationId && eventPrefix) {
    return (
      <div
        className={`${panelStyles.section} size-full`}
        role='region'
        aria-label={t('conversation.workspace.changes.filesTab')}
        data-testid='sider-file-tree'
      >
        {headerless ? null : (
          <SiderWorkspaceSectionHeader
            title={workspaceLabel}
            actions={
              <>
                <SiderWorkspaceActionBtn
                  tooltip={t('conversation.workspace.refresh')}
                  icon={
                    <Refresh
                      theme='outline'
                      size={14}
                      fill='currentColor'
                      className={treeLoading ? 'animate-spin' : undefined}
                    />
                  }
                  onClick={handleRefreshClick}
                  disabled={treeLoading || !refreshWorkspace}
                />
              </>
            }
          />
        )}
        <div className={panelStyles.body}>
          <ChatWorkspace
            conversation_id={conversationId}
            workspace={workspace}
            isTemporaryWorkspace={isTemporaryWorkspace}
            eventPrefix={eventPrefix}
            panelMode='files'
            siderFilesChrome='embedded'
            onSiderFilesRefreshReady={handleSiderRefreshReady}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${panelStyles.section} size-full`}
      role='region'
      aria-label='File tree'
      data-testid='sider-file-tree'
    >
      {headerless ? null : <SiderWorkspaceSectionHeader title={t('conversation.workspace.changes.filesTab')} />}
      <div className={`${panelStyles.body} flex-center`}>
        <Empty
          icon={<Code theme='outline' size={48} fill='var(--text-tertiary)' />}
          description={
            <div className='flex flex-col items-center gap-4px'>
              <span className='text-t-primary text-13px font-medium'>
                {t('conversation.workspace.changes.noActiveWorkspace')}
              </span>
              <span className='text-t-tertiary text-12px'>{t('conversation.workspace.emptyDescription')}</span>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default SiderFileTree;
