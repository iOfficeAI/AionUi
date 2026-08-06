/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// A markdown file opened from the Explorer can be edited and saved.
//
// It was marked `editable: false` there, which was wrong twice over. Markdown is
// ordinary text and the panel's editor was built for it; and the flag's real damage was
// not to editing (the markdown branch renders its own viewer and never consults it) but
// to anything reasoning FROM it — persistence nearly used "read-only" as a proxy for
// "the content cannot have been changed", which would have discarded unsaved edits.
//
// So this pins the behaviour rather than the flag: type into a restored markdown tab,
// and it becomes dirty and writes to the file. Asserting `editable === undefined` alone
// would keep passing if editing itself broke.

import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const writeContent = vi.hoisted(() => vi.fn(async () => true));

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: { open: { on: () => () => {} } },
    fs: {
      writeContent: { invoke: writeContent },
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

let ctx: PreviewContextValue;
const Probe: React.FC = () => {
  ctx = usePreviewContext();
  return null;
};

const FILE_REF = { kind: 'project', pe_id: 'peA', relative_path: 'notes/readme.md' } as const;

/** Opened exactly as ExplorerContainer opens a .md: no `editable` override. */
const openMarkdownFromExplorer = (): void => {
  act(() => {
    ctx.openPreview('# original', 'markdown', {
      title: 'readme.md',
      file_name: 'readme.md',
      language: 'md',
      // What buildExplorerPreviewPayload now produces for a .md: the type table's value.
      editable: true,
      fileRef: { ...FILE_REF },
    });
  });
};

beforeEach(() => {
  localStorage.clear();
  writeContent.mockClear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('a markdown file opened from the Explorer', () => {
  it('is not declared read-only', () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    openMarkdownFromExplorer();

    // Explicitly true, from the type table. Not `undefined`: the value is looked up
    // rather than left to a default, so its absence would mean the lookup was skipped.
    expect(ctx.activeTab?.metadata?.editable).toBe(true);
  });

  it('becomes dirty when edited and writes the edit to the file', async () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    openMarkdownFromExplorer();

    act(() => ctx.updateContent('# edited by the user'));
    await waitFor(() => expect(ctx.activeTab?.isDirty).toBe(true));

    await act(async () => {
      await ctx.saveContent();
    });

    // The edit reaches the file, addressed by identity.
    expect(writeContent).toHaveBeenCalledWith(
      expect.objectContaining({ file: { ...FILE_REF }, data: '# edited by the user' })
    );
    // And the tab settles clean, so the marker stops claiming unsaved work.
    await waitFor(() => expect(ctx.activeTab?.isDirty).toBe(false));
  });

  // The edit has to survive the trip through storage as an edit. This is the path the
  // read-only flag would have broken had persistence trusted it: a tab believed
  // unmodifiable has no reason to keep its content.
  it('keeps an unsaved edit across switching project and back', async () => {
    render(
      <PreviewProvider>
        <Probe />
      </PreviewProvider>
    );
    act(() => ctx.closePreviewIfScopeChanged('project:peA'));
    openMarkdownFromExplorer();
    act(() => ctx.updateContent('# edited but never saved'));
    await waitFor(() => expect(ctx.activeTab?.isDirty).toBe(true));

    act(() => ctx.closePreviewIfScopeChanged('project:peB'));
    act(() => ctx.closePreviewIfScopeChanged('project:peA'));

    await waitFor(() => {
      const restored = ctx.tabs.find((tab) => tab.title === 'readme.md');
      expect(restored?.content).toBe('# edited but never saved');
      expect(restored?.isDirty).toBe(true);
    });
  });
});
