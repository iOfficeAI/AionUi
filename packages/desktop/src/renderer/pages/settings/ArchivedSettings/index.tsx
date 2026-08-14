/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { SidebarItem } from '@/common/types/sidebar';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Empty, Message, Modal, Spin } from '@arco-design/web-react';
import { DeleteOne, MessageOne, Peoples } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

const ARCHIVED_SWR_KEY = 'sidebar-archived';

/** A single archived row, resolved from a {@link SidebarItem} for uniform rendering. */
type ArchivedRow = {
  /** `${item_type}:${item_id}` — unique across the grouped read model. */
  key: string;
  item_type: 'conversation' | 'team';
  item_id: string;
  name: string;
  icon: React.ReactElement;
  /** Member count for teams; absent for conversations. */
  memberCount?: number;
};

/** One project block in the Projects section: a project's name + its archived rows. */
type ProjectBlock = {
  key: string;
  name: string;
  rows: ArchivedRow[];
  /**
   * The backing standard project id, present only for real project groups
   * (`scope.type === 'project'`). Absent for dir pseudo-groups, which have no
   * project record and fall back to per-row restore/delete.
   */
  projectId?: string;
};

/**
 * Archived management page. Reuses the grouped sidebar read model with the
 * `archived` flag (the same `SidebarResponse` shape as the active sidebar) and
 * mirrors the sidebar's layout: a **Projects** section (grouped by project /
 * pseudo-dir, each shown under its project name) and a flat **Conversations**
 * section (the `chats` group). Restoring an item unarchives it and a
 * `chat.history.refresh` puts it back in the active sidebar.
 */
const ArchivedSettings: React.FC = () => {
  const { t } = useTranslation();

  const { data, isLoading, mutate } = useSWR(ARCHIVED_SWR_KEY, () => ipcBridge.sidebar.get.invoke({ archived: true }));

  // The active (left) sidebar is an event-driven singleton with no route/focus
  // revalidation, so it only reflects a restore once `chat.history.refresh`
  // fires. We don't fire it per action (that refetches the active list while
  // it's hidden behind the settings route); instead we mark the page dirty on
  // any *restore* — the only op that moves items back into the active list —
  // and emit a single refresh on unmount ("Back to Chat"). Deletes/clear touch
  // archived units only, so they never need to refresh the active list.
  const restoredRef = React.useRef(false);
  React.useEffect(
    () => () => {
      if (restoredRef.current) emitter.emit('chat.history.refresh');
    },
    []
  );

  const { projectBlocks, chatRows, total } = React.useMemo(() => {
    const seen = new Set<string>();
    // Resolve a sidebar item to a row, deduped across groups. Returns null when
    // the item was already emitted (defensive — archived items are unpinned so a
    // double-render across groups is not expected).
    const toRow = (item: SidebarItem): ArchivedRow | null => {
      if (item.type === 'conversation') {
        const key = `conversation:${item.conversation.id}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          key,
          item_type: 'conversation',
          item_id: item.conversation.id,
          name: item.conversation.name || t('conversation.welcome.newConversation'),
          icon: <MessageOne theme='outline' size='16' className='block leading-none text-t-secondary' />,
        };
      }
      const key = `team:${item.team_id}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        key,
        item_type: 'team',
        item_id: item.team_id,
        name: item.name,
        icon: <Peoples theme='outline' size='16' className='block leading-none text-t-secondary' />,
        memberCount: item.member_conversation_ids.length,
      };
    };

    const projectBlocks: ProjectBlock[] = [];
    const chatRows: ArchivedRow[] = [];
    for (const group of data?.groups ?? []) {
      const rows: ArchivedRow[] = [];
      for (const item of group.items as SidebarItem[]) {
        const row = toRow(item);
        if (row) rows.push(row);
      }
      if (rows.length === 0) continue;
      const scope = group.scope;
      if (scope.type === 'project' || scope.type === 'dir') {
        const key = scope.type === 'project' ? scope.project_id : scope.key;
        const projectId = scope.type === 'project' ? scope.project_id : undefined;
        projectBlocks.push({ key, name: scope.name, rows, projectId });
      } else {
        // `chats` and (defensively) `pinned` fold into the flat conversation section.
        chatRows.push(...rows);
      }
    }
    return { projectBlocks, chatRows, total: seen.size };
  }, [data, t]);

  const handleRestore = React.useCallback(
    async (row: ArchivedRow) => {
      try {
        await ipcBridge.sidebar.unarchive.invoke({ item_type: row.item_type, item_id: row.item_id });
        restoredRef.current = true;
        await mutate();
        Message.success(t('settings.archived.restoreSuccess'));
      } catch (error) {
        console.error('Failed to restore archived item:', error);
        Message.error(t('settings.archived.restoreFailed'));
      }
    },
    [mutate, t]
  );

  const handleDelete = React.useCallback(
    (row: ArchivedRow) => {
      Modal.confirm({
        title: t('settings.archived.deleteConfirmTitle'),
        content: t('settings.archived.deleteConfirmContent', { name: row.name }),
        okText: t('settings.archived.delete'),
        cancelText: t('common.cancel'),
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          try {
            await ipcBridge.sidebar.deleteArchivedItem.invoke({ item_type: row.item_type, item_id: row.item_id });
            await mutate();
            Message.success(t('settings.archived.deleteSuccess'));
          } catch (error) {
            console.error('Failed to delete archived item:', error);
            Message.error(t('settings.archived.deleteFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [mutate, t]
  );

  const handleRestoreProject = React.useCallback(
    async (block: ProjectBlock) => {
      try {
        if (block.projectId) {
          // Real project: one server-side sweep restores every archived unit
          // (catches path-merged members the row list may not surface).
          await ipcBridge.sidebar.unarchiveProject.invoke({ project_id: block.projectId });
        } else {
          // Dir pseudo-group: no backing project, so restore each row in turn.
          await Promise.all(
            block.rows.map((row) =>
              ipcBridge.sidebar.unarchive.invoke({ item_type: row.item_type, item_id: row.item_id })
            )
          );
        }
        restoredRef.current = true;
        await mutate();
        Message.success(t('settings.archived.restoreSuccess'));
      } catch (error) {
        console.error('Failed to restore archived project:', error);
        Message.error(t('settings.archived.restoreFailed'));
      }
    },
    [mutate, t]
  );

  const handleDeleteProject = React.useCallback(
    (block: ProjectBlock) => {
      Modal.confirm({
        title: t('settings.archived.deleteProjectConfirmTitle'),
        content: t('settings.archived.deleteProjectConfirmContent', { name: block.name }),
        okText: t('settings.archived.delete'),
        cancelText: t('common.cancel'),
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          try {
            if (block.projectId) {
              // Real project: one server-side sweep deletes every archived unit.
              // The project record itself is intentionally kept by the backend.
              await ipcBridge.sidebar.deleteArchivedProject.invoke({ project_id: block.projectId });
            } else {
              await Promise.all(
                block.rows.map((row) =>
                  ipcBridge.sidebar.deleteArchivedItem.invoke({ item_type: row.item_type, item_id: row.item_id })
                )
              );
            }
            await mutate();
            Message.success(t('settings.archived.deleteSuccess'));
          } catch (error) {
            console.error('Failed to delete archived project:', error);
            Message.error(t('settings.archived.deleteFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [mutate, t]
  );

  const handleEmpty = React.useCallback(() => {
    Modal.confirm({
      title: t('settings.archived.clearConfirmTitle'),
      content: t('settings.archived.clearConfirmContent'),
      okText: t('settings.archived.clearAll'),
      cancelText: t('common.cancel'),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        try {
          await ipcBridge.sidebar.deleteArchived.invoke();
          await mutate();
          Message.success(t('settings.archived.clearSuccess'));
        } catch (error) {
          console.error('Failed to empty archive:', error);
          Message.error(t('settings.archived.clearFailed'));
        }
      },
      style: { borderRadius: '12px' },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [mutate, t]);

  const renderRow = (row: ArchivedRow) => (
    <div
      key={row.key}
      className='group flex h-48px items-center gap-12px rd-8px px-12px transition-colors hover:bg-fill-3'
    >
      <span className='size-22px flex items-center justify-center shrink-0 line-height-0'>{row.icon}</span>
      <div className='min-w-0 flex-1'>
        <div className='overflow-hidden text-ellipsis whitespace-nowrap text-14px font-[500] text-t-primary'>
          {row.name}
        </div>
        {typeof row.memberCount === 'number' ? (
          <div className='text-12px text-t-tertiary'>
            {t('settings.archived.teamMemberCount', { count: row.memberCount })}
          </div>
        ) : null}
      </div>
      <div className='shrink-0 flex items-center gap-4px'>
        <Button type='text' size='small' onClick={() => void handleRestore(row)}>
          {t('settings.archived.restore')}
        </Button>
        <Button type='text' size='small' status='danger' onClick={() => handleDelete(row)}>
          {t('settings.archived.delete')}
        </Button>
      </div>
    </div>
  );

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader
        title={t('settings.archived.title')}
        description={t('settings.archived.description')}
        actions={
          total > 0 ? (
            <Button status='danger' icon={<DeleteOne theme='outline' size='14' />} onClick={handleEmpty}>
              {t('settings.archived.clearAll')}
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <div className='flex items-center justify-center py-64px'>
          <Spin />
        </div>
      ) : total === 0 ? (
        <div className='flex items-center justify-center py-64px'>
          <Empty description={t('settings.archived.empty')} />
        </div>
      ) : (
        <div className='mt-18px flex flex-col gap-2px'>
          {projectBlocks.length > 0 ? (
            <>
              <div className='px-4px mt-4px mb-2px h-28px flex items-center text-14px font-[500] text-t-tertiary select-none'>
                {t('conversation.history.projectsSection')}
              </div>
              {projectBlocks.map((block) => (
                <div key={block.key} className='flex flex-col gap-2px'>
                  <div className='group px-12px mt-4px h-24px flex items-center gap-8px text-12px font-[500] text-t-secondary'>
                    <span className='min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap'>{block.name}</span>
                    <div className='shrink-0 flex items-center gap-4px opacity-0 group-hover:opacity-100 transition-opacity'>
                      <Button type='text' size='mini' onClick={() => void handleRestoreProject(block)}>
                        {t('settings.archived.restoreProject')}
                      </Button>
                      <Button type='text' size='mini' status='danger' onClick={() => handleDeleteProject(block)}>
                        {t('settings.archived.deleteProject')}
                      </Button>
                    </div>
                  </div>
                  {block.rows.map(renderRow)}
                </div>
              ))}
            </>
          ) : null}
          {chatRows.length > 0 ? (
            <>
              <div className='px-4px mt-8px mb-2px h-28px flex items-center text-14px font-[500] text-t-tertiary select-none'>
                {t('conversation.history.conversationsSection')}
              </div>
              {chatRows.map(renderRow)}
            </>
          ) : null}
        </div>
      )}
    </SettingsPageWrapper>
  );
};

export default ArchivedSettings;
