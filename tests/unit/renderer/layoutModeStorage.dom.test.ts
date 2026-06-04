/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for layout mode storage helpers and mode predicates added
 * during the layout-01 testability fix (visible selector, mode-driven
 * terminal visibility, new non-conflicting keyboard shortcuts).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PANE_SIZES,
  LAYOUT_MODES,
  getAvailableModes,
  getPaneSizesForMode,
  getTerminalHeightPctForMode,
  isModeAvailable,
  modeForcesTerminalOpen,
  modeHidesTerminal,
  persistLayoutMode,
  readStoredLayoutMode,
  type AvailabilityContext,
} from '@/renderer/utils/layout/layoutModeStorage';

const STORAGE_KEY = 'aionui.layoutMode';

const baseCtx: AvailabilityContext = { isMobile: false, editorAvailable: false, diffAvailable: false };

describe('layoutModeStorage — mode predicates', () => {
  it('treats default as always available', () => {
    expect(isModeAvailable('default', { isMobile: true, editorAvailable: false, diffAvailable: false })).toBe(true);
    expect(isModeAvailable('default', baseCtx)).toBe(true);
  });

  it('hides split-pane on mobile', () => {
    const mobileCtx: AvailabilityContext = { isMobile: true, editorAvailable: true, diffAvailable: true };
    expect(isModeAvailable('split-pane', mobileCtx)).toBe(false);
    expect(isModeAvailable('editor-focused', mobileCtx)).toBe(false);
    expect(isModeAvailable('diff-focused', mobileCtx)).toBe(false);
  });

  it('hides editor-focused when the editor panel is not available', () => {
    expect(isModeAvailable('editor-focused', baseCtx)).toBe(false);
    expect(isModeAvailable('editor-focused', { ...baseCtx, editorAvailable: true })).toBe(true);
  });

  it('hides diff-focused when the diff panel is not available', () => {
    expect(isModeAvailable('diff-focused', baseCtx)).toBe(false);
    expect(isModeAvailable('diff-focused', { ...baseCtx, diffAvailable: true })).toBe(true);
  });

  it('returns the desktop-available modes in source order', () => {
    const ctx: AvailabilityContext = { isMobile: false, editorAvailable: true, diffAvailable: true };
    expect(getAvailableModes(ctx)).toEqual(['default', 'split-pane', 'editor-focused', 'diff-focused']);
  });

  it('reports which modes force the terminal open or hide it', () => {
    expect(modeForcesTerminalOpen('default')).toBe(false);
    expect(modeForcesTerminalOpen('split-pane')).toBe(true);
    expect(modeForcesTerminalOpen('editor-focused')).toBe(false);

    expect(modeHidesTerminal('default')).toBe(false);
    expect(modeHidesTerminal('split-pane')).toBe(false);
    expect(modeHidesTerminal('editor-focused')).toBe(false);
    expect(modeHidesTerminal('diff-focused')).toBe(false);
  });
});

describe('layoutModeStorage — pane size helpers', () => {
  it('returns the per-mode default when no stored size is provided', () => {
    expect(getPaneSizesForMode('default', {})).toEqual([70, 30]);
    expect(getPaneSizesForMode('split-pane', {})).toEqual([50, 50]);
    expect(getPaneSizesForMode('editor-focused', {})).toEqual([30, 70]);
  });

  it('returns the stored size when present, ignoring unrelated modes', () => {
    const stored = { 'split-pane': [40, 60] };
    expect(getPaneSizesForMode('split-pane', stored)).toEqual([40, 60]);
    expect(getPaneSizesForMode('default', stored)).toEqual(DEFAULT_PANE_SIZES.default);
  });

  it('derives terminal height from the bottom percentage of the stored sizes', () => {
    const stored = { 'split-pane': [40, 60], 'editor-focused': [25, 75] };
    expect(getTerminalHeightPctForMode('split-pane', stored)).toBe(60);
    expect(getTerminalHeightPctForMode('editor-focused', stored)).toBe(75);
    expect(getTerminalHeightPctForMode('default', stored)).toBe(DEFAULT_PANE_SIZES.default[1]);
  });

  it('clamps terminal height to a valid percentage', () => {
    const stored = { 'split-pane': [40, 150] as number[] };
    expect(getTerminalHeightPctForMode('split-pane', stored)).toBe(100);
  });
});

describe('layoutModeStorage — localStorage round-trip', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  afterEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  it('falls back to default when localStorage is empty', () => {
    expect(readStoredLayoutMode()).toBe('default');
  });

  it('returns the persisted mode when it is a known layout mode', () => {
    persistLayoutMode('split-pane');
    expect(readStoredLayoutMode()).toBe('split-pane');
  });

  it('falls back to default when the persisted value is not a known mode', () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'not-a-real-mode');
    }
    expect(readStoredLayoutMode()).toBe('default');
  });

  it('cycles through every known layout mode when persisted', () => {
    for (const m of LAYOUT_MODES) {
      persistLayoutMode(m);
      expect(readStoredLayoutMode()).toBe(m);
    }
  });
});
