/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure unit tests for `editorDock` — the localStorage-backed preference store
 * for the command-center editor's dock side (`start` | `end`).
 *
 * These tests cover:
 *   1. default read on empty storage
 *   2. localStorage roundtrip via persistEditorDock
 *   3. fallback to default when the stored value is invalid
 *   4. the window CustomEvent broadcast → `useEditorDock` consumer re-render
 *   5. `toggleDock` flipping start ↔ end (and persisting)
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_EDITOR_DOCK,
  persistEditorDock,
  readEditorDock,
  useEditorDock,
} from '@/renderer/utils/layout/editorDock';

const STORAGE_KEY = 'aionui.commandCenter.editorDock';

describe('editorDock — readEditorDock', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns DEFAULT_EDITOR_DOCK ("start") when localStorage is empty', () => {
    expect(readEditorDock()).toBe(DEFAULT_EDITOR_DOCK);
    expect(readEditorDock()).toBe('start');
  });

  it('roundtrips a persisted "end" value through localStorage', () => {
    persistEditorDock('end');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('end');
    expect(readEditorDock()).toBe('end');
  });

  it('roundtrips a persisted "start" value through localStorage', () => {
    persistEditorDock('start');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('start');
    expect(readEditorDock()).toBe('start');
  });

  it('falls back to the default when localStorage holds an invalid value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'garbage');
    expect(readEditorDock()).toBe(DEFAULT_EDITOR_DOCK);
    expect(readEditorDock()).toBe('start');
  });
});

describe('editorDock — useEditorDock hook', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('exposes the current dock side and reactive mutators', () => {
    const { result } = renderHook(() => useEditorDock());

    expect(result.current.dock).toBe('start');
    expect(typeof result.current.setDock).toBe('function');
    expect(typeof result.current.toggleDock).toBe('function');
  });

  it('re-renders the consumer when persistEditorDock dispatches its change event', () => {
    const { result } = renderHook(() => useEditorDock());

    expect(result.current.dock).toBe('start');

    act(() => {
      persistEditorDock('end');
    });

    expect(result.current.dock).toBe('end');
    expect(readEditorDock()).toBe('end');
  });

  it('re-renders the consumer when setDock is called from the hook itself', () => {
    const { result } = renderHook(() => useEditorDock());

    act(() => {
      result.current.setDock('end');
    });

    expect(result.current.dock).toBe('end');
    expect(readEditorDock()).toBe('end');
  });

  it('toggleDock flips start → end and persists the new value', () => {
    const { result } = renderHook(() => useEditorDock());

    expect(result.current.dock).toBe('start');

    act(() => {
      result.current.toggleDock();
    });

    expect(result.current.dock).toBe('end');
    expect(readEditorDock()).toBe('end');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('end');
  });

  it('toggleDock flips end → start and persists the new value', () => {
    persistEditorDock('end');
    const { result } = renderHook(() => useEditorDock());

    expect(result.current.dock).toBe('end');

    act(() => {
      result.current.toggleDock();
    });

    expect(result.current.dock).toBe('start');
    expect(readEditorDock()).toBe('start');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('start');
  });
});
