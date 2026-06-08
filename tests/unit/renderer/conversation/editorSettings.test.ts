/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
// Import from the source file directly to avoid pulling in MonacoEditor
// (the barrel re-exports it, which the Node test environment cannot load).
import {
  DEFAULT_EDITOR_SETTINGS,
  readEditorSettings,
  writeEditorSettings,
} from '@/renderer/pages/conversation/Editor/editorSettings';

describe('editorSettings', () => {
  const workspaceId = 'ws-test-1';
  const STORAGE_KEY = `chisl.editor.prefs.${workspaceId}`;

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('returns defaults when nothing has been persisted', () => {
    expect(readEditorSettings(workspaceId)).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it('round-trips a partial patch through write → read', () => {
    const stored = writeEditorSettings(workspaceId, { fontSize: 18, wordWrap: true });
    expect(stored.fontSize).toBe(18);
    expect(stored.wordWrap).toBe(true);
    // Untouched fields keep their defaults.
    expect(stored.tabSize).toBe(DEFAULT_EDITOR_SETTINGS.tabSize);
    expect(stored.insertSpaces).toBe(DEFAULT_EDITOR_SETTINGS.insertSpaces);
    expect(readEditorSettings(workspaceId)).toEqual(stored);
  });

  it('shallow-merges a second patch over the first', () => {
    writeEditorSettings(workspaceId, { fontSize: 18 });
    const stored = writeEditorSettings(workspaceId, { wordWrap: true });
    expect(stored.fontSize).toBe(18);
    expect(stored.wordWrap).toBe(true);
  });

  it('clamps fontSize to the supported range', () => {
    const tooBig = writeEditorSettings(workspaceId, { fontSize: 999 });
    expect(tooBig.fontSize).toBe(40);
    const tooSmall = writeEditorSettings(workspaceId, { fontSize: 1 });
    expect(tooSmall.fontSize).toBe(8);
  });

  it('clamps tabSize to the supported range', () => {
    const tooBig = writeEditorSettings(workspaceId, { tabSize: 100 });
    expect(tooBig.tabSize).toBe(16);
    const tooSmall = writeEditorSettings(workspaceId, { tabSize: 0 });
    expect(tooSmall.tabSize).toBe(1);
  });

  it('stores fontFamily verbatim when it is a string', () => {
    writeEditorSettings(workspaceId, { fontFamily: 'Iosevka, monospace' });
    const read = readEditorSettings(workspaceId);
    expect(read.fontFamily).toBe('Iosevka, monospace');
  });

  it('keeps fontFamily undefined when not set', () => {
    const read = readEditorSettings(workspaceId);
    expect(read.fontFamily).toBeUndefined();
  });

  it('falls back to defaults when stored JSON is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(readEditorSettings(workspaceId)).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it('falls back to defaults when stored JSON is the wrong shape', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ unexpected: 'shape' }));
    expect(readEditorSettings(workspaceId)).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it('keeps defaultZoom in lock-step with fontSize on read', () => {
    writeEditorSettings(workspaceId, { fontSize: 20 });
    const read = readEditorSettings(workspaceId);
    expect(read.defaultZoom).toBe(read.fontSize);
  });

  it('partitions settings per workspace', () => {
    const other = 'ws-test-2';
    try {
      writeEditorSettings(workspaceId, { fontSize: 18 });
      writeEditorSettings(other, { fontSize: 12 });
      expect(readEditorSettings(workspaceId).fontSize).toBe(18);
      expect(readEditorSettings(other).fontSize).toBe(12);
    } finally {
      localStorage.removeItem(`chisl.editor.prefs.${other}`);
    }
  });

  it('uses the global fallback key when no workspace is provided', () => {
    const globalKey = 'chisl.editor.prefs.__global__';
    try {
      writeEditorSettings(undefined, { fontSize: 22 });
      expect(readEditorSettings(undefined).fontSize).toBe(22);
      // Stored under the global key, not the undefined key.
      expect(localStorage.getItem(globalKey)).not.toBeNull();
    } finally {
      localStorage.removeItem(globalKey);
    }
  });
});
