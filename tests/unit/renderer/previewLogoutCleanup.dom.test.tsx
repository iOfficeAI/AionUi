/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Logging out must not leave one account's tabs where the next account can see them.
//
// Two halves, and only testing the first one hides the bug:
//
//   1. the in-memory tabs are discarded, and
//   2. nothing writes them back afterwards.
//
// PreviewProvider is mounted at the app root and survives logout, and its persist
// effect depends on [tabs, activeTabId, isOpen]. So even with the stored keys
// deleted, any later change to those would persist the previous account's tabs
// again — the provider quietly undoing the cleanup that just ran. This is also why
// the gap was invisible before: `closePreview()` used to empty `tabs` as a side
// effect, so one bug happened to cover the other.

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: { open: { on: () => () => {} } },
    fs: {
      writeContent: { invoke: async () => true },
      getContentMetadata: { invoke: async () => null },
      readContent: { invoke: async () => null },
      writeFile: { invoke: async () => true },
      getFileMetadata: { invoke: async () => null },
      getImageBase64: { invoke: async () => null },
    },
  },
}));

import {
  PreviewProvider,
  usePreviewContext,
  type PreviewContextValue,
} from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import {
  clearPersistedPreviewScopes,
  listPersistedPreviewScopeKeys,
  previewScopeStorageKey,
} from '@/renderer/pages/conversation/Preview/context/previewScope';

let ctx: PreviewContextValue;
const Probe: React.FC = () => {
  ctx = usePreviewContext();
  return null;
};

const SCOPE = '/ws/account-a';

const storedTabCount = (): number => {
  const raw = localStorage.getItem(previewScopeStorageKey(SCOPE));
  if (!raw) return 0;
  return ((JSON.parse(raw) as { tabs?: unknown[] }).tabs ?? []).length;
};

const flushPersist = () => act(() => void vi.advanceTimersByTime(300));

/** Open two tabs in SCOPE and let them reach storage. */
const openTabsAndPersist = (): void => {
  act(() => ctx.closePreviewIfScopeChanged(SCOPE));
  act(() =>
    ctx.openPreview('secret one', 'code', {
      file_name: 'a.ts',
      fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'a.ts' },
    })
  );
  act(() =>
    ctx.openPreview('secret two', 'code', {
      file_name: 'b.ts',
      fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'b.ts' },
    })
  );
  flushPersist();
};

/**
 * What logout does, in order: the auth cache sweep deletes the stored preview keys,
 * then the sign-out handler discards the tabs still held in memory.
 */
const simulateLogout = (): void => {
  clearPersistedPreviewScopes();
  act(() => ctx.clearPreviewForScope());
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  localStorage.clear();
});

describe('logging out leaves nothing behind for the next account', () => {
  it('discards the tabs held in memory', () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    openTabsAndPersist();
    expect(ctx.tabs).toHaveLength(2);

    simulateLogout();

    expect(ctx.tabs).toHaveLength(0);
  });

  // The half that matters: the provider outlives logout, so if it still holds tabs
  // its persist effect writes them back and the sweep is undone.
  it('does not write the tabs back to storage afterwards', () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    openTabsAndPersist();
    expect(storedTabCount()).toBe(2);

    simulateLogout();
    flushPersist();

    expect(storedTabCount()).toBe(0);
  });

  it('leaves no preview keys at all once the debounce has settled', () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    openTabsAndPersist();
    expect(listPersistedPreviewScopeKeys().length).toBeGreaterThan(0);

    simulateLogout();
    flushPersist();

    const leftovers = listPersistedPreviewScopeKeys().filter((key) => storedTabCountFor(key) > 0);
    expect(leftovers).toEqual([]);
  });

  // Merely hiding the panel is NOT enough on the logout path: it deliberately keeps
  // the tabs, which is right for "collapse" and wrong for "sign out".
  it('shows why hiding the panel alone would not do', () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    openTabsAndPersist();

    act(() => ctx.closePreview());
    flushPersist();

    // Still there — which is the documented behaviour of closePreview, and exactly
    // why logout needs clearPreviewForScope on top of it.
    expect(ctx.tabs).toHaveLength(2);
    expect(storedTabCount()).toBe(2);
  });
});

/** Tab count stored under an explicit storage key. */
function storedTabCountFor(key: string): number {
  const raw = localStorage.getItem(key);
  if (!raw) return 0;
  return ((JSON.parse(raw) as { tabs?: unknown[] }).tabs ?? []).length;
}
