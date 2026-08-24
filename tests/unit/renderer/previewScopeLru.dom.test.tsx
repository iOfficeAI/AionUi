/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Persisted scopes are bounded, and a full quota is reported instead of swallowed.
//
// Previously `persistScopeState` ended in a bare `catch {}`: when localStorage was
// full the write just didn't happen. Tabs stopped coming back after a project
// switch and nothing connected that to storage. There was also no cap, so every
// project ever opened kept its entry forever.

import React from 'react';
import { act, render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: { open: { on: () => () => {} } },
    fs: {
      writeContent: { invoke: async () => true },
      getContentMetadata: { invoke: async () => null },
      writeFile: { invoke: async () => true },
      getFileMetadata: { invoke: async () => null },
      readFile: { invoke: async () => null },
      getImageBase64: { invoke: async () => null },
      readContent: { invoke: async () => null },
    },
  },
}));

import {
  PreviewProvider,
  usePreviewContext,
  type PreviewContextValue,
} from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { listPersistedPreviewScopeKeys } from '@/renderer/pages/conversation/Preview/context/previewScope';

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

/** Enter a scope and leave one text tab persisted in it. */
const useScopeWithATab = (scope: string): void => {
  act(() => ctx.closePreviewIfScopeChanged(scope));
  act(() => {
    ctx.openPreview(`# ${scope}`, 'markdown', { title: `${scope}.md`, file_name: `${scope}.md` });
  });
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

describe('persisted scope count is bounded', () => {
  // The persist effect is debounced, and switching scope flushes the previous one.
  const flush = () => act(() => void vi.advanceTimersByTime(300));

  it('keeps the number of persisted scopes at or below the cap', () => {
    mount();

    // Visit well past the cap of 12.
    for (let i = 0; i < 20; i++) {
      useScopeWithATab(`proj-${i}`);
      flush();
    }

    expect(listPersistedPreviewScopeKeys().length).toBeLessThanOrEqual(12);
  });

  it('keeps the most recently used scope rather than evicting it', () => {
    mount();

    for (let i = 0; i < 20; i++) {
      useScopeWithATab(`proj-${i}`);
      flush();
    }

    // The scope written last must survive — evicting it would drop the tabs the
    // user is looking at right now.
    expect(listPersistedPreviewScopeKeys()).toContain('preview-ui:proj-19');
  });

  it('evicts the coldest scope, not an arbitrary one', () => {
    mount();

    for (let i = 0; i < 20; i++) {
      useScopeWithATab(`proj-${i}`);
      flush();
    }

    // proj-0 is the oldest write, so it should be gone well before proj-19.
    expect(listPersistedPreviewScopeKeys()).not.toContain('preview-ui:proj-0');
  });

  it('does not evict anything while under the cap', () => {
    mount();

    for (let i = 0; i < 5; i++) {
      useScopeWithATab(`proj-${i}`);
      flush();
    }

    expect(listPersistedPreviewScopeKeys().length).toBe(5);
  });
});

describe('a full storage quota is reported', () => {
  const flush = () => act(() => void vi.advanceTimersByTime(300));

  it('raises persistQuotaExceededAt when writes cannot succeed', () => {
    const originalStorage = window.localStorage;
    const quotaStorage: Storage = {
      get length() {
        return originalStorage.length;
      },
      clear: () => originalStorage.clear(),
      getItem: (key) => originalStorage.getItem(key),
      key: (index) => originalStorage.key(index),
      removeItem: (key) => originalStorage.removeItem(key),
      setItem: () => {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      },
    };

    Object.defineProperty(window, 'localStorage', { value: quotaStorage, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: quotaStorage, configurable: true });

    try {
      mount();
      expect(ctx.persistQuotaExceededAt).toBeNull();

      useScopeWithATab('proj-quota');
      flush();

      // The signal the UI turns into a visible warning. Silence was the bug.
      expect(ctx.persistQuotaExceededAt).not.toBeNull();
    } finally {
      Object.defineProperty(window, 'localStorage', { value: originalStorage, configurable: true });
      Object.defineProperty(globalThis, 'localStorage', { value: originalStorage, configurable: true });
    }
  });

  it('stays null while persistence is working', () => {
    mount();
    useScopeWithATab('proj-ok');
    flush();

    expect(ctx.persistQuotaExceededAt).toBeNull();
  });
});
