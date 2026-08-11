/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { arrayMove } from '@dnd-kit/sortable';

export const readStoredSiderOrder = (storageKey: string): string[] => {
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export const writeStoredSiderOrder = (storageKey: string, ids: string[]): void => {
  localStorage.setItem(storageKey, JSON.stringify(ids));
};

export const areSiderOrdersEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
};

export const reconcileStoredSiderOrder = (storedOrder: string[], currentIds: string[]): string[] => {
  const currentIdSet = new Set(currentIds);
  const nextOrder = storedOrder.filter((id) => currentIdSet.has(id));

  currentIds.forEach((id) => {
    if (!nextOrder.includes(id)) {
      nextOrder.push(id);
    }
  });

  return nextOrder;
};

type SortSiderItemsParams<T> = {
  items: T[];
  storedOrder: string[];
  getId: (item: T) => string;
  getGroupKey?: (item: T) => string;
};

const sortGroupItemsByOrder = <T>(items: T[], orderIndex: Map<string, number>, getId: (item: T) => string): T[] =>
  items.toSorted((left, right) => {
    const leftIndex = orderIndex.get(getId(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(getId(right)) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });

export const sortSiderItemsByStoredOrder = <T>({
  items,
  storedOrder,
  getId,
  getGroupKey,
}: SortSiderItemsParams<T>): T[] => {
  const reconciledOrder = reconcileStoredSiderOrder(
    storedOrder,
    items.map((item) => getId(item))
  );
  const orderIndex = new Map(reconciledOrder.map((id, index) => [id, index]));

  if (!getGroupKey) {
    return sortGroupItemsByOrder(items, orderIndex, getId);
  }

  const groupedItems = new Map<string, T[]>();
  const groupOrder: string[] = [];

  items.forEach((item) => {
    const groupKey = getGroupKey(item);
    if (!groupedItems.has(groupKey)) {
      groupedItems.set(groupKey, []);
      groupOrder.push(groupKey);
    }
    groupedItems.get(groupKey)!.push(item);
  });

  return groupOrder.flatMap((groupKey) => sortGroupItemsByOrder(groupedItems.get(groupKey) ?? [], orderIndex, getId));
};

export const reorderSiderIds = (orderedIds: string[], activeId: string, overId: string): string[] => {
  const oldIndex = orderedIds.indexOf(activeId);
  const newIndex = orderedIds.indexOf(overId);

  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return orderedIds;
  }

  return arrayMove(orderedIds, oldIndex, newIndex);
};
