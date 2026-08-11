import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SidebarCustomGroup } from '@/common/types/sidebar';
import { configService } from '@/common/config/configService';
import { DeleteOne, Drag, EditOne, Folder, Plus, Right } from '@icon-park/react';
import { Input, Modal, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCustomGroups } from './hooks/useCustomGroups';
import { normalizeCustomGroups, parseGroupItemId } from './utils/customGroupHelpers';

const GROUP_DRAG_PREFIX = 'group:';
const groupDragId = (groupId: string) => `${GROUP_DRAG_PREFIX}${groupId}`;
const isGroupDragId = (id: string) => id.startsWith(GROUP_DRAG_PREFIX);

/** Reads the freshest persisted groups without a re-render (dragOver fires faster than renders). */
function configServiceGetGroups(): SidebarCustomGroup[] {
  return normalizeCustomGroups(configService.get('sidebar.customGroups'));
}

export type CustomGroupsSectionProps = {
  /** Sider mini-mode: the section is hidden entirely (group UIs need the expanded layout). */
  collapsed: boolean;
  /** Mobile / batch mode: rows render but drag-and-drop is disabled. */
  disabled?: boolean;
  /**
   * Resolves a grouped item id (`conversation:<id>` / `team:<id>`) into its row.
   * `dragHandle` is the drag handle overlay supplied by the sortable wrapper —
   * rows must place it over their leading icon on hover.
   */
  renderItem: (itemId: string, dragHandle: React.ReactNode | null) => React.ReactNode;
};

/**
 * User-defined sidebar groups ("custom groups"): conversations and teams can be
 * organized into named, collapsible groups with full drag-and-drop ordering —
 * within a group, across groups, and between groups themselves. Everything is
 * persisted through the `sidebar.customGroups` config key via `useCustomGroups`,
 * mirroring how the pinned section persists ordering via `user_order`.
 */
const CustomGroupsSection: React.FC<CustomGroupsSectionProps> = ({ collapsed, disabled = false, renderItem }) => {
  const { t } = useTranslation();
  const {
    groups,
    createGroup,
    renameGroup,
    deleteGroup,
    toggleCollapsed,
    applyGroups,
    moveItemAt,
    reorderItems,
    reorderAll,
  } = useCustomGroups();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  // Guards against container oscillation while an item crosses groups: only
  // react to a *changed* target container (dnd-kit multi-container recipe).
  const lastOverContainerRef = React.useRef<string | null>(null);

  const findGroupOfItem = useCallback(
    (itemId: string, source: SidebarCustomGroup[] = groups) => source.find((g) => g.itemIds.includes(itemId))?.id,
    [groups]
  );

  const commitCreate = useCallback(() => {
    const name = newGroupName.trim();
    setCreating(false);
    setNewGroupName('');
    if (name) createGroup(name);
  }, [createGroup, newGroupName]);

  const commitRename = useCallback(() => {
    if (!editingId) return;
    const name = editingName.trim();
    setEditingId(null);
    setEditingName('');
    if (name) renameGroup(editingId, name);
  }, [editingId, editingName, renameGroup]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      lastOverContainerRef.current = null;
      const activeId = String(event.active.id);
      setActiveGroupId(
        isGroupDragId(activeId) ? activeId.slice(GROUP_DRAG_PREFIX.length) : (findGroupOfItem(activeId) ?? null)
      );
    },
    [findGroupOfItem]
  );

  /** Cross-group movement happens live during the drag (like the dnd-kit multi-container recipe). */
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (isGroupDragId(activeId) || activeId === overId) return;
      // Read the freshest persisted groups: dragOver fires many times per
      // second, faster than React re-renders propagate.
      const current = configServiceGetGroups();
      const fromGroupId = findGroupOfItem(activeId, current);
      if (!fromGroupId) return;
      const toGroupId = isGroupDragId(overId)
        ? overId.slice(GROUP_DRAG_PREFIX.length)
        : findGroupOfItem(overId, current);
      if (!toGroupId || toGroupId === fromGroupId) return;
      if (lastOverContainerRef.current === toGroupId) return;
      lastOverContainerRef.current = toGroupId;
      const parsed = parseGroupItemId(activeId);
      if (!parsed) return;
      const toGroup = current.find((g) => g.id === toGroupId);
      const overIndex = toGroup ? toGroup.itemIds.indexOf(overId) : -1;
      const targetIndex = overIndex >= 0 ? overIndex : (toGroup?.itemIds.length ?? 0);
      moveItemAt(parsed.kind, parsed.id, toGroupId, targetIndex);
    },
    [findGroupOfItem, moveItemAt]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      lastOverContainerRef.current = null;
      setActiveGroupId(null);
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;
      const current = configServiceGetGroups();

      // Group reordering: dragging a group header rearranges the group list.
      if (isGroupDragId(activeId)) {
        const activeIndex = current.findIndex((g) => groupDragId(g.id) === activeId);
        let overIndex = current.findIndex((g) => groupDragId(g.id) === overId);
        if (overIndex === -1) {
          const overGroupId = findGroupOfItem(overId, current);
          overIndex = overGroupId ? current.findIndex((g) => g.id === overGroupId) : -1;
        }
        if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return;
        reorderAll(arrayMove(current, activeIndex, overIndex).map((g) => g.id));
        return;
      }

      // Item reordering / drop.
      const fromGroupId = findGroupOfItem(activeId, current);
      if (!fromGroupId) return;
      const parsed = parseGroupItemId(activeId);
      if (!parsed) return;
      const fromGroup = current.find((g) => g.id === fromGroupId);
      if (!fromGroup) return;
      const fromIndex = fromGroup.itemIds.indexOf(activeId);
      if (fromIndex === -1) return;

      // Dropped onto a group header (or its container): move to that group's end.
      if (isGroupDragId(overId)) {
        const toGroupId = overId.slice(GROUP_DRAG_PREFIX.length);
        if (toGroupId !== fromGroupId) moveItemAt(parsed.kind, parsed.id, toGroupId, Number.MAX_SAFE_INTEGER);
        return;
      }

      const toGroupId = findGroupOfItem(overId, current);
      if (!toGroupId) return;
      const toGroup = current.find((g) => g.id === toGroupId);
      if (!toGroup) return;
      const toIndex = toGroup.itemIds.indexOf(overId);

      if (fromGroupId === toGroupId) {
        if (toIndex === -1 || fromIndex === toIndex) return;
        reorderItems(fromGroupId, arrayMove(fromGroup.itemIds, fromIndex, toIndex));
      } else {
        if (toIndex === -1) return;
        // Drop position is the slot of the hovered item; moveItemToGroupAt
        // removes first, so the target index applies to the already-removed list.
        moveItemAt(parsed.kind, parsed.id, toGroupId, toIndex);
      }
    },
    [findGroupOfItem, moveItemAt, reorderAll, reorderItems]
  );

  const sectionLabel = t('conversation.history.customGroups');

  if (collapsed) return null;

  return (
    <div className='min-w-0' data-testid='custom-groups-section'>
      {/* Section header — "Groups" + new-group affordance */}
      <div
        className='group/label sider-section-label relative flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-8px cursor-pointer bg-[var(--bg-2)]'
        onClick={() => setCreating((v) => !v)}
      >
        <span className='text-14px text-t-secondary sider-section-title group-hover/label:text-t-primary transition-colors font-600 tracking-[0.03em] leading-none'>
          {sectionLabel}
        </span>
        <Tooltip content={t('conversation.history.newGroup')} position='top'>
          <div className='ml-auto' onClick={(e) => e.stopPropagation()}>
            <span
              role='button'
              tabIndex={0}
              aria-label={t('conversation.history.newGroup')}
              data-testid='custom-group-new'
              className='flex items-center justify-center text-t-tertiary cursor-pointer opacity-0 group-hover/label:opacity-100 transition-opacity'
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  setCreating(true);
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                setCreating(true);
              }}
            >
              <Plus theme='outline' size='14' className='block leading-none' />
            </span>
          </div>
        </Tooltip>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveGroupId(null)}
      >
        {creating && (
          <div className='flex items-center gap-6px px-12px h-30px'>
            <Input
              size='mini'
              autoFocus
              value={newGroupName}
              placeholder={t('conversation.history.groupNamePlaceholder')}
              onChange={setNewGroupName}
              onPressEnter={commitCreate}
              onBlur={commitCreate}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <SortableContext items={groups.map((g) => groupDragId(g.id))} strategy={verticalListSortingStrategy}>
          {groups.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              disabled={disabled}
              dimmed={activeGroupId !== null && group.id !== activeGroupId}
              editing={editingId === group.id}
              editingName={editingName}
              onEditingNameChange={setEditingName}
              onCommitRename={commitRename}
              onStartEdit={() => {
                setEditingId(group.id);
                setEditingName(group.name);
              }}
              onToggle={() => toggleCollapsed(group.id)}
              onDelete={() => {
                Modal.confirm({
                  title: t('conversation.history.deleteGroup'),
                  content: t('conversation.history.deleteGroupConfirm', { name: group.name }),
                  okText: t('conversation.history.deleteGroup'),
                  cancelText: t('common.cancel'),
                  onOk: () => deleteGroup(group.id),
                });
              }}
              renderItem={renderItem}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};

type GroupRowProps = {
  group: SidebarCustomGroup;
  disabled: boolean;
  /** Another group is being dragged: visually de-emphasize this one. */
  dimmed: boolean;
  editing: boolean;
  editingName: string;
  onEditingNameChange: (value: string) => void;
  onCommitRename: () => void;
  onStartEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  renderItem: CustomGroupsSectionProps['renderItem'];
};

const GroupRow: React.FC<GroupRowProps> = ({
  group,
  disabled,
  dimmed,
  editing,
  editingName,
  onEditingNameChange,
  onCommitRename,
  onStartEdit,
  onToggle,
  onDelete,
  renderItem,
}) => {
  const { t } = useTranslation();
  const expanded = !group.collapsed;

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: groupDragId(group.id),
    disabled,
    data: { type: 'custom-group', groupId: group.id },
  });

  const groupDragHandle = (
    <span
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      role='button'
      tabIndex={0}
      aria-label={t('conversation.history.groupDrag')}
      data-testid={`custom-group-drag-${group.id}`}
      className='flex items-center justify-center text-t-tertiary cursor-grab opacity-0 group-hover/custom-group:opacity-100 transition-opacity'
      style={{ touchAction: 'none', lineHeight: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      <Drag theme='outline' size='14' className='block' />
    </span>
  );

  return (
    <div
      ref={setNodeRef}
      className={classNames('group/custom-group min-w-0 relative transition-opacity duration-150', {
        'z-10': isDragging,
        'opacity-50': dimmed,
      })}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      {/* Group header: chevron + name + hover actions (drag / rename / delete) */}
      <div className='flex items-center gap-4px h-28px px-12px cursor-pointer select-none' onClick={onToggle}>
        <span
          className={classNames(
            'flex items-center justify-center text-t-tertiary shrink-0 transition-transform duration-150',
            { 'rotate-90': expanded }
          )}
          style={{ lineHeight: 0 }}
        >
          <Right theme='outline' size={12} className='block' />
        </span>
        {editing ? (
          <Input
            size='mini'
            autoFocus
            value={editingName}
            onChange={onEditingNameChange}
            onPressEnter={onCommitRename}
            onBlur={onCommitRename}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className='flex-1 min-w-0 truncate text-14px text-t-primary'>{group.name}</span>
        )}
        <div className='ml-auto flex items-center gap-6px shrink-0' onClick={(e) => e.stopPropagation()}>
          {groupDragHandle}
          <span
            role='button'
            tabIndex={0}
            aria-label={t('conversation.history.renameGroup')}
            data-testid={`custom-group-rename-${group.id}`}
            className='flex items-center justify-center text-t-tertiary cursor-pointer opacity-0 group-hover/custom-group:opacity-100 transition-opacity'
            style={{ lineHeight: 0 }}
            onClick={onStartEdit}
          >
            <EditOne theme='outline' size='14' className='block' />
          </span>
          <span
            role='button'
            tabIndex={0}
            aria-label={t('conversation.history.deleteGroup')}
            data-testid={`custom-group-delete-${group.id}`}
            className='flex items-center justify-center text-t-tertiary cursor-pointer opacity-0 group-hover/custom-group:opacity-100 transition-opacity'
            style={{ lineHeight: 0 }}
            onClick={onDelete}
          >
            <DeleteOne theme='outline' size='14' className='block' />
          </span>
        </div>
      </div>

      {expanded && (
        <SortableContext items={group.itemIds} strategy={verticalListSortingStrategy}>
          {group.itemIds.map((itemId) => (
            <GroupItemRow key={itemId} itemId={itemId} groupId={group.id} disabled={disabled} renderItem={renderItem} />
          ))}
        </SortableContext>
      )}
    </div>
  );
};

type GroupItemRowProps = {
  itemId: string;
  groupId: string;
  disabled: boolean;
  renderItem: CustomGroupsSectionProps['renderItem'];
};

const GroupItemRow: React.FC<GroupItemRowProps> = ({ itemId, groupId, disabled, renderItem }) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
    disabled,
    data: { type: 'custom-group-item', groupId, itemId },
  });

  const dragHandle = disabled ? null : (
    <span
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      role='button'
      tabIndex={0}
      aria-label={t('conversation.history.reorderGroupItem')}
      data-testid={`custom-group-item-drag-${itemId}`}
      className='absolute inset-0 flex-center text-t-secondary cursor-grab opacity-0 group-hover:opacity-100 transition-opacity'
      style={{ touchAction: 'none', lineHeight: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      <Drag theme='outline' size='14' className='block' />
    </span>
  );

  const row = renderItem(itemId, dragHandle);
  if (row === null) return null;

  return (
    <div
      ref={setNodeRef}
      className={classNames('relative min-w-0', { 'z-10': isDragging })}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.72 : undefined,
      }}
    >
      {row}
    </div>
  );
};

export default CustomGroupsSection;
