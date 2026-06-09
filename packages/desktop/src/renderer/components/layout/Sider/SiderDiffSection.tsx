/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Diff section in the Sider workspace panel (bottom pane).
 *
 * Resolves the active conversation (mirror of SiderFileTree), then mounts
 * ChatWorkspace with panelMode="changes". This renders only the GitChangeList
 * (staging, diffs, commit) with no tab bar / tree / drag-import.
 *
 * The header here owns the "Diff (N)" label + branch dropdown (for local changes).
 * We receive live meta via onChangesMeta so we don't duplicate the hooks.
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import ChatWorkspace from '@/renderer/pages/conversation/Workspace';
import { Empty } from '@arco-design/web-react';
import { Code, FullScreen, Refresh } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import GitDiffFlyoutModal from './GitDiffFlyoutModal';
import { SiderWorkspaceActionBtn } from './SiderWorkspaceActionBtn';
import panelStyles from './SiderWorkspacePanel.module.css';
import SiderWorkspaceSectionHeader from './SiderWorkspaceSectionHeader';

type ChangesMeta = {
  count: number;
  branch: string | null;
  isRemote: boolean;
};

type SiderDiffSectionProps = {
  /**
   * When true, the internal `SiderWorkspaceSectionHeader` (title + action
   * buttons) is omitted so the component can sit inside a parent accordion
   * section that provides its own header. Default false — preserves the
   * standalone behavior for any other caller.
   */
  headerless?: boolean;
};

const SiderDiffSection: React.FC<SiderDiffSectionProps> = ({ headerless = false }) => {
  const { t } = useTranslation();
  const { id: conversationId } = useParams<{ id: string }>();
  const { data: conversation } = useSWR<TChatConversation | undefined>(
    conversationId ? `sider-diff-section.conversation.${conversationId}` : null,
    () => ipcBridge.conversation.get.invoke({ id: conversationId as string }),
    { revalidateOnFocus: false }
  );

  const workspace = conversation?.extra?.workspace;
  const isTemporaryWorkspace = (conversation?.extra as { is_temporary_workspace?: boolean } | undefined)
    ?.is_temporary_workspace;
  const eventPrefix = conversation?.type;

  const [meta, setMeta] = useState<ChangesMeta>({ count: 0, branch: null, isRemote: false });
  const [refreshGit, setRefreshGit] = useState<(() => void) | null>(null);

  const diffTitle = useMemo(() => {
    if (meta.isRemote) {
      return t('conversation.workspace.changes.remoteChanges', { defaultValue: 'Remote Changes' });
    }
    if (meta.branch) {
      return t('conversation.workspace.changes.diffWithBranch', { count: meta.count, branch: meta.branch });
    }
    return t('conversation.workspace.changes.diffCount', { count: meta.count });
  }, [meta.branch, meta.count, meta.isRemote, t]);

  const handleDiffRefreshReady = useCallback((refresh: () => void) => {
    setRefreshGit(() => refresh);
  }, []);

  if (workspace && conversationId && eventPrefix) {
    return (
      <div
        className={`${panelStyles.section} size-full`}
        role='region'
        aria-label={t('conversation.workspace.changes.diff')}
        data-testid='sider-diff-section'
      >
        {headerless ? null : (
          <SiderWorkspaceSectionHeader
            title={diffTitle}
            actions={
              <>
                <SiderWorkspaceActionBtn
                  tooltip={t('conversation.workspace.changes.refresh')}
                  icon={<Refresh theme='outline' size={14} fill='currentColor' />}
                  onClick={() => refreshGit?.()}
                  disabled={!refreshGit}
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
            panelMode='changes'
            siderDiffChrome='embedded'
            onChangesMeta={setMeta}
            onSiderDiffRefreshReady={handleDiffRefreshReady}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${panelStyles.section} size-full`}
      role='region'
      aria-label={t('conversation.workspace.changes.diff')}
      data-testid='sider-diff-section'
    >
      {headerless ? null : <SiderWorkspaceSectionHeader title={t('conversation.workspace.changes.diff')} />}
      <div className={`${panelStyles.body} flex-center`}>
        <Empty
          icon={<Code theme='outline' size={48} fill='var(--text-tertiary)' />}
          description={
            <div className='flex flex-col items-center gap-4px'>
              <span className='text-t-primary text-13px font-medium'>
                {t('conversation.workspace.changes.noActiveWorkspace')}
              </span>
              <span className='text-t-tertiary text-12px'>
                {t('conversation.workspace.changes.noActiveWorkspaceDesc')}
              </span>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default SiderDiffSection;
