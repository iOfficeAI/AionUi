import type { SidebarCustomGroup, SidebarCustomGroupItemKind } from '@/common/types/sidebar';

/** Encodes a sidebar item (conversation or team) as an opaque group item id. */
export function makeGroupItemId(kind: SidebarCustomGroupItemKind, id: string): string {
  return `${kind}:${id}`;
}

/** Splits an encoded group item id back into `{ kind, id }` (or null when malformed). */
export function parseGroupItemId(encoded: string): { kind: SidebarCustomGroupItemKind; id: string } | null {
  const sep = encoded.indexOf(':');
  if (sep <= 0) return null;
  const kind = encoded.slice(0, sep);
  if (kind !== 'conversation' && kind !== 'team') return null;
  const id = encoded.slice(sep + 1);
  if (!id) return null;
  return { kind, id };
}

/** Creates a fresh group with a stable id. Id is never regenerated on rename. */
export function createCustomGroup(name: string, id: string = crypto.randomUUID()): SidebarCustomGroup {
  return { id, name: name.trim() || 'Untitled group', itemIds: [], collapsed: false };
}

export function renameCustomGroup(groups: SidebarCustomGroup[], id: string, name: string): SidebarCustomGroup[] {
  const trimmed = name.trim();
  if (!trimmed) return groups;
  return groups.map((group) => (group.id === id ? { ...group, name: trimmed } : group));
}

export function deleteCustomGroup(groups: SidebarCustomGroup[], id: string): SidebarCustomGroup[] {
  return groups.filter((group) => group.id !== id);
}

export function toggleGroupCollapsed(groups: SidebarCustomGroup[], id: string): SidebarCustomGroup[] {
  return groups.map((group) => (group.id === id ? { ...group, collapsed: !group.collapsed } : group));
}

/**
 * Moves an item into `targetGroupId`, or removes it from every group when
 * `targetGroupId` is null. Appending keeps "newest added last" semantics.
 */
export function moveItemToGroup(
  groups: SidebarCustomGroup[],
  kind: SidebarCustomGroupItemKind,
  id: string,
  targetGroupId: string | null
): SidebarCustomGroup[] {
  const itemId = makeGroupItemId(kind, id);
  const withoutItem = groups.map((group) => ({
    ...group,
    itemIds: group.itemIds.filter((existing) => existing !== itemId),
  }));
  if (!targetGroupId) return withoutItem;
  return withoutItem.map((group) =>
    group.id === targetGroupId ? { ...group, itemIds: [...group.itemIds, itemId] } : group
  );
}

/** Returns true when the item currently lives in any custom group. */
export function isItemInAnyGroup(groups: SidebarCustomGroup[], kind: SidebarCustomGroupItemKind, id: string): boolean {
  const itemId = makeGroupItemId(kind, id);
  return groups.some((group) => group.itemIds.includes(itemId));
}

/** Returns the id of the group holding the item, or null. */
export function findGroupForItem(
  groups: SidebarCustomGroup[],
  kind: SidebarCustomGroupItemKind,
  id: string
): string | null {
  const itemId = makeGroupItemId(kind, id);
  return groups.find((group) => group.itemIds.includes(itemId))?.id ?? null;
}

/**
 * Moves an item into `targetGroupId` at `targetIndex` (index clamped to the
 * target group's bounds), removing it from its current group first. A null
 * `targetGroupId` removes the item from every group. Used by cross-group
 * drag-and-drop which knows the exact drop position.
 */
export function moveItemToGroupAt(
  groups: SidebarCustomGroup[],
  kind: SidebarCustomGroupItemKind,
  id: string,
  targetGroupId: string | null,
  targetIndex: number
): SidebarCustomGroup[] {
  const itemId = makeGroupItemId(kind, id);
  const withoutItem = groups.map((group) => ({
    ...group,
    itemIds: group.itemIds.filter((existing) => existing !== itemId),
  }));
  if (!targetGroupId) return withoutItem;
  return withoutItem.map((group) => {
    if (group.id !== targetGroupId) return group;
    const itemIds = [...group.itemIds];
    const index = Math.max(0, Math.min(targetIndex, itemIds.length));
    itemIds.splice(index, 0, itemId);
    return { ...group, itemIds };
  });
}

/** Prefix for "move to group" menu keys (`moveToGroup:<groupId>`). */
export const MOVE_TO_GROUP_PREFIX = 'moveToGroup:';

/** Builds the menu key for a target group; a null groupId means "remove from group". */
export function makeMoveToGroupKey(groupId: string | null): string {
  return groupId ? `${MOVE_TO_GROUP_PREFIX}${groupId}` : MOVE_TO_GROUP_PREFIX;
}

/** Parses a "move to group" menu key back into a group id (null = remove from group). */
export function parseMoveToGroupKey(key: string): string | null {
  if (!key.startsWith(MOVE_TO_GROUP_PREFIX)) return null;
  return key.slice(MOVE_TO_GROUP_PREFIX.length) || null;
}

/** Replaces a group's ordered item ids (used after within-group drag-and-drop). */
export function reorderGroupItems(
  groups: SidebarCustomGroup[],
  groupId: string,
  newItemIds: string[]
): SidebarCustomGroup[] {
  return groups.map((group) => (group.id === groupId ? { ...group, itemIds: newItemIds } : group));
}

/** Reorders groups themselves (used after group drag-and-drop). */
export function reorderGroups(groups: SidebarCustomGroup[], newGroupIds: string[]): SidebarCustomGroup[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const result: SidebarCustomGroup[] = [];
  for (const id of newGroupIds) {
    const group = byId.get(id);
    if (group) result.push(group);
  }
  // Append any groups missing from the ordered ids (safety net).
  for (const group of groups) {
    if (!newGroupIds.includes(group.id)) result.push(group);
  }
  return result;
}

/**
 * Normalizes raw persisted data into a safe `SidebarCustomGroup[]`:
 * drops malformed entries, dedupes item ids and enforces `itemIds` ordering.
 */
export function normalizeCustomGroups(raw: unknown): SidebarCustomGroup[] {
  if (!Array.isArray(raw)) return [];
  const seenItemIds = new Set<string>();
  const seenGroupIds = new Set<string>();
  const groups: SidebarCustomGroup[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const maybe = entry as Record<string, unknown>;
    if (typeof maybe.id !== 'string' || !maybe.id) continue;
    if (seenGroupIds.has(maybe.id)) continue;
    seenGroupIds.add(maybe.id);
    if (typeof maybe.name !== 'string' || !maybe.name.trim()) continue;
    const itemIds: string[] = [];
    if (Array.isArray(maybe.itemIds)) {
      for (const itemId of maybe.itemIds) {
        if (typeof itemId !== 'string') continue;
        if (!parseGroupItemId(itemId)) continue;
        if (seenItemIds.has(itemId)) continue;
        seenItemIds.add(itemId);
        itemIds.push(itemId);
      }
    }
    groups.push({
      id: maybe.id,
      name: maybe.name.trim(),
      collapsed: maybe.collapsed === true,
      itemIds,
    });
  }
  return groups;
}
