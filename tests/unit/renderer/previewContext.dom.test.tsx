/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PreviewContext pulls ipcBridge (WS-backed emitters + fs IO). Stub the surface
// it wires on mount so the provider mounts cleanly in jsdom and this test
// exercises only the scope-reset behavior.
vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: { open: { on: () => () => {} } },
    fs: {
      writeFile: { invoke: async () => true },
      getFileMetadata: { invoke: async () => null },
      readFile: { invoke: async () => null },
      getImageBase64: { invoke: async () => null },
    },
  },
}));

import {
  PreviewProvider,
  usePreviewContext,
  type PreviewContextValue,
} from '@/renderer/pages/conversation/Preview/context/PreviewContext';

/**
 * Capture the live context value on every render so assertions read the latest
 * state (the probe re-renders whenever the context updates).
 */
let ctx: PreviewContextValue;
const Probe: React.FC = () => {
  ctx = usePreviewContext();
  return null;
};

const mount = (): void => {
  render(
    <PreviewProvider>
      <Probe />
    </PreviewProvider>
  );
};

// Open a preview with no file_path so the mtime poller stays off (keeps the test
// free of timers / fs IPC).
const openADoc = (): void => {
  act(() => {
    ctx.openPreview('# hello', 'markdown', { title: 'Doc' });
  });
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('PreviewContext scope isolation (closePreviewIfScopeChanged)', () => {
  it('keeps the preview open when the scope key is unchanged', () => {
    mount();
    // Establish the current scope, then open a preview within it.
    act(() => ctx.closePreviewIfScopeChanged('/ws/a'));
    openADoc();
    expect(ctx.isOpen).toBe(true);

    // Same scope again → no reset.
    act(() => ctx.closePreviewIfScopeChanged('/ws/a'));
    expect(ctx.isOpen).toBe(true);
    expect(ctx.tabs).toHaveLength(1);
  });

  it('closes the preview when the scope key changes to a scope with no saved state', () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged('/ws/a'));
    openADoc();
    expect(ctx.isOpen).toBe(true);

    // Different scope with nothing persisted → loads empty (panel closed).
    act(() => ctx.closePreviewIfScopeChanged('/ws/b'));
    expect(ctx.isOpen).toBe(false);
    expect(ctx.tabs).toHaveLength(0);
  });

  it('restores a scope’s open tab + visibility after switching away and back (per-project)', () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged('projA'));
    act(() => ctx.openPreview('# doc a', 'markdown', { title: 'A.md', file_name: 'A.md' }));
    expect(ctx.isOpen).toBe(true);
    expect(ctx.tabs).toHaveLength(1);

    // Leave A (state persisted) → enter B (empty).
    act(() => ctx.closePreviewIfScopeChanged('projB'));
    expect(ctx.isOpen).toBe(false);
    expect(ctx.tabs).toHaveLength(0);

    // Back to A → its open tab + visibility restored.
    act(() => ctx.closePreviewIfScopeChanged('projA'));
    expect(ctx.isOpen).toBe(true);
    expect(ctx.tabs).toHaveLength(1);
    expect(ctx.tabs[0].title).toBe('A.md');
  });
});
