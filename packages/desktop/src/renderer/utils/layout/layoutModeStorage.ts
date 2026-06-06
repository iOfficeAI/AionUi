/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Layout canvas mode types, localStorage persistence, availability registry,
 * and fallback logic.
 *
 * Persistence keys:
 *   aionui.layoutMode      — string enum, default 'default'
 *   aionui.layoutPaneSizes — JSON Record<LayoutMode, number[]>, default '{}'
 */

export const LAYOUT_MODES = ['chat', 'command-center'] as const;

export type LayoutMode = (typeof LAYOUT_MODES)[number];

const MODE_STORAGE_KEY = 'aionui.layoutMode';
const PANE_SIZES_STORAGE_KEY = 'aionui.layoutPaneSizes';

export const DEFAULT_LAYOUT_MODE: LayoutMode = 'chat';

// Default split ratios per mode: [primary%, secondary%]
export const DEFAULT_PANE_SIZES: Record<LayoutMode, number[]> = {
  chat: [100, 0],
  'command-center': [70, 30],
};

// --- Storage helpers (follow existing aionui.* localStorage pattern from Layout.tsx) ---

export const readStoredLayoutMode = (): LayoutMode => {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT_MODE;
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (raw && LAYOUT_MODES.includes(raw as LayoutMode)) {
      return raw as LayoutMode;
    }
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_LAYOUT_MODE;
};

export const persistLayoutMode = (mode: LayoutMode): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    /* localStorage unavailable */
  }
};

export const readStoredPaneSizes = (): Partial<Record<LayoutMode, number[]>> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PANE_SIZES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const result: Partial<Record<LayoutMode, number[]>> = {};
      for (const key of LAYOUT_MODES) {
        const val = parsed[key];
        if (Array.isArray(val) && val.every((n) => typeof n === 'number' && Number.isFinite(n))) {
          result[key] = val as number[];
        }
      }
      return result;
    }
  } catch {
    /* localStorage unavailable or malformed JSON */
  }
  return {};
};

let paneSizesWriteTimer: ReturnType<typeof setTimeout> | null = null;

export const persistPaneSizes = (sizes: Partial<Record<LayoutMode, number[]>>): void => {
  if (typeof window === 'undefined') return;
  if (paneSizesWriteTimer) clearTimeout(paneSizesWriteTimer);
  paneSizesWriteTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(PANE_SIZES_STORAGE_KEY, JSON.stringify(sizes));
    } catch {
      /* localStorage unavailable */
    }
  }, 300);
};

// --- Availability registry ---
// Each mode has a predicate that returns true when the mode can be shown.

export type AvailabilityContext = {
  isMobile: boolean;
  editorAvailable: boolean;
  diffAvailable: boolean;
};

const always = (): boolean => true;

const availabilityRegistry: Record<LayoutMode, (ctx: AvailabilityContext) => boolean> = {
  chat: always,
  'command-center': always,
};

export const isModeAvailable = (mode: LayoutMode, ctx: AvailabilityContext): boolean => {
  const check = availabilityRegistry[mode];
  return check ? check(ctx) : false;
};

export const getAvailableModes = (ctx: AvailabilityContext): LayoutMode[] => {
  return LAYOUT_MODES.filter((mode) => isModeAvailable(mode, ctx));
};

export const getPaneSizesForMode = (mode: LayoutMode, stored: Partial<Record<LayoutMode, number[]>>): number[] => {
  return stored[mode] ?? DEFAULT_PANE_SIZES[mode];
};

/**
 * Terminal panel height (bottom pane %) for a given mode, derived from the
 * persisted pane sizes (or the per-mode defaults). The value is the second
 * number in the `[top%, bottom%]` split and matches `react-resizable-panels`
 * percentages used by `<TerminalPanelHost>`.
 */
export const getTerminalHeightPctForMode = (
  mode: LayoutMode,
  stored: Partial<Record<LayoutMode, number[]>>
): number => {
  const sizes = getPaneSizesForMode(mode, stored);
  if (sizes.length < 2) return DEFAULT_PANE_SIZES[mode][1];
  const bottom = sizes[1];
  if (!Number.isFinite(bottom)) return DEFAULT_PANE_SIZES[mode][1];
  return Math.min(100, Math.max(0, bottom));
};

/**
 * True when the mode forces the terminal panel to remain visible.
 *
 * No modes force terminal open with the 2-mode (chat / command-center) layout.
 */
export const modeForcesTerminalOpen = (_mode: LayoutMode): boolean => {
  return false;
};

/**
 * True when the mode hides the terminal panel.
 *
 * Returns false for all modes — editor-focused and diff-focused no longer
 * force-close the terminal, allowing simultaneous editor + terminal use.
 */
export const modeHidesTerminal = (_mode: LayoutMode): boolean => {
  return false;
};
