/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { SidebarItem } from '@/common/types/sidebar';
import { useAgentLogos } from '@/renderer/utils/model/agentLogo';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Checkbox, Empty, Message, Modal, Spin } from '@arco-design/web-react';
import { DeleteOne, FolderClose, ListCheckbox, MessageOne, Peoples, Robot } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { resolveConversationLeadingMark } from '@/renderer/pages/conversation/utils/conversationAssistantIdentity';

const ARCHIVED_SWR_KEY = 'sidebar-archived';

/** A single archived row, resolved from a {@link SidebarItem} for uniform rendering. */
type ArchivedRow = {
  /** `${item_type}:${item_id}` — unique across the grouped read model. */
  key: string;
  item_type: 'conversation' | 'team';
  item_id: string;
  name: string;
  icon: React.ReactElement;
  updatedAt?: number;
};

/** One archived project bucket. Ordinary chats are grouped into the synthetic no-project bucket. */
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
  const { t, i18n } = useTranslation();
  const logos = useAgentLogos();
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedKeys, setSelectedKeys] = React.useState<ReadonlySet<string>>(() => new Set<string>());

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

  const { archivedBlocks, total } = React.useMemo(() => {
    const seen = new Set<string>();

    const renderConversationIcon = (item: Extract<SidebarItem, { type: 'conversation' }>): React.ReactElement => {
      const leadingMark = resolveConversationLeadingMark(item.conversation, undefined, logos);
      if (leadingMark.kind === 'emoji') {
        return <span className='text-16px leading-none flex-shrink-0'>{leadingMark.value}</span>;
      }
      if (leadingMark.kind === 'image') {
        return (
          <img
            src={leadingMark.value}
            alt={leadingMark.label}
            className='block w-16px h-16px rounded-50% object-cover flex-shrink-0'
          />
        );
      }
      if (leadingMark.kind === 'assistant_fallback') {
        return <Robot theme='outline' size='16' className='block leading-none text-t-secondary' />;
      }
      return <MessageOne theme='outline' size='16' className='block leading-none text-t-secondary' />;
    };

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
          icon: renderConversationIcon(item),
          updatedAt: item.conversation.created_at,
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
        updatedAt: item.updated_at,
      };
    };

    const archivedBlocks: ProjectBlock[] = [];
    const noProjectRows: ArchivedRow[] = [];
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
        archivedBlocks.push({ key, name: scope.name, rows, projectId });
      } else {
        // Ordinary archived chats are still grouped as a project-like block, named "No project".
        noProjectRows.push(...rows);
      }
    }
    if (noProjectRows.length > 0) {
      archivedBlocks.push({ key: 'no-project', name: t('settings.archived.noProject'), rows: noProjectRows });
    }
    return { archivedBlocks, total: seen.size };
  }, [data, logos, t]);

  const allRows = React.useMemo(() => archivedBlocks.flatMap((block) => block.rows), [archivedBlocks]);

  const selectedRows = React.useMemo(() => allRows.filter((row) => selectedKeys.has(row.key)), [allRows, selectedKeys]);
  const allRowsSelected = allRows.length > 0 && allRows.every((row) => selectedKeys.has(row.key));

  React.useEffect(() => {
    const availableKeys = new Set(allRows.map((row) => row.key));
    setSelectedKeys((prev) => {
      const next = new Set([...prev].filter((key) => availableKeys.has(key)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [allRows]);

  const setRowSelected = React.useCallback((row: ArchivedRow, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(row.key);
      } else {
        next.delete(row.key);
      }
      return next;
    });
  }, []);

  const toggleRowSelected = React.useCallback((row: ArchivedRow) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(row.key)) {
        next.delete(row.key);
      } else {
        next.add(row.key);
      }
      return next;
    });
  }, []);

  const setBlockSelected = React.useCallback((block: ProjectBlock, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const row of block.rows) {
        if (checked) {
          next.add(row.key);
        } else {
          next.delete(row.key);
        }
      }
      return next;
    });
  }, []);

  const handleSelectAll = React.useCallback(() => {
    setSelectedKeys((prev) => {
      if (allRows.length > 0 && allRows.every((row) => prev.has(row.key))) {
        return new Set<string>();
      }
      return new Set(allRows.map((row) => row.key));
    });
  }, [allRows]);

  const handleCancelSelectionMode = React.useCallback(() => {
    setSelectionMode(false);
    setSelectedKeys(new Set<string>());
  }, []);

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

  const handleDeleteSelected = React.useCallback(() => {
    if (selectedRows.length === 0) return;

    Modal.confirm({
      title: t('settings.archived.deleteSelectedConfirmTitle'),
      content: t('settings.archived.deleteSelectedConfirmContent', { count: selectedRows.length }),
      okText: t('settings.archived.deleteSelected'),
      cancelText: t('common.cancel'),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        try {
          const selectedProjectBlocks = archivedBlocks.filter(
            (block) => block.projectId && block.rows.length > 0 && block.rows.every((row) => selectedKeys.has(row.key))
          );
          const projectSelectedKeys = new Set(
            selectedProjectBlocks.flatMap((block) => block.rows.map((row) => row.key))
          );
          const selectedSingleRows = selectedRows.filter((row) => !projectSelectedKeys.has(row.key));

          await Promise.all([
            ...selectedProjectBlocks.map((block) =>
              ipcBridge.sidebar.deleteArchivedProject.invoke({ project_id: block.projectId as string })
            ),
            ...selectedSingleRows.map((row) =>
              ipcBridge.sidebar.deleteArchivedItem.invoke({ item_type: row.item_type, item_id: row.item_id })
            ),
          ]);

          setSelectedKeys(new Set<string>());
          setSelectionMode(false);
          await mutate();
          Message.success(t('settings.archived.deleteSelectedSuccess'));
        } catch (error) {
          console.error('Failed to delete selected archived items:', error);
          Message.error(t('settings.archived.deleteFailed'));
        }
      },
      style: { borderRadius: '12px' },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [mutate, archivedBlocks, selectedKeys, selectedRows, t]);

  const formatArchivedTime = React.useCallback(
    (timestamp?: number) => {
      if (!timestamp) return '';
      return new Intl.DateTimeFormat(i18n.language || 'zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestamp));
    },
    [i18n.language]
  );

  const renderRow = (row: ArchivedRow, isLast: boolean) => (
    <div
      key={row.key}
      className={`group box-border flex h-56px items-center gap-10px px-14px py-6px transition-colors hover:bg-fill-2 ${
        selectionMode ? 'cursor-pointer' : ''
      } ${!isLast ? 'border-0 border-b border-solid border-[var(--color-border-2)]' : ''}`}
      onClick={() => {
        if (selectionMode) toggleRowSelected(row);
      }}
    >
      {selectionMode ? (
        <Checkbox
          checked={selectedKeys.has(row.key)}
          onClick={(event) => event.stopPropagation()}
          onChange={(checked) => setRowSelected(row, checked)}
        />
      ) : null}
      <span className='size-20px flex items-center justify-center shrink-0 line-height-0'>{row.icon}</span>
      <div className='min-w-0 flex-1'>
        <div className='overflow-hidden text-ellipsis whitespace-nowrap text-14px font-[600] text-t-primary'>
          {row.name}
        </div>
        {row.updatedAt ? (
          <div className='mt-2px overflow-hidden text-ellipsis whitespace-nowrap text-12px text-t-secondary'>
            {formatArchivedTime(row.updatedAt)}
          </div>
        ) : null}
      </div>
      {!selectionMode ? (
        <div className='shrink-0 flex items-center gap-6px'>
          <Button
            type='text'
            size='small'
            status='danger'
            icon={<DeleteOne theme='outline' size='14' />}
            onClick={() => handleDelete(row)}
          />
          <Button
            type='secondary'
            size='mini'
            className='!h-28px !rounded-8px !px-10px'
            onClick={() => void handleRestore(row)}
          >
            {t('settings.archived.restore')}
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader
        title={t('settings.archived.navLabel')}
        actions={
          total > 0 ? (
            <div className='flex min-w-0 items-center justify-end gap-10px'>
              {selectionMode ? (
                <div className='flex items-center gap-10px rd-12px border border-solid border-[var(--color-border-2)] bg-fill-1 px-10px py-6px'>
                  <span className='px-4px text-14px text-t-secondary'>
                    {t('settings.archived.selectedCount', { count: selectedRows.length })}
                  </span>
                  <Checkbox className='!text-14px' checked={allRowsSelected} onChange={handleSelectAll}>
                    {t('settings.archived.selectAll')}
                  </Checkbox>
                  <Button
                    size='small'
                    type='secondary'
                    className='!h-32px !rounded-10px !px-12px !text-14px'
                    onClick={handleCancelSelectionMode}
                  >
                    {t('settings.archived.cancelSelect')}
                  </Button>
                  <Button
                    size='small'
                    status='warning'
                    className='!h-32px !rounded-10px !px-12px !text-14px'
                    disabled={selectedRows.length === 0}
                    onClick={handleDeleteSelected}
                  >
                    {t('settings.archived.deleteSelected')}
                  </Button>
                </div>
              ) : (
                <Button
                  size='default'
                  type='secondary'
                  icon={<ListCheckbox theme='outline' size='16' />}
                  className='!h-34px !rounded-10px !px-14px !text-14px !font-[500]'
                  onClick={() => setSelectionMode(true)}
                >
                  {t('settings.archived.multiSelect')}
                </Button>
              )}
            </div>
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
        <div className='mt-18px flex flex-col gap-12px'>
          <div className='flex flex-col gap-20px'>
            {archivedBlocks.map((block) => {
              const blockSelected = block.rows.length > 0 && block.rows.every((row) => selectedKeys.has(row.key));
              const blockPartiallySelected =
                block.rows.some((row) => selectedKeys.has(row.key)) &&
                !block.rows.every((row) => selectedKeys.has(row.key));
              return (
                <section key={block.key} className='flex flex-col gap-8px'>
                  <div className='flex items-center gap-8px px-2px'>
                    {selectionMode ? (
                      <Checkbox
                        checked={blockSelected}
                        indeterminate={blockPartiallySelected}
                        onChange={(checked) => setBlockSelected(block, checked)}
                      />
                    ) : null}
                    <FolderClose theme='outline' size='16' className='shrink-0 text-t-secondary' />
                    <h2 className='m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-16px font-[600] text-t-primary'>
                      {block.name}
                    </h2>
                    <span className='shrink-0 text-13px text-t-secondary'>
                      {t('settings.archived.chatCount', { count: block.rows.length })}
                    </span>
                  </div>
                  <div className='overflow-hidden rd-12px border border-solid border-[var(--color-border-2)] bg-bg-1'>
                    {block.rows.map((row, index) => renderRow(row, index === block.rows.length - 1))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </SettingsPageWrapper>
  );
};

export default ArchivedSettings;
