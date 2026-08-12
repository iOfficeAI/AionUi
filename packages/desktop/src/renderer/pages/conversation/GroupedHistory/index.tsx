/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { SidebarItem, SidebarTeamItem } from '@/common/types/sidebar';
import AionModal from '@/renderer/components/base/AionModal';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCronJobsMap } from '@/renderer/pages/cron';
import { restrictToVerticalAxis } from '@/renderer/utils/ui/dndModifiers';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Empty, Input, Menu, Modal, Tooltip } from '@arco-design/web-react';
import { Delete, MoreOne, Plus, Right, MessageOne, Peoples, FoldUpOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import SiderItem from '@renderer/components/layout/Sider/SiderItem';
import TeamCreateModal from '@renderer/pages/team/components/TeamCreateModal';
import WorkspaceCollapse from '../components/WorkspaceCollapse';
import ConversationRow from './ConversationRow';
import SortableSidebarRow from './SortableSidebarRow';
import TeamRow from './TeamRow';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useConversationActions } from './hooks/useConversationActions';
import { useConversations } from './hooks/useConversations';
import { sortableId, useDragAndDrop } from './hooks/useDragAndDrop';
import { useTeamRows } from './hooks/useTeamRows';
import type { ConversationRowProps, WorkspaceGroupedHistoryProps } from './types';

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
        />
      );
    },
    [resolveTeamRow, collapsed, tooltipEnabled]
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

  // Pinned rows in backend order (conversation ∪ team). Falls back to the
  // conversation-only projection for legacy callers that don't send `pinnedRows`.
  const pinnedRowItems: SidebarItem[] = useMemo(
    () => pinnedRows ?? pinnedConversations.map((conversation) => ({ type: 'conversation', conversation })),
    [pinnedRows, pinnedConversations]
  );

  const { sensors, handleDragEnd, isDragEnabled } = useDragAndDrop({
    pinnedRows: pinnedRowItems,
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

  // Sortable IDs for the pinned section, in backend order over the full union
  // (conversation ∪ team). Composite ids keep the two id spaces from colliding.
  const pinnedIds = useMemo(
    () =>
      pinnedRowItems.map((item) =>
        item.type === 'team' ? sortableId('team', item.team_id) : sortableId('conversation', item.conversation.id)
      ),
    [pinnedRowItems]
  );

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

  const hasAnyContent = pinnedRowItems.length > 0 || projectGroups.length > 0 || chatsSections.length > 0;

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
        {/* L1: Pinned section */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          {pinnedRowItems.length > 0 && (
            <div className='min-w-0'>
              {!collapsed && <SectionLabel sectionKey='pinned' label={t('conversation.history.pinnedSection')} />}
              {!collapsedSections.has('pinned') && (
                <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
                  <div className='min-w-0'>
                    {pinnedRowItems.map((item) => {
                      // Pinned group is a conversation ∪ team union — both kinds drag
                      // (PR-D) through the shared SortableSidebarRow, so they get the
                      // identical hover-reveal 6-dot handle. The handle is the only
                      // drag activator, so a plain click keeps its normal meaning.
                      if (item.type === 'team') {
                        return isDragEnabled ? (
                          <SortableSidebarRow
                            key={sortableId('team', item.team_id)}
                            id={sortableId('team', item.team_id)}
                          >
                            {(dragHandle) => renderTeamRow(item, false, dragHandle)}
                          </SortableSidebarRow>
                        ) : (
                          renderTeamRow(item)
                        );
                      }
                      const props = getConversationRowProps(item.conversation);
                      return isDragEnabled ? (
                        <SortableSidebarRow
                          key={item.conversation.id}
                          id={sortableId('conversation', item.conversation.id)}
                          disabled={props.batchMode}
                          data={{ type: 'conversation', conversation: item.conversation }}
                        >
                          {(dragHandle) => <ConversationRow {...props} dragHandle={dragHandle} />}
                        </SortableSidebarRow>
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
        {projectGroups.length > 0 && (
          <div className='min-w-0'>
            {!collapsed && (
              <SectionLabel
                sectionKey='projects'
                label={t('conversation.history.projectsSection')}
                divider
                trailing={
                  projectGroups.some((group) => expandedWorkspaces.includes(group.workspace)) ? (
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
              projectGroups.map((group) => {
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
            chatsSections.map((section) => (
              <div key={section.timeline} className='min-w-0'>
                {!collapsed && chatsSections.length > 1 && (
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
