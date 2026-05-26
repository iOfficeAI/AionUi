/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global open/closed + height state for the bottom terminal panel.
 *
 * Lives above the router `<Outlet />` so terminal sessions and panel layout
 * survive page navigation (matching VSCode/Cursor behavior).
 *
 * Persisted via `configService` so the user's preferred panel height is
 * restored across app restarts. Session contents are intentionally NOT
 * persisted — matches VSCode.
 */

import type { PropsWithChildren } from 'react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { configService } from '@/common/config/configService';

const DEFAULT_HEIGHT_PCT = 30;
const MIN_HEIGHT_PCT = 10;
const MAX_HEIGHT_PCT = 80;

type TerminalPanelContextValue = {
  /** Whether the panel is visible (not collapsed). */
  open: boolean;
  /** Panel height as a percentage of the layout area (10–80). */
  heightPct: number;
  /** Toggle the panel open/closed. */
  toggle: () => void;
  /** Open the panel (no-op if already open). */
  open_: () => void;
  /** Collapse the panel (no-op if already collapsed). */
  close: () => void;
  /** Update the panel's persisted height. Clamps to [MIN, MAX]. */
  setHeightPct: (pct: number) => void;
};

const TerminalPanelContext = createContext<TerminalPanelContextValue | null>(null);

const clampPct = (pct: number): number => {
  if (!Number.isFinite(pct)) return DEFAULT_HEIGHT_PCT;
  return Math.min(MAX_HEIGHT_PCT, Math.max(MIN_HEIGHT_PCT, pct));
};

export const TerminalPanelProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [open, setOpen] = useState<boolean>(false);
  const [heightPct, setHeightPctState] = useState<number>(DEFAULT_HEIGHT_PCT);

  // Hydrate persisted state once configService is ready.
  useEffect(() => {
    let cancelled = false;
    void configService
      .whenReady()
      .then(() => {
        if (cancelled) return;
        const persistedOpen = configService.get('terminal.panel.open');
        const persistedHeight = configService.get('terminal.panel.heightPct');
        if (typeof persistedOpen === 'boolean') setOpen(persistedOpen);
        if (typeof persistedHeight === 'number') setHeightPctState(clampPct(persistedHeight));
      })
      .catch(() => {
        /* fall back to defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistOpen = useCallback((next: boolean) => {
    setOpen(next);
    void configService.set('terminal.panel.open', next).catch(() => {
      /* persistence failure shouldn't break the UI */
    });
  }, []);

  const toggle = useCallback(() => persistOpen(!open), [open, persistOpen]);
  const open_ = useCallback(() => {
    if (!open) persistOpen(true);
  }, [open, persistOpen]);
  const close = useCallback(() => {
    if (open) persistOpen(false);
  }, [open, persistOpen]);

  const setHeightPct = useCallback((pct: number) => {
    const clamped = clampPct(pct);
    setHeightPctState(clamped);
    void configService.set('terminal.panel.heightPct', clamped).catch(() => {
      /* persistence failure shouldn't break the UI */
    });
  }, []);

  const value = useMemo<TerminalPanelContextValue>(
    () => ({ open, heightPct, toggle, open_, close, setHeightPct }),
    [open, heightPct, toggle, open_, close, setHeightPct]
  );

  return <TerminalPanelContext.Provider value={value}>{children}</TerminalPanelContext.Provider>;
};

export const useTerminalPanel = (): TerminalPanelContextValue => {
  const ctx = useContext(TerminalPanelContext);
  if (!ctx) {
    throw new Error('useTerminalPanel must be used within TerminalPanelProvider');
  }
  return ctx;
};

/** Safe variant for code paths that may live outside the provider. */
export const useTerminalPanelSafe = (): TerminalPanelContextValue | null => {
  return useContext(TerminalPanelContext);
};
