/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Layout canvas mode provider.
 *
 * Manages the active layout mode, pane sizes, availability/fallback,
 * keyboard shortcuts, and pane focus cycling.
 */

import type { PropsWithChildren } from 'react';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { isElectronDesktop } from '@renderer/utils/platform';
import type { LayoutMode } from '@renderer/utils/layout/layoutModeStorage';
import {
  DEFAULT_LAYOUT_MODE,
  LAYOUT_MODES,
  persistLayoutMode,
  persistPaneSizes,
  readStoredLayoutMode,
  readStoredPaneSizes,
} from '@renderer/utils/layout/layoutModeStorage';

type LayoutModeContextValue = {
  mode: LayoutMode;
  availableModes: LayoutMode[];
  paneSizes: Partial<Record<LayoutMode, number[]>>;
  modeRefreshCount: number;
  setMode: (mode: LayoutMode) => void;
  cycleMode: () => void;
  setPaneSizesForMode: (mode: LayoutMode, sizes: number[]) => void;
};

const LayoutModeContext = createContext<LayoutModeContextValue | null>(null);

// Pane focus cycling order.
const FOCUS_CYCLE_ORDER = ['sider', 'content', 'terminal'] as const;
type FocusRegion = (typeof FOCUS_CYCLE_ORDER)[number];

const focusRegion = (region: FocusRegion): void => {
  const selector =
    region === 'sider'
      ? '[data-layout-region="sider"]'
      : region === 'terminal'
        ? '[data-layout-region="terminal"]'
        : '[data-layout-region="content"]';
  const el = document.querySelector<HTMLElement>(selector);
  if (el) {
    el.focus();
    el.scrollIntoView({ block: 'nearest' });
  }
};

type LayoutModeProviderProps = PropsWithChildren & {
  isMobile: boolean;
  /** Whether the Monaco/editor panel is mounted and available. */
  editorAvailable: boolean;
  /** Whether the diff panel is mounted and available. */
  diffAvailable: boolean;
};

export const LayoutModeProvider: React.FC<LayoutModeProviderProps> = ({
  children,
  isMobile,
  editorAvailable,
  diffAvailable,
}) => {
  const [mode, setModeState] = useState<LayoutMode>(() => readStoredLayoutMode());
  const [paneSizes, setPaneSizes] = useState<Partial<Record<LayoutMode, number[]>>>(readStoredPaneSizes);
  const [modeRefreshCount, setModeRefreshCount] = useState(0);
  const mountedRef = useRef(false);

  const availableModes = useMemo(() => [...LAYOUT_MODES] as LayoutMode[], []);

  // Fallback on mount: if persisted mode is unavailable, reset to default and warn.
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (!LAYOUT_MODES.includes(mode)) {
      console.warn(
        `[layout] Persisted layout mode "${mode}" is not available. Falling back to "${DEFAULT_LAYOUT_MODE}".`
      );
      setModeState(DEFAULT_LAYOUT_MODE);
      persistLayoutMode(DEFAULT_LAYOUT_MODE);
    }
  }, [mode]);

  const setMode = useCallback(
    (next: LayoutMode) => {
      if (!LAYOUT_MODES.includes(next)) return;
      if (next === mode) {
        // Re-selecting the active mode signals intent to re-expand collapsed
        // panels — bump the refresh counter so consumers can react.
        setModeRefreshCount((c) => c + 1);
        return;
      }
      setModeState(next);
      persistLayoutMode(next);
    },
    [mode]
  );

  const cycleMode = useCallback(() => {
    const next = mode === 'chat' ? 'command-center' : 'chat';
    setModeState(next);
    persistLayoutMode(next);
  }, [mode]);

  const setPaneSizesForMode = useCallback((targetMode: LayoutMode, sizes: number[]) => {
    setPaneSizes((prev) => {
      const next = { ...prev, [targetMode]: sizes };
      persistPaneSizes(next);
      return next;
    });
  }, []);

  // Keyboard shortcuts (desktop only).
  // Uses Cmd/Ctrl+Alt+Shift+1..5 to avoid colliding with macOS screenshot
  // shortcuts (Cmd+Shift+3/4/5) and Windows snipping shortcuts
  // (Win+Shift+S, Ctrl+Shift+S).
  useEffect(() => {
    if (!isElectronDesktop()) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;

      const mod = event.metaKey || event.ctrlKey;
      // Require Cmd/Ctrl + Alt + Shift for all layout shortcuts.
      if (!mod || !event.altKey || !event.shiftKey) return;

      if (event.repeat) return;

      // Cmd/Ctrl+Alt+Shift+1..2 — direct mode selection.
      const digit = event.key;
      if (digit >= '1' && digit <= '2') {
        const index = Number.parseInt(digit, 10) - 1;
        const target = LAYOUT_MODES[index];
        if (target) {
          event.preventDefault();
          setModeState(target);
          persistLayoutMode(target);
          // Focus the content pane after mode switch.
          requestAnimationFrame(() => focusRegion('content'));
        }
        return;
      }

      // Cmd/Ctrl+Alt+Shift+] — toggle to next mode.
      if (event.key === ']') {
        event.preventDefault();
        const next = mode === 'chat' ? 'command-center' : 'chat';
        setModeState(next);
        persistLayoutMode(next);
        requestAnimationFrame(() => focusRegion('content'));
        return;
      }

      // Cmd/Ctrl+Alt+Shift+[ — toggle to previous mode.
      if (event.key === '[') {
        event.preventDefault();
        const next = mode === 'chat' ? 'command-center' : 'chat';
        setModeState(next);
        persistLayoutMode(next);
        requestAnimationFrame(() => focusRegion('content'));
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, setMode]);

  // F6 / Shift+F6 pane focus cycling (desktop only).
  useEffect(() => {
    if (!isElectronDesktop()) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'F6' && !event.repeat) {
        event.preventDefault();
        // Determine current focus region.
        const active = document.activeElement;
        let currentRegion: FocusRegion = 'content';
        if (active?.closest('[data-layout-region="sider"]')) {
          currentRegion = 'sider';
        } else if (active?.closest('[data-layout-region="terminal"]')) {
          currentRegion = 'terminal';
        }
        const currentIndex = FOCUS_CYCLE_ORDER.indexOf(currentRegion);
        const direction = event.shiftKey ? -1 : 1;
        const nextIndex =
          (((currentIndex + direction) % FOCUS_CYCLE_ORDER.length) + FOCUS_CYCLE_ORDER.length) %
          FOCUS_CYCLE_ORDER.length;
        const nextRegion = FOCUS_CYCLE_ORDER[nextIndex];
        if (nextRegion) focusRegion(nextRegion);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const value = useMemo<LayoutModeContextValue>(
    () => ({ mode, availableModes, paneSizes, modeRefreshCount, setMode, cycleMode, setPaneSizesForMode }),
    [mode, availableModes, paneSizes, modeRefreshCount, setMode, cycleMode, setPaneSizesForMode]
  );

  return <LayoutModeContext.Provider value={value}>{children}</LayoutModeContext.Provider>;
};

export function useLayoutMode(): LayoutModeContextValue {
  const ctx = useContext(LayoutModeContext);
  if (!ctx) {
    throw new Error('useLayoutMode must be used within LayoutModeProvider');
  }
  return ctx;
}

export function useLayoutModeSafe(): LayoutModeContextValue | null {
  return useContext(LayoutModeContext);
}
