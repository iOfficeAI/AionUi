/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// How the panel turns a change report into "these tabs are stale".
//
// Two shapes reach it, and conflating them is the bug this pins. A `files` report is
// narrowed per file, because tabs usually share a directory and flagging all of them
// sends the user to re-read documents that never changed. A `directory` report cannot
// be narrowed — nothing said which file — so every tab living there has to be flagged.
//
// Before the signal had two shapes, "cannot say which file" arrived as an empty name
// list, indistinguishable from "a file was added, which concerns nothing you have
// open". The second reading won, so the whole class of unnarrowable changes flagged
// nothing at all and the indicator stayed dark with the document stale on screen.

import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: { open: { on: () => () => {} } },
    fs: {
      writeContent: { invoke: async () => true },
      getContentMetadata: { invoke: async () => null },
      readContent: { invoke: async () => null },
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
import { peKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import {
  configurePreviewWatch,
  notifyPreviewWatchChange,
  resetPreviewWatch,
  type PreviewChangeSignal,
} from '@/renderer/pages/conversation/Preview/context/previewWatchStore';

let ctx: PreviewContextValue;
const Probe: React.FC = () => {
  ctx = usePreviewContext();
  return null;
};

/**
 * Two tabs in one directory, plus one elsewhere.
 *
 * The same-directory pair is what makes narrowing observable at all: with a single tab
 * open, "flag the named file" and "flag everything here" produce identical results.
 */
const openThreeTabs = (): void => {
  act(() => {
    ctx.openPreview('a', 'code', {
      title: 'a.ts',
      file_name: 'a.ts',
      fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'src/a.ts' },
    });
    ctx.openPreview('b', 'code', {
      title: 'b.ts',
      file_name: 'b.ts',
      fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'src/b.ts' },
    });
    ctx.openPreview('c', 'code', {
      title: 'c.ts',
      file_name: 'c.ts',
      fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'docs/c.ts' },
    });
  });
};

/** Tab titles currently flagged as stale — readable failure output. */
const flaggedTitles = (): string[] =>
  ctx.tabs.filter((tab) => ctx.tabsWithUpdate.has(tab.id)).map((tab) => tab.title ?? '');

const emit = (relativeDir: string, signal: PreviewChangeSignal): void => {
  act(() => {
    // Built with the real key function: the separator is a NUL byte, and hand-writing
    // it would make these tests turn on a detail they are not about.
    notifyPreviewWatchChange(peKey('peA', relativeDir), signal);
  });
};

const port = { subscribe: vi.fn(async () => ({ snapshots: [] })), unsubscribe: vi.fn() };

beforeEach(() => {
  localStorage.clear();
  configurePreviewWatch(port);
  resetPreviewWatch();
});

afterEach(() => {
  cleanup();
  resetPreviewWatch();
  configurePreviewWatch(null);
  localStorage.clear();
});

describe('turning a change report into stale tabs', () => {
  it('flags only the named file when the report names one', async () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    openThreeTabs();
    // The store drops reports for directories it is not watching, so the panel's
    // subscriptions have to be in place for the signal to arrive at all.
    await waitFor(() => expect(port.subscribe).toHaveBeenCalled());

    emit('src', { kind: 'files', names: ['a.ts'] });

    await waitFor(() => expect(flaggedTitles()).toEqual(['a.ts']));
  });

  // The case that used to vanish: no name, so no narrowing is possible.
  it('flags every tab in the directory when the report cannot name a file', async () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    openThreeTabs();
    await waitFor(() => expect(port.subscribe).toHaveBeenCalled());

    emit('src', { kind: 'directory', reason: 'overflow' });

    await waitFor(() => expect(flaggedTitles().toSorted()).toEqual(['a.ts', 'b.ts']));
    // And only that directory: a rescan of src says nothing about docs.
    expect(flaggedTitles()).not.toContain('c.ts');
  });

  // Same handling, different cause. Both reach the panel as "cannot narrow this".
  it('treats a protocol-drift report the same way', async () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    openThreeTabs();
    await waitFor(() => expect(port.subscribe).toHaveBeenCalled());

    emit('src', { kind: 'directory', reason: 'unknown-op' });

    await waitFor(() => expect(flaggedTitles().toSorted()).toEqual(['a.ts', 'b.ts']));
  });

  // A named report for a file nothing has open must stay silent — that is the whole
  // point of narrowing, and it is what makes the directory case above meaningful
  // rather than "everything always flags".
  it('stays silent when the named file is not open', async () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    openThreeTabs();
    await waitFor(() => expect(port.subscribe).toHaveBeenCalled());

    emit('src', { kind: 'files', names: ['untracked.ts'] });

    // Nothing to wait for, so settle the effect queue before asserting absence.
    await act(async () => {});
    expect(flaggedTitles()).toEqual([]);
  });
});
