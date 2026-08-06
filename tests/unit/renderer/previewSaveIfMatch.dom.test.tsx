/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The save-time conflict-detection condition (L1), end to end.
//
// Every other test in this PR stops at the payload level: it asserts that
// resolvePreviewPayload returned a lastModified. None of them proved the value
// actually reaches the save request — deleting the write-back in openPreview left
// the whole suite green, which is exactly the "green but vacuous" trap.
//
// So these tests deliberately span the seam: open a tab the way a real entry
// point does, then save, and assert on the `ifMatch` argument that arrives at
// ipcBridge.fs.writeContent. Without an If-Match the backend skips conflict
// detection entirely and silently overwrites a concurrent external edit, so
// "there is a value and it is the right one" is the property worth pinning.

import React from 'react';
import { act, render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  writeContent: vi.fn(),
  getContentMetadata: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: { open: { on: () => () => {} } },
    fs: {
      writeContent: { invoke: h.writeContent },
      getContentMetadata: { invoke: h.getContentMetadata },
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

const fileRef = { kind: 'project' as const, pe_id: 'peA', relative_path: 'notes/a.md' };
const OPEN_MTIME = 1_700_000_000_000;

/** The last `ifMatch` value handed to writeContent. */
const lastIfMatch = (): number | undefined => {
  const call = h.writeContent.mock.calls.at(-1);
  return (call?.[0] as { ifMatch?: number } | undefined)?.ifMatch;
};

/**
 * Open a tab the way a real entry point does: content plus the metadata that
 * resolvePreviewPayload produces, including the mtime read in the same call that
 * decided the size.
 */
const openTab = (meta: Record<string, unknown> = {}): void => {
  act(() => {
    ctx.openPreview('original body', 'markdown', {
      title: 'a.md',
      file_name: 'a.md',
      fileRef,
      lastModified: OPEN_MTIME,
      ...meta,
    });
  });
};

const editAndSave = async (text = 'edited body'): Promise<boolean> => {
  act(() => ctx.updateContent(text));
  let ok = false;
  await act(async () => {
    ok = await ctx.saveContent();
  });
  return ok;
};

beforeEach(() => {
  localStorage.clear();
  h.writeContent.mockReset().mockResolvedValue(true);
  // Post-save mtime refresh (a separate, pre-existing fill point).
  h.getContentMetadata.mockReset().mockResolvedValue({
    name: 'a.md',
    path: '/abs/a.md',
    size: 12,
    type: 'file',
    lastModified: OPEN_MTIME + 5_000,
  });
});

afterEach(() => {
  cleanup();
});

describe('save carries the If-Match taken when the tab opened', () => {
  // The core regression: a tab that was opened and edited but never saved before
  // must still send a conflict-detection condition on its FIRST save.
  it('sends the open-time mtime as ifMatch on the very first save', async () => {
    mount();
    openTab();

    await editAndSave();

    expect(h.writeContent).toHaveBeenCalledTimes(1);
    expect(lastIfMatch()).toBe(OPEN_MTIME);
  });

  it('addresses the save by the same fileRef the tab was opened with', async () => {
    mount();
    openTab();

    await editAndSave();

    expect(h.writeContent).toHaveBeenCalledWith(expect.objectContaining({ file: fileRef, data: 'edited body' }));
  });

  it('never sends an undefined ifMatch when the tab knows its mtime', async () => {
    mount();
    openTab();

    await editAndSave();

    // An absent If-Match is precisely what makes the backend skip the check.
    expect(lastIfMatch()).not.toBeUndefined();
  });

  it('keeps per-file conditions separate when two tabs are open', async () => {
    const otherRef = { kind: 'project' as const, pe_id: 'peA', relative_path: 'notes/b.md' };
    const otherMtime = 1_650_000_000_000;

    mount();
    openTab();
    act(() => {
      ctx.openPreview('b body', 'markdown', {
        title: 'b.md',
        file_name: 'b.md',
        fileRef: otherRef,
        lastModified: otherMtime,
      });
    });

    // The second tab is active; saving it must use ITS mtime, not the first one's.
    await editAndSave('b edited');

    expect(lastIfMatch()).toBe(otherMtime);
  });

  it('refreshes the condition after a successful save', async () => {
    mount();
    openTab();

    await editAndSave('first edit');
    expect(lastIfMatch()).toBe(OPEN_MTIME);

    // Second save must use the mtime observed after the first write, not the
    // stale open-time one, or it would 409 against its own previous save.
    await editAndSave('second edit');
    expect(lastIfMatch()).toBe(OPEN_MTIME + 5_000);
  });

  it('drops the condition once the tab is closed', async () => {
    mount();
    openTab();
    const tabId = ctx.activeTabId as string;

    act(() => ctx.closeTab(tabId));
    // Reopen without any mtime — nothing stale should be left behind for this file.
    act(() => {
      ctx.openPreview('body again', 'markdown', { title: 'a.md', file_name: 'a.md', fileRef });
    });

    await editAndSave('edited again');

    expect(lastIfMatch()).toBeUndefined();
  });

  it('sends no ifMatch for a tab opened without a known mtime', async () => {
    mount();
    // e.g. an entry point that could not stat the file.
    openTab({ lastModified: undefined });

    await editAndSave();

    expect(h.writeContent).toHaveBeenCalledTimes(1);
    expect(lastIfMatch()).toBeUndefined();
  });
});
