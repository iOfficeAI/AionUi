/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { channel } from '@/common/adapter/ipcBridge';
import { WorkspaceFolderSelect } from '@renderer/components/workspace';
import { Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ChannelWorkspaceFieldProps = {
  platform: string;
  /** Optional width class for the folder select trigger (defaults to 280px). */
  selectWidthClassName?: string;
};

/**
 * Platform-level workspace picker for channel settings.
 *
 * Empty / cleared value means channel conversations keep using auto-provisioned
 * temporary workspaces. Changing the path clears channel sessions so the next
 * IM message creates a conversation bound to the new workspace.
 */
const ChannelWorkspaceField: React.FC<ChannelWorkspaceFieldProps> = ({
  platform,
  selectWidthClassName = 'w-280px',
}) => {
  const { t } = useTranslation();
  const [workspacePath, setWorkspacePath] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const settings = await channel.getPlatformSettings.invoke({ platform });
        if (!cancelled) {
          setWorkspacePath(settings?.workspace?.path?.trim() || '');
        }
      } catch (error) {
        console.error(`[ChannelWorkspaceField] Failed to load workspace for ${platform}:`, error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const persistWorkspace = useCallback(
    async (nextPath: string) => {
      const previous = workspacePath;
      setWorkspacePath(nextPath);
      try {
        await channel.setWorkspaceSetting.invoke({
          platform,
          workspace: { path: nextPath },
        });
        Message.success(
          nextPath
            ? t('settings.channels.workspaceSaved', { defaultValue: 'Workspace updated' })
            : t('settings.channels.workspaceCleared', {
                defaultValue: 'Workspace cleared; new chats will use a temporary folder',
              })
        );
      } catch (error) {
        console.error(`[ChannelWorkspaceField] Failed to save workspace for ${platform}:`, error);
        setWorkspacePath(previous);
        Message.error(t('common.saveFailed', { defaultValue: 'Failed to save' }));
      }
    },
    [platform, t, workspacePath]
  );

  return (
    <div className='flex items-center justify-between gap-24px py-12px'>
      <div className='flex-1 min-w-0'>
        <div className='text-14px text-t-primary'>
          {t('settings.channels.workspace', { defaultValue: 'Workspace' })}
        </div>
        <div className='text-12px text-t-tertiary mt-2px'>
          {t('settings.channels.workspaceDesc', {
            defaultValue:
              'Folder used for new channel conversations. Leave empty to use a temporary folder each session.',
          })}
        </div>
      </div>
      <div className={selectWidthClassName}>
        <WorkspaceFolderSelect
          value={loading ? undefined : workspacePath || undefined}
          onChange={(next) => {
            void persistWorkspace(next);
          }}
          onClear={() => {
            void persistWorkspace('');
          }}
          placeholder={t('settings.channels.workspacePlaceholder', {
            defaultValue: 'Temporary folder (default)',
          })}
          recentLabel={t('team.create.recentLabel', { defaultValue: 'Recent' })}
          chooseDifferentLabel={t('team.create.chooseDifferentFolder', {
            defaultValue: 'Choose a different folder',
          })}
          recentStorageKey='channel-workspace-recent'
          triggerTestId={`channel-workspace-trigger-${platform}`}
          menuTestId={`channel-workspace-menu-${platform}`}
          menuZIndex={10020}
        />
      </div>
    </div>
  );
};

export default ChannelWorkspaceField;
