/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import {
  createSaveKeyBinding,
  createSaveKeymap,
} from '@/renderer/pages/conversation/Preview/components/editors/saveKeymap';

describe('createSaveKeymap', () => {
  it('returns no extensions when onSave is omitted', () => {
    expect(createSaveKeymap()).toEqual([]);
    expect(createSaveKeymap(undefined)).toEqual([]);
  });

  it('returns a single keymap extension when onSave is provided', () => {
    const onSave = vi.fn();
    const extensions = createSaveKeymap(onSave);
    expect(extensions).toHaveLength(1);
    expect(extensions[0]).toBeTruthy();
  });
});

describe('createSaveKeyBinding', () => {
  it('invokes onSave and returns true so the browser save dialog is suppressed', () => {
    const onSave = vi.fn();
    const binding = createSaveKeyBinding(onSave);
    // run does not use the view — pass a stub EditorView
    const handled = binding.run!(null as unknown as EditorView);
    expect(handled).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('binds Mod-s with preventDefault', () => {
    const binding = createSaveKeyBinding(vi.fn());
    expect(binding.key).toBe('Mod-s');
    expect(binding.preventDefault).toBe(true);
  });
});
