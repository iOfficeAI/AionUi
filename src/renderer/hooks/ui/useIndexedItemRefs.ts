/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef } from 'react';

export function useIndexedItemRefs<T>(count: number) {
  const itemRefs = useRef<Array<T | null>>([]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, count);
  }, [count]);

  const setItemRef = useCallback(
    (index: number) => (node: T | null) => {
      itemRefs.current[index] = node;
    },
    []
  );

  return {
    itemRefs,
    setItemRef,
  };
}
