/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { SidebarCustomGroupItemKind, SidebarItem, SidebarTeamItem } from '@/common/types/sidebar';
import AionModal from '@/renderer/components/base/AionModal';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCronJobsMap } from '@/renderer/pages/cron';
import { restrictToVerticalAxis } from '@/renderer/utils/ui/dndModifiers';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Empty, Input, Menu, Modal, Tooltip } from '@arco-design/web-react';
import { Delete, Folder, FoldUpOne, MessageOne, MoreOne, Peoples, Plus, Right } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import SiderItem from '@renderer/components/layout/Sider/SiderItem';
import TeamCreateModal from '@renderer/pages/team/components/TeamCreateModal';
import WorkspaceCollapse from '../components/WorkspaceCollapse';
import ConversationRow from './ConversationRow';
import CustomGroupsSection from './CustomGroupsSection';
import SortableConversationRow from './SortableConversationRow';
import TeamRow from './TeamRow';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useConversationActions } from './hooks/useConversationActions';
import { useConversations } from './hooks/useConversations';
import { useCustomGroups } from './hooks/useCustomGroups';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useTeamRows } from './hooks/useTeamRows';
import type { ConversationRowProps, MoveToGroupMenuItem, TimelineItem, WorkspaceGroupedHistoryProps } from './types';
import { makeMoveToGroupKey, parseGroupItemId } from './utils/customGroupHelpers';

const WorkspaceGroupedHistory: React.FC<WorkspaceGroupedHistoryProps> = ({
  onSessionClick,
  collapsed = false,
  tooltipEnabled = false,
  batchMode = false,
  onBatchModeChange,
}) => {
  const { id } = useParams();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Project "+" → "New team": null = modal closed, string = open prefilled with
  // that project's workspace.
  const [teamCreateWorkspace, setTeamCreateWorkspace] = useState<string | null>(null);
  // Conversations-header "+" → "New team": unbound team (no initialWorkspace).
  const [globalTeamCreateVisible, setGlobalTeamCreateVisible] = useState(false);
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { getJobStatus, markAsRead, setActiveConversation } = useCronJobsMap();

  const {
    conversations,
    isConversationGenerating,
    hasCompletionUnread,
    expandedWorkspaces,
    pinnedConversations,
    pinnedRows,
    timelineSections,
    pinnedPaging,
    chatsPaging,
    handleToggleWorkspace,
    collapseAllWorkspaces,
    collapsedSections,
    toggleSection,
    loadMore,
  } = useConversations();

  const { resolveTeamRow, renameModal: teamRenameModal } = useTeamRows({ pathname, onSessionClick });

  // User-defined sidebar groups: conversations/teams organized into named,
  // collapsible, drag-reorderable groups (persisted under `sidebar.customGroups`).
  const customGroups = useCustomGroups();
  const { groups: customGroupsList, moveItem: moveItemToGroup } = customGroups;

  // "Move to group" submenu: one entry per group, plus "remove from group" when
  // the item currently lives in a group. Keys are `moveToGroup:<groupId>` /
  // `moveToGroup:` (remove), consumed by ConversationRow/TeamRow.
  const buildMoveToGroupItems = useCallback(
    (kind: SidebarCustomGroupItemKind, id: string): MoveToGroupMenuItem[] => {
      const currentGroupId = customGroups.groupOfItem(kind, id);
      const items: MoveToGroupMenuItem[] = customGroupsList.map((group) => ({
        key: makeMoveToGroupKey(group.id),
        icon: <Folder theme='outline' size='14' />,
        label: group.name,
      }));
      if (currentGroupId) {
        items.push({
          key: makeMoveToGroupKey(null),
          icon: <Folder theme='outline' size='14' />,
          label: t('conversation.history.removeFromGroup'),
        });
      }
      return items;
    },
    [customGroups, customGroupsList, t]
  );

  const handleMoveConversationToGroup = useCallback(
    (conversation: TChatConversation, targetGroupId: string | null) => {
      moveItemToGroup('conversation', conversation.id, targetGroupId);
    },
    [moveItemToGroup]
  );

  const handleMoveTeamToGroup = useCallback(
    (teamId: string, targetGroupId: string | null) => {
      moveItemToGroup('team', teamId, targetGroupId);
    },
    [moveItemToGroup]
  );

  const renderTeamRow = useCallback(
    (item: SidebarTeamItem, dimIcon = false, dragHandle?: React.ReactNode) => {
      const data = resolveTeamRow(item);
      return (
        <TeamRow
          key={item.team_id}
          {...data}
          collapsed={collapsed}
          dimIcon={dimIcon}
          tooltipEnabled={tooltipEnabled}
          dragHandle={dragHandle}
          moveToGroupItems={buildMoveToGroupItems('team', item.team_id)}
          onMoveToGroup={(targetGroupId) => handleMoveTeamToGroup(item.team_id, targetGroupId)}
        />
      );
    },
    [resolveTeamRow, collapsed, tooltipEnabled, buildMoveToGroupItems, handleMoveTeamToGroup]
  );

  const SectionLabel = useCallback(
    ({
      sectionKey,
      label,
      trailing,
      divider,
    }: {
      sectionKey: string;
      label: string;
      trailing?: React.ReactNode;
      /** Hairline divider above the header, used to segment peer sections (not the first one). */
      divider?: boolean;
    }) => {
      const isCollapsed = collapsedSections.has(sectionKey);
      return (
        <div
          className={classNames(
            'group/label sider-section-label relative flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-8px cursor-pointer bg-[var(--bg-2)]',
            // Full-bleed 1px separator drawn via ::after so it never changes the
            // header height (WorkspaceCollapse pins its folders at stickyTop=28).
            divider &&
              'after:content-[""] after:absolute after:left-12px after:right-12px after:top-0 after:h-1px after:bg-b-base'
          )}
          onClick={() => toggleSection(sectionKey)}
        >
          <span className='text-14px text-t-secondary sider-section-title group-hover/label:text-t-primary transition-colors font-600 tracking-[0.03em] leading-none'>
            {label}
          </span>
          <span className='ml-3px flex items-center justify-center opacity-0 group-hover/label:opacity-100 transition-opacity text-t-tertiary shrink-0'>
            <Right
              theme='outline'
              size={12}
              className={classNames('transition-transform duration-150', { 'rotate-90': !isCollapsed })}
            />
          </span>
          {trailing && (
            <div className='ml-auto' onClick={(e) => e.stopPropagation()}>
              {trailing}
            </div>
          )}
        </div>
      );
    },
    [collapsedSections, toggleSection]
  );

  // Sync active conversation ref when route changes (for URL navigation)
  // This doesn't trigger state update, avoiding double render
  useEffect(() => {
    if (id) {
      setActiveConversation(id);
    }
  }, [id, setActiveConversation]);

  const {
    selectedConversationIds,
    setSelectedConversationIds,
    selectedCount,
    allSelected,
    toggleSelectedConversation,
    handleToggleSelectAll,
  } = useBatchSelection(batchMode, conversations);

  const {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    dropdownVisibleId,
    handleConversationClick,
    handleDeleteClick,
    handleBatchDelete,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleMenuVisibleChange,
    handleOpenMenu,
    handleCreateCronTask,
    handleRemoveProject,
    removeProjectTarget,
    removeProjectLoading,
    handleRemoveProjectCancel,
    handleRemoveProjectConfirm,
  } = useConversationActions({
    batchMode,
    onSessionClick,
    onBatchModeChange,
    selectedConversationIds,
    setSelectedConversationIds,
    toggleSelectedConversation,
    markAsRead,
  });

  const { sensors, handleDragEnd, isDragEnabled } = useDragAndDrop({
    pinnedConversations,
    batchMode,
    collapsed,
  });

  // Fork-lineage badge support: resolve a parent conversation's display name
  // from the already-loaded sidebar list (no extra fetch; unresolved = the
  // parent was deleted or not loaded → the badge falls back to a generic tip).
  const conversationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const conversation of conversations) {
      map.set(conversation.id, conversation.name);
    }
    return map;
  }, [conversations]);
  const resolveConversationName = useCallback(
    (conversationId: string) => conversationNameById.get(conversationId),
    [conversationNameById]
  );

  const getConversationRowProps = useCallback(
    (conversation: TChatConversation): ConversationRowProps => ({
      conversation,
      isGenerating: isConversationGenerating(conversation.id),
      hasCompletionUnread: hasCompletionUnread(conversation.id),
      collapsed,
      tooltipEnabled,
      batchMode,
      checked: selectedConversationIds.has(conversation.id),
      selected: id === conversation.id,
      menuVisible: dropdownVisibleId !== null && dropdownVisibleId === conversation.id,
      onToggleChecked: toggleSelectedConversation,
      onConversationClick: handleConversationClick,
      onOpenMenu: handleOpenMenu,
      onMenuVisibleChange: handleMenuVisibleChange,
      onEditStart: handleEditStart,
      onCreateCronTask: handleCreateCronTask,
      onDelete: handleDeleteClick,
      onTogglePin: handleTogglePin,
      getJobStatus,
      resolveConversationName,
      moveToGroupItems: buildMoveToGroupItems('conversation', conversation.id),
      onMoveToGroup: (targetGroupId) => handleMoveConversationToGroup(conversation, targetGroupId),
    }),
    [
      collapsed,
      tooltipEnabled,
      batchMode,
      isConversationGenerating,
      hasCompletionUnread,
      selectedConversationIds,
      id,
      dropdownVisibleId,
      toggleSelectedConversation,
      handleConversationClick,
      handleOpenMenu,
      handleMenuVisibleChange,
      handleEditStart,
      handleCreateCronTask,
      handleDeleteClick,
      handleTogglePin,
      getJobStatus,
      resolveConversationName,
      buildMoveToGroupItems,
      handleMoveConversationToGroup,
    ]
  );

  // "Load more" affordance: pages one more window of a group via the backend
  // items endpoint (first screen 5, +10 per page). `dimIcon` indents it to
  // align with rows inside a project folder.
  const renderLoadMore = (token: string, dimIcon = false) => (
    <div className={classNames('flex items-center', !collapsed && (dimIcon ? 'pl-34px' : 'pl-10px'))}>
      <span
        role='button'
        tabIndex={0}
        className='text-13px text-t-tertiary hover:text-t-primary cursor-pointer transition-colors py-4px select-none'
        onClick={() => loadMore(token)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            loadMore(token);
          }
        }}
      >
        {t('conversation.history.loadMore')}
      </span>
    </div>
  );

  const renderConversation = (conversation: TChatConversation, dimIcon = false) => {
    const rowProps = getConversationRowProps(conversation);
    return <ConversationRow key={conversation.id} {...rowProps} dimIcon={dimIcon} />;
  };

  // Collect all sortable IDs for the pinned section
  const pinnedIds = useMemo(() => pinnedConversations.map((c) => c.id), [pinnedConversations]);

  // Codex-style split: project folders (workspaces) on top, free conversations below.
  // Projects section: collect all workspace groups across timeline sections, ordered by recency.
  const projectGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: Array<{
      workspace: string;
      displayName: string;
      conversations: TChatConversation[];
      rows?: SidebarItem[];
      scopeToken?: string;
      hasMore?: boolean;
    }> = [];
    for (const section of timelineSections) {
      for (const item of section.items) {
        if (item.type === 'workspace' && item.workspaceGroup && !seen.has(item.workspaceGroup.workspace)) {
          seen.add(item.workspaceGroup.workspace);
          groups.push({
            workspace: item.workspaceGroup.workspace,
            displayName: item.workspaceGroup.display_name,
            conversations: item.workspaceGroup.conversations,
            rows: item.workspaceGroup.rows,
            scopeToken: item.workspaceGroup.scopeToken,
            hasMore: item.workspaceGroup.hasMore,
          });
        }
      }
    }
    return groups;
  }, [timelineSections]);

  // Conversations section: keep timeline grouping (today/yesterday/...) for the
  // flat "chats" group, rendering both free conversations and unbound teams (a
  // team not attached to a project is folded here by the backend).
  const chatsSections = useMemo(
    () =>
      timelineSections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) => (item.type === 'conversation' && item.conversation) || item.type === 'team'
          ),
        }))
        .filter((section) => section.items.length > 0),
    [timelineSections]
  );

  // Pinned rows in backend order (conversation ∪ team). Falls back to the
  // conversation-only projection for legacy callers that don't send `pinnedRows`.
  const pinnedRowItems: SidebarItem[] = useMemo(
    () => pinnedRows ?? pinnedConversations.map((conversation) => ({ type: 'conversation', conversation })),
    [pinnedRows, pinnedConversations]
  );

  // Custom groups: items placed in a group (by kind) render only inside that
  // group, so they are filtered out of the pinned/project/chats sections below.
  const groupedItemIds = useMemo(() => {
    const conversations = new Set<string>();
    const teams = new Set<string>();
    for (const group of customGroupsList) {
      for (const itemId of group.itemIds) {
        const parsed = parseGroupItemId(itemId);
        if (!parsed) continue;
        if (parsed.kind === 'conversation') conversations.add(parsed.id);
        else teams.add(parsed.id);
      }
    }
    return { conversations, teams };
  }, [customGroupsList]);

  const isGroupedSidebarItem = useCallback(
    (item: SidebarItem) =>
      item.type === 'conversation'
        ? groupedItemIds.conversations.has(item.conversation.id)
        : groupedItemIds.teams.has(item.team_id),
    [groupedItemIds]
  );

  const visiblePinnedRowItems = useMemo(
    () => pinnedRowItems.filter((item) => !isGroupedSidebarItem(item)),
    [pinnedRowItems, isGroupedSidebarItem]
  );

  const visibleProjectGroups = useMemo(
    () =>
      projectGroups
        .map((group) => ({
          ...group,
          rows: group.rows ? group.rows.filter((item) => !isGroupedSidebarItem(item)) : undefined,
          conversations: group.conversations.filter((c) => !groupedItemIds.conversations.has(c.id)),
        }))
        .filter((group) => (group.rows ? group.rows.length > 0 : group.conversations.length > 0)),
    [projectGroups, isGroupedSidebarItem, groupedItemIds]
  );

  const isGroupedTimelineItem = useCallback(
    (item: TimelineItem) =>
      item.type === 'conversation'
        ? Boolean(item.conversation && groupedItemIds.conversations.has(item.conversation.id))
        : item.type === 'team'
          ? Boolean(item.team && groupedItemIds.teams.has(item.team.team_id))
          : false,
    [groupedItemIds]
  );

  const visibleChatsSections = useMemo(
    () =>
      chatsSections
        .map((section) => ({ ...section, items: section.items.filter((item) => !isGroupedTimelineItem(item)) }))
        .filter((section) => section.items.length > 0),
    [chatsSections, isGroupedTimelineItem]
  );

  // Lookup maps over the *unfiltered* read model: grouped items no longer render
  // in their default sections, so the custom groups section resolves them here.
  const sidebarItemLookup = useMemo(() => {
    const conversations = new Map<string, TChatConversation>();
    const teams = new Map<string, SidebarTeamItem>();
    const indexConversation = (c?: TChatConversation) => {
      if (c) conversations.set(c.id, c);
    };
    const indexTeam = (team?: SidebarTeamItem) => {
      if (team) teams.set(team.team_id, team);
    };
    for (const item of pinnedRowItems) {
      if (item.type === 'conversation') indexConversation(item.conversation);
      else indexTeam(item);
    }
    for (const group of projectGroups) {
      for (const row of group.rows ??
        group.conversations.map((c) => ({ type: 'conversation' as const, conversation: c }))) {
        if (row.type === 'conversation') indexConversation(row.conversation);
        else indexTeam(row);
      }
    }
    for (const section of timelineSections) {
      for (const item of section.items) {
        if (item.type === 'conversation' && item.conversation) indexConversation(item.conversation);
        else if (item.type === 'team' && item.team) indexTeam(item.team);
      }
    }
    return { conversations, teams };
  }, [pinnedRowItems, projectGroups, timelineSections]);

  // Resolve a grouped item id (`conversation:<id>` / `team:<id>`) into its row.
  // The drag handle overlay comes from the sortable wrapper inside the section.
  const renderGroupItem = useCallback(
    (itemId: string, dragHandle: React.ReactNode | null) => {
      const parsed = parseGroupItemId(itemId);
      if (!parsed) return null;
      if (parsed.kind === 'conversation') {
        const conversation = sidebarItemLookup.conversations.get(parsed.id);
        if (!conversation) return null;
        return <ConversationRow {...getConversationRowProps(conversation)} dragHandle={dragHandle ?? undefined} />;
      }
      const team = sidebarItemLookup.teams.get(parsed.id);
      if (!team) return null;
      return renderTeamRow(team, false, dragHandle ?? undefined);
    },
    [sidebarItemLookup, getConversationRowProps, renderTeamRow]
  );

  const hasAnyContent =
    visiblePinnedRowItems.length > 0 ||
    visibleProjectGroups.length > 0 ||
    visibleChatsSections.length > 0 ||
    customGroupsList.length > 0;

  return (
    <>
      <Modal
        title={t('conversation.history.renameTitle')}
        visible={renameModalVisible}
        onOk={handleRenameConfirm}
        onCancel={handleRenameCancel}
        okText={t('conversation.history.saveName')}
        cancelText={t('conversation.history.cancelEdit')}
        confirmLoading={renameLoading}
        okButtonProps={{ disabled: !renameModalName.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameModalName}
          onChange={setRenameModalName}
          onPressEnter={handleRenameConfirm}
          placeholder={t('conversation.history.renamePlaceholder')}
          allowClear
        />
      </Modal>

      {batchMode && !collapsed && (
        <div className='px-12px pb-8px pt-2px sticky top-0 z-20 bg-[var(--bg-2)]'>
          <div className='rd-8px bg-fill-1 p-10px flex flex-col gap-8px border border-solid border-[rgba(var(--primary-6),0.08)]'>
            <div className='text-12px leading-18px text-t-secondary'>
              {t('conversation.history.selectedCount', { count: selectedCount })}
            </div>
            <div className='grid grid-cols-2 gap-6px'>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                onClick={handleToggleSelectAll}
              >
                {allSelected ? t('common.cancel') : t('conversation.history.selectAll')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                status='warning'
                onClick={handleBatchDelete}
              >
                {t('conversation.history.batchDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 移除项目确认弹窗 — 使用项目自家 AionModal + 圆角线框按钮（红色危险态） */}
      <AionModal
        visible={removeProjectTarget !== null}
        style={{ width: '400px' }}
        header={{
          title: t('conversation.history.removeProjectTitle'),
          showClose: true,
          style: { borderBottom: 'none' },
        }}
        onCancel={handleRemoveProjectCancel}
        footer={
          <div className='flex justify-end gap-12px pt-16px'>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
                cursor: removeProjectLoading ? 'not-allowed' : 'pointer',
                opacity: removeProjectLoading ? 0.55 : 1,
              }}
              onMouseEnter={(event) => {
                if (!removeProjectLoading) event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                if (!removeProjectLoading) event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={handleRemoveProjectCancel}
              disabled={removeProjectLoading}
            >
              {t('conversation.history.cancelDelete')}
            </button>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid rgb(var(--danger-6))',
                backgroundColor: 'transparent',
                color: 'rgb(var(--danger-6))',
                cursor: removeProjectLoading ? 'not-allowed' : 'pointer',
                opacity: removeProjectLoading ? 0.55 : 1,
              }}
              onMouseEnter={(event) => {
                if (!removeProjectLoading) {
                  event.currentTarget.style.backgroundColor = 'rgba(var(--danger-6), 0.08)';
                }
              }}
              onMouseLeave={(event) => {
                if (!removeProjectLoading) event.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={() => void handleRemoveProjectConfirm()}
              disabled={removeProjectLoading}
            >
              {removeProjectLoading ? t('conversation.history.deleting') : t('conversation.history.confirmDelete')}
            </button>
          </div>
        }
      >
        <div className='text-14px leading-22px text-t-secondary'>
          {t('conversation.history.removeProjectConfirm', {
            name: removeProjectTarget?.name ?? '',
            count:
              removeProjectTarget?.preview?.conversations_deleted ?? removeProjectTarget?.conversations.length ?? 0,
          })}
          {(removeProjectTarget?.preview?.teams_deleted ?? 0) > 0 &&
            ` ${t('conversation.history.removeProjectConfirmTeams', {
              teams: removeProjectTarget?.preview?.teams_deleted ?? 0,
            })}`}
          {(() => {
            // List *which* units go, not just how many, laid out like the sidebar:
            // a 置顶 section then a 项目 section, one icon+name row per unit. Pinned
            // members are hoisted into the top pinned group, so a count alone doesn't
            // tell the user who is where — the backend preview carries the names and
            // pinned flags (the frontend can't reconstruct project membership). The
            // per-unit icon is a generic per-kind mark (conversation / team); the
            // preview doesn't carry the model logo. Unpinned: at most 5 rows (with a
            // "+N more" tail). Pinned: all, since they were displaced away from this
            // project group and are easy to overlook.
            const items = removeProjectTarget?.preview?.items;
            if (!items?.length) return null;
            const UNPINNED_CAP = 5;
            const pinned = items.filter((i) => i.pinned);
            const unpinned = items.filter((i) => !i.pinned);
            const shownUnpinned = unpinned.slice(0, UNPINNED_CAP);
            const extraUnpinned = unpinned.length - shownUnpinned.length;
            const sectionLabelCls =
              'px-12px h-24px flex items-center text-13px font-600 tracking-[0.03em] text-t-secondary';
            const renderRow = (item: { name: string; pinned: boolean; kind: string }, idx: number) => (
              <SiderItem
                key={`${item.kind}-${idx}-${item.name}`}
                icon={
                  item.kind === 'team' ? (
                    <Peoples theme='outline' size='16' fill='currentColor' style={{ lineHeight: 0 }} />
                  ) : (
                    <MessageOne theme='outline' size='16' fill='currentColor' style={{ lineHeight: 0 }} />
                  )
                }
                name={item.name}
              />
            );
            return (
              <div className='mt-12px max-h-260px overflow-y-auto'>
                {pinned.length > 0 && (
                  <div>
                    <div className={sectionLabelCls}>{t('conversation.history.pinnedSection')}</div>
                    {pinned.map(renderRow)}
                  </div>
                )}
                {shownUnpinned.length > 0 && (
                  <div className={pinned.length > 0 ? 'mt-8px' : undefined}>
                    <div className={sectionLabelCls}>{t('conversation.history.projectsSection')}</div>
                    {shownUnpinned.map(renderRow)}
                    {extraUnpinned > 0 && (
                      <div className='px-12px h-28px flex items-center text-13px text-t-tertiary'>
                        {t('conversation.history.removeProjectListMore', { count: extraUnpinned })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </AionModal>

      <div>
        {/* L1: Custom groups section — user-organized collections of conversations
            and teams with drag-and-drop ordering (persisted client-side). */}
        <CustomGroupsSection collapsed={collapsed} disabled={batchMode || isMobile} renderItem={renderGroupItem} />

        {/* L1: Pinned section */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          {visiblePinnedRowItems.length > 0 && (
            <div className='min-w-0'>
              {!collapsed && <SectionLabel sectionKey='pinned' label={t('conversation.history.pinnedSection')} />}
              {!collapsedSections.has('pinned') && (
                <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
                  <div className='min-w-0'>
                    {visiblePinnedRowItems.map((item) => {
                      // Team rows render inline (non-draggable in PR-A — drag is PR-D);
                      // dnd-kit tolerates non-sortable children inside the context.
                      if (item.type === 'team') return renderTeamRow(item);
                      const props = getConversationRowProps(item.conversation);
                      return isDragEnabled ? (
                        <SortableConversationRow key={item.conversation.id} {...props} />
                      ) : (
                        <ConversationRow key={item.conversation.id} {...props} />
                      );
                    })}
                    {pinnedPaging?.hasMore && renderLoadMore('pinned')}
                  </div>
                </SortableContext>
              )}
            </div>
          )}
        </DndContext>

        {/* L1: Projects section — workspace folders, peer to conversations */}
        {visibleProjectGroups.length > 0 && (
          <div className='min-w-0'>
            {!collapsed && (
              <SectionLabel
                sectionKey='projects'
                label={t('conversation.history.projectsSection')}
                divider
                trailing={
                  visibleProjectGroups.some((group) => expandedWorkspaces.includes(group.workspace)) ? (
                    <Tooltip content={t('conversation.history.collapseAllProjects')} position='top'>
                      <span
                        role='button'
                        tabIndex={0}
                        aria-label={t('conversation.history.collapseAllProjects')}
                        className='flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px opacity-0 group-hover/label:opacity-100'
                        onClick={() =>
                          collapseAllWorkspaces(
                            projectGroups
                              .map((group) => group.scopeToken)
                              .filter((token): token is string => Boolean(token))
                          )
                        }
                      >
                        <FoldUpOne theme='outline' size='15' fill='currentColor' className='block leading-none' />
                      </span>
                    </Tooltip>
                  ) : undefined
                }
              />
            )}
            {!collapsedSections.has('projects') &&
              visibleProjectGroups.map((group) => {
                const projectMenu = (
                  <Menu
                    onClickMenuItem={(key) => {
                      if (key === 'remove') {
                        // `project:<id>` → real project (server-side "所见即所删");
                        // `dir:<key>` → pseudo-group with no backing project.
                        const projectId = group.scopeToken?.startsWith('project:')
                          ? group.scopeToken.slice('project:'.length)
                          : undefined;
                        handleRemoveProject(group.displayName, group.conversations, projectId);
                      }
                    }}
                  >
                    <Menu.Item key='remove' className='!text-[rgb(var(--danger-6))]'>
                      <span className='flex items-center gap-8px'>
                        <Delete theme='outline' size='14' />
                        {t('conversation.history.removeProject')}
                      </span>
                    </Menu.Item>
                  </Menu>
                );
                return (
                  <div key={group.workspace} className='min-w-0'>
                    <WorkspaceCollapse
                      expanded={expandedWorkspaces.includes(group.workspace)}
                      onToggle={() => handleToggleWorkspace(group.workspace, group.scopeToken)}
                      siderCollapsed={collapsed}
                      stickyHeader
                      stickyTop={28}
                      header={
                        <span className='text-14px font-[500] truncate flex-1 text-t-primary min-w-0'>
                          {group.displayName}
                        </span>
                      }
                      trailing={
                        <span className='flex items-center gap-6px'>
                          <Dropdown
                            trigger='click'
                            position='br'
                            getPopupContainer={() => document.body}
                            unmountOnExit={false}
                            droplist={
                              <Menu
                                onClickMenuItem={(key) => {
                                  if (key === 'newConversation') {
                                    void navigate('/guid', { state: { workspace: group.workspace } });
                                  } else if (key === 'newTeam') {
                                    setTeamCreateWorkspace(group.workspace);
                                  }
                                }}
                              >
                                <Menu.Item key='newConversation'>
                                  <span className='flex items-center gap-8px'>
                                    <MessageOne theme='outline' size='14' />
                                    {t('conversation.history.newConversationInProject')}
                                  </span>
                                </Menu.Item>
                                <Menu.Item key='newTeam'>
                                  <span className='flex items-center gap-8px'>
                                    <Peoples theme='outline' size='14' />
                                    {t('conversation.history.newTeamInProject')}
                                  </span>
                                </Menu.Item>
                              </Menu>
                            }
                          >
                            <span
                              role='button'
                              tabIndex={0}
                              aria-label={t('conversation.history.projectCreateMenu')}
                              className={classNames(
                                'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                                isMobile ? 'flex' : 'hidden group-hover:flex'
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Plus theme='outline' size='14' fill='currentColor' className='block leading-none' />
                            </span>
                          </Dropdown>
                          <Dropdown
                            droplist={projectMenu}
                            trigger='click'
                            position='br'
                            getPopupContainer={() => document.body}
                            unmountOnExit={false}
                          >
                            <span
                              aria-label='Project actions'
                              className={classNames(
                                'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                                isMobile ? 'flex' : 'hidden group-hover:flex'
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreOne theme='outline' size='14' fill='currentColor' className='block leading-none' />
                            </span>
                          </Dropdown>
                        </span>
                      }
                    >
                      <div className={classNames('flex flex-col min-w-0', { 'mt-1px': !collapsed })}>
                        {(
                          group.rows ??
                          group.conversations.map(
                            (conversation) => ({ type: 'conversation', conversation }) as SidebarItem
                          )
                        ).map((item) =>
                          item.type === 'team' ? renderTeamRow(item, true) : renderConversation(item.conversation, true)
                        )}
                        {group.hasMore && group.scopeToken && renderLoadMore(group.scopeToken, true)}
                      </div>
                    </WorkspaceCollapse>
                  </div>
                );
              })}
          </div>
        )}

        {/* L1: Conversations section — peer to projects, internally split by timeline.
            Header is always rendered (when expanded) so the "new team" entry stays
            reachable even on an empty library; the body is conditional. */}
        <div className='min-w-0'>
          {!collapsed && (
            <SectionLabel
              sectionKey='conversations'
              label={t('conversation.history.conversationsSection')}
              divider
              trailing={
                <Tooltip content={t('team.sider.createTeam')} position='top'>
                  {/* [E2E SYNC] data-testid="team-create-btn" 是 E2E 测试入口 selector，不得删改。
                      如需修改，必须同步更新 tests/e2e/cases/teams/team-create.e2e.ts。 */}
                  <div
                    data-testid='team-create-btn'
                    className='-mr-4px size-20px rd-4px flex items-center justify-center hover:bg-fill-4 transition-all shrink-0 cursor-pointer text-t-secondary hover:text-t-primary'
                    onClick={() => setGlobalTeamCreateVisible(true)}
                  >
                    <Plus
                      theme='outline'
                      size='14'
                      fill='currentColor'
                      className='block leading-none'
                      style={{ lineHeight: 0 }}
                    />
                  </div>
                </Tooltip>
              }
            />
          )}
          {!collapsedSections.has('conversations') &&
            visibleChatsSections.map((section) => (
              <div key={section.timeline} className='min-w-0'>
                {!collapsed && visibleChatsSections.length > 1 && (
                  <div className='flex items-center px-16px h-24px select-none'>
                    <span className='text-12px text-t-secondary font-[500] leading-none'>{section.timeline}</span>
                  </div>
                )}
                {section.items.map((item) =>
                  item.type === 'team' && item.team
                    ? renderTeamRow(item.team)
                    : item.conversation
                      ? renderConversation(item.conversation)
                      : null
                )}
              </div>
            ))}
          {!collapsedSections.has('conversations') && chatsPaging?.hasMore && renderLoadMore('chats')}
        </div>

        {!hasAnyContent && (
          <div className='py-48px flex-center'>
            <Empty description={t('conversation.history.noHistory')} />
          </div>
        )}
      </div>

      {/* Team create: project "+" prefills that project's workspace; the
          conversations-header "+" (globalTeamCreateVisible) creates an unbound
          team (no initialWorkspace). One modal serves both entries. */}
      <TeamCreateModal
        visible={teamCreateWorkspace !== null || globalTeamCreateVisible}
        initialWorkspace={teamCreateWorkspace ?? undefined}
        onClose={() => {
          setTeamCreateWorkspace(null);
          setGlobalTeamCreateVisible(false);
        }}
        onCreated={(team) => {
          setTeamCreateWorkspace(null);
          setGlobalTeamCreateVisible(false);
          void navigate(`/team/${team.id}`);
        }}
      />

      {/* Team rename (single instance, shared by all folded-in team rows). */}
      <Modal
        title={t('team.sider.renameTitle')}
        visible={teamRenameModal.visible}
        onOk={teamRenameModal.confirm}
        onCancel={teamRenameModal.cancel}
        okText={t('team.sider.renameOk')}
        cancelText={t('team.sider.renameCancel')}
        confirmLoading={teamRenameModal.loading}
        okButtonProps={{ disabled: !teamRenameModal.name.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={teamRenameModal.name}
          onChange={teamRenameModal.setName}
          onPressEnter={teamRenameModal.confirm}
          placeholder={t('team.sider.renamePlaceholder')}
          allowClear
        />
      </Modal>
    </>
  );
};

export default WorkspaceGroupedHistory;
