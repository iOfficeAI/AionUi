/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Legacy-data migration on restore.
//
// Earlier builds truncated an oversized text preview to 40,000 characters and
// persisted the remnant (the persist cap is 80,000, so it fitted), marking it
// with `metadata.truncated: true`. That flag drove the only on-screen warning
// that the content was a fragment. The flag and the banner are both gone now, so
// restoring such a tab would present a fragment as if it were the whole file —
// silently. These tests pin the migration that prevents it.

import React from 'react';
import { act, render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: { open: { on: () => () => {} } },
    fs: {
      writeFile: { invoke: async () => true },
      getFileMetadata: { invoke: async () => null },
      readFile: { invoke: async () => null },
      getImageBase64: { invoke: async () => null },
      getContentMetadata: { invoke: async () => null },
      readContent: { invoke: async () => null },
    },
  },
}));

import {
  PreviewProvider,
  usePreviewContext,
  type PreviewContextValue,
} from '@/renderer/pages/conversation/Preview/context/PreviewContext';

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

const SCOPE = '/ws/legacy';
const storageKey = (scope: string) => `preview-ui:${scope}`;

/** A persisted tab as an older build would have written it. */
const legacyTab = (over: Record<string, unknown> = {}) => ({
  id: 'tab-legacy-1',
  title: 'app.log',
  content: 'a'.repeat(40_000), // the old truncation length
  content_type: 'code',
  metadata: {
    title: 'app.log',
    file_name: 'app.log',
    file_path: '/ws/legacy/app.log',
    truncated: true, // the field this build no longer defines
    editable: false,
  },
  ...over,
});

/** Seed localStorage for SCOPE, then enter that scope so the state is restored. */
const seedAndRestore = (tabs: unknown[]): void => {
  localStorage.setItem(
    storageKey(SCOPE),
    JSON.stringify({ isOpen: true, tabs, activeTabId: (tabs[0] as { id?: string })?.id ?? null })
  );
  mount();
  act(() => ctx.closePreviewIfScopeChanged(SCOPE));
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('restoring legacy truncated tabs', () => {
  it('drops a persisted tab that carried the old truncated flag', () => {
    seedAndRestore([legacyTab()]);

    expect(ctx.tabs).toHaveLength(0);
  });

  // The actual harm being prevented: a 40,000-char fragment on screen with
  // nothing saying it is a fragment.
  it('never surfaces the truncated remnant as content', () => {
    seedAndRestore([legacyTab()]);

    const restoredContent = ctx.tabs.map((tab) => tab.content).join('');
    expect(restoredContent).not.toContain('a'.repeat(1000));
  });

  it('keeps healthy tabs while dropping only the truncated one', () => {
    const healthy = {
      id: 'tab-ok-1',
      title: 'notes.md',
      content: '# real full content',
      content_type: 'markdown',
      metadata: { title: 'notes.md', file_name: 'notes.md' },
    };

    seedAndRestore([legacyTab(), healthy]);

    expect(ctx.tabs).toHaveLength(1);
    expect(ctx.tabs[0].id).toBe('tab-ok-1');
    expect(ctx.tabs[0].content).toBe('# real full content');
  });

  // Only the literal `true` marks legacy truncation; a tab that merely mentions
  // the key with a falsy value was never a fragment.
  it('keeps a tab whose truncated flag is false', () => {
    seedAndRestore([legacyTab({ metadata: { title: 'a.txt', file_name: 'a.txt', truncated: false } })]);

    expect(ctx.tabs).toHaveLength(1);
  });

  it('keeps tabs that never had the flag at all', () => {
    seedAndRestore([legacyTab({ metadata: { title: 'a.txt', file_name: 'a.txt' } })]);

    expect(ctx.tabs).toHaveLength(1);
  });

  it('leaves the panel closed when every persisted tab was dropped', () => {
    seedAndRestore([legacyTab()]);

    // "visible AND has tabs" is the restore condition; with no tabs left the
    // panel must not come back as an empty shell.
    expect(ctx.isOpen).toBe(false);
    expect(ctx.activeTabId).toBeNull();
  });
});
