/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';

/**
 * Persisted set of collapsed section keys for the conversation list.
 * Seed `'archived'` only when the user has never written the key, so the
 * section starts collapsed on first encounter but a user toggle later
 * takes precedence forever.
 */
export function useCollapsedSections(storageKey = 'grouped-history-collapsed-sections') {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Set(['archived']);
      const arr = JSON.parse(raw) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set(['archived']);
    }
  });

  const toggleSection = useCallback(
    (key: string) => {
      setCollapsedSections((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // ignore storage errors
        }
        return next;
      });
    },
    [storageKey]
  );

  return { collapsedSections, toggleSection };
}
