/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DragEndEvent } from '@dnd-kit/core';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  areSiderOrdersEqual,
  readStoredSiderOrder,
  reconcileStoredSiderOrder,
  reorderSiderIds,
  sortSiderItemsByStoredOrder,
  writeStoredSiderOrder,
} from './siderOrder';

type UseStoredSiderOrderParams<T> = {
  items: T[];
  storageKey: string;
  getId: (item: T) => string;
  getGroupKey?: (item: T) => string;
  enabled?: boolean;
};

type UseStoredSiderOrderResult<T> = {
  orderedItems: T[];
  orderedIds: string[];
  sensors: ReturnType<typeof useSensors>;
  handleDragEnd: (event: DragEndEvent) => void;
};

export const useStoredSiderOrder = <T>({
  items,
  storageKey,
  getId,
  getGroupKey,
  enabled = true,
}: UseStoredSiderOrderParams<T>): UseStoredSiderOrderResult<T> => {
  const [storedOrder, setStoredOrder] = useState<string[]>(() => readStoredSiderOrder(storageKey));

  const itemIds = useMemo(() => items.map((item) => getId(item)), [items, getId]);

  useEffect(() => {
    if (itemIds.length === 0) {
      return;
    }

    setStoredOrder((previousOrder) => {
      const nextOrder = reconcileStoredSiderOrder(previousOrder, itemIds);
      if (areSiderOrdersEqual(previousOrder, nextOrder)) {
        return previousOrder;
      }
      return nextOrder;
    });
  }, [itemIds, storageKey]);

  useEffect(() => {
    if (storedOrder.length > 0) {
      writeStoredSiderOrder(storageKey, storedOrder);
    }
  }, [storedOrder, storageKey]);

  const orderedItems = useMemo(
    () =>
      sortSiderItemsByStoredOrder({
        items,
        storedOrder,
        getId,
        getGroupKey,
      }),
    [items, storedOrder, getId, getGroupKey]
  );

  const orderedIds = useMemo(() => orderedItems.map((item) => getId(item)), [orderedItems, getId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!enabled) return;

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      const activeItem = orderedItems.find((item) => getId(item) === activeId);
      const overItem = orderedItems.find((item) => getId(item) === overId);
      if (!activeItem || !overItem) return;

      if (getGroupKey && getGroupKey(activeItem) !== getGroupKey(overItem)) {
        return;
      }

      const nextOrder = reorderSiderIds(orderedIds, activeId, overId);
      if (areSiderOrdersEqual(nextOrder, orderedIds)) {
        return;
      }

      setStoredOrder(nextOrder);
    },
    [enabled, orderedItems, orderedIds, getId, getGroupKey]
  );

  return {
    orderedItems,
    orderedIds,
    sensors,
    handleDragEnd,
  };
};
