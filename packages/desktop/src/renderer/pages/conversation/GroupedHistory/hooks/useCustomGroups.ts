import { useCallback, useMemo } from 'react';
import type { SidebarCustomGroup, SidebarCustomGroupItemKind } from '@/common/types/sidebar';
import { configService } from '@/common/config/configService';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import {
  createCustomGroup,
  deleteCustomGroup,
  findGroupForItem,
  isItemInAnyGroup,
  moveItemToGroup,
  moveItemToGroupAt,
  normalizeCustomGroups,
  renameCustomGroup,
  reorderGroupItems,
  reorderGroups,
  toggleGroupCollapsed,
} from '@/renderer/pages/conversation/GroupedHistory/utils/customGroupHelpers';

/**
 * Reads/writes the user-defined sidebar groups (persisted under the
 * `sidebar.customGroups` config key). All mutators return fresh arrays so the
 * renderer updates reactively, and every change is immediately persisted via
 * the config service (same pattern as `assistants.enabledOrder`).
 *
 * Mutations are applied against the freshest persisted value (via
 * `configService.get`) rather than the last rendered `groups`, so rapid
 * drag-and-drop updates that arrive faster than re-renders cannot clobber each
 * other.
 */
export function useCustomGroups() {
  const [rawGroups, setGroups] = useConfig('sidebar.customGroups');
  const groups = useMemo(() => normalizeCustomGroups(rawGroups), [rawGroups]);

  const readGroups = useCallback(() => normalizeCustomGroups(configService.get('sidebar.customGroups')), []);

  /** Applies `updater` to the freshest persisted groups and persists the result. */
  const applyGroups = useCallback(
    (updater: (groups: SidebarCustomGroup[]) => SidebarCustomGroup[]) => {
      void setGroups(updater(readGroups()));
    },
    [setGroups, readGroups]
  );

  const createGroup = useCallback(
    (name: string) => {
      applyGroups((current) => [...current, createCustomGroup(name)]);
    },
    [applyGroups]
  );

  const renameGroup = useCallback(
    (id: string, name: string) => {
      applyGroups((current) => renameCustomGroup(current, id, name));
    },
    [applyGroups]
  );

  const deleteGroup = useCallback(
    (id: string) => {
      applyGroups((current) => deleteCustomGroup(current, id));
    },
    [applyGroups]
  );

  const toggleCollapsed = useCallback(
    (id: string) => {
      applyGroups((current) => toggleGroupCollapsed(current, id));
    },
    [applyGroups]
  );

  /** Moves an item into a group (appended), or out of all groups when `targetGroupId` is null. */
  const moveItem = useCallback(
    (kind: SidebarCustomGroupItemKind, id: string, targetGroupId: string | null) => {
      applyGroups((current) => moveItemToGroup(current, kind, id, targetGroupId));
    },
    [applyGroups]
  );

  /** Moves an item into a group at an exact index (cross-group drag-and-drop). */
  const moveItemAt = useCallback(
    (kind: SidebarCustomGroupItemKind, id: string, targetGroupId: string | null, targetIndex: number) => {
      applyGroups((current) => moveItemToGroupAt(current, kind, id, targetGroupId, targetIndex));
    },
    [applyGroups]
  );

  /** Persists a group's reordered item list (within-group drag-and-drop). */
  const reorderItems = useCallback(
    (groupId: string, newItemIds: string[]) => {
      applyGroups((current) => reorderGroupItems(current, groupId, newItemIds));
    },
    [applyGroups]
  );

  /** Persists the reordered group list (group drag-and-drop). */
  const reorderAll = useCallback(
    (newGroupIds: string[]) => {
      applyGroups((current) => reorderGroups(current, newGroupIds));
    },
    [applyGroups]
  );

  const isGrouped = useCallback(
    (kind: SidebarCustomGroupItemKind, id: string) => isItemInAnyGroup(groups, kind, id),
    [groups]
  );

  const groupOfItem = useCallback(
    (kind: SidebarCustomGroupItemKind, id: string) => findGroupForItem(groups, kind, id),
    [groups]
  );

  return {
    groups,
    applyGroups,
    createGroup,
    renameGroup,
    deleteGroup,
    toggleCollapsed,
    moveItem,
    moveItemAt,
    reorderItems,
    reorderAll,
    isGrouped,
    groupOfItem,
  };
}
