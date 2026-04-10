/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Navigation history stack for the in-app back/forward buttons.
 *
 * Behaves like a browser history: every time the route pathname changes we
 * push an entry; calling back()/forward() moves the cursor; when a new
 * navigation happens while the cursor is in the middle of the stack, entries
 * after the cursor are discarded (just like opening a new page after going
 * back in a browser).
 *
 * This captures route-level navigations only (e.g. switching conversations,
 * opening settings). Intra-page interactions like scrolling or sending a
 * message do not change the pathname and are correctly ignored.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const MAX_HISTORY = 50;

type HistoryEntry = {
  path: string; // full path including search + hash
};

type NavigationHistoryContextValue = {
  canBack: boolean;
  canForward: boolean;
  back: () => void;
  forward: () => void;
};

const NavigationHistoryContext = createContext<NavigationHistoryContextValue | null>(null);

const buildPath = (location: { pathname: string; search: string; hash: string }) =>
  `${location.pathname}${location.search}${location.hash}`;

export const NavigationHistoryProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const [stack, setStack] = useState<HistoryEntry[]>(() => [{ path: buildPath(location) }]);
  const [cursor, setCursor] = useState(0);

  // When back()/forward() triggers navigate(), the location listener below
  // would otherwise push a duplicate entry. This ref tells the listener to
  // skip the next location change.
  const skipNextRef = useRef(false);

  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    const path = buildPath(location);
    setStack((prevStack) => {
      const prevEntry = prevStack[cursor];
      if (prevEntry && prevEntry.path === path) {
        // Same path as current cursor — no-op (initial render, or a redundant push).
        return prevStack;
      }
      // Discard any forward entries past the cursor, then append.
      const truncated = prevStack.slice(0, cursor + 1);
      truncated.push({ path });
      // Enforce max length by dropping from the oldest side.
      if (truncated.length > MAX_HISTORY) {
        const overflow = truncated.length - MAX_HISTORY;
        const trimmed = truncated.slice(overflow);
        setCursor(trimmed.length - 1);
        return trimmed;
      }
      setCursor(truncated.length - 1);
      return truncated;
    });
    // We intentionally only depend on pathname/search/hash — not `cursor` —
    // because `cursor` is kept consistent inside the setStack updater above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, location.hash]);

  const back = useCallback(() => {
    const next = cursor - 1;
    if (next < 0) return;
    const target = stack[next];
    if (!target) return;
    skipNextRef.current = true;
    setCursor(next);
    // Use { replace: true } so traversing our own stack doesn't grow
    // React Router's history unboundedly — this is meant to emulate
    // browser back/forward, which never creates new history entries.
    void navigate(target.path, { replace: true });
  }, [cursor, stack, navigate]);

  const forward = useCallback(() => {
    const next = cursor + 1;
    if (next >= stack.length) return;
    const target = stack[next];
    if (!target) return;
    skipNextRef.current = true;
    setCursor(next);
    void navigate(target.path, { replace: true });
  }, [cursor, stack, navigate]);

  const value = useMemo<NavigationHistoryContextValue>(
    () => ({
      canBack: cursor > 0,
      canForward: cursor < stack.length - 1,
      back,
      forward,
    }),
    [cursor, stack.length, back, forward]
  );

  return <NavigationHistoryContext.Provider value={value}>{children}</NavigationHistoryContext.Provider>;
};

export const useNavigationHistory = (): NavigationHistoryContextValue | null => {
  return useContext(NavigationHistoryContext);
};
