/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Which open tabs survive a project switch, and in what form.
//
// The reported symptom: a project with ten tabs open (.html .sh .py .md .png .jpeg
// .svg .xlsx .docx .pptx) came back with four after switching project and returning.
// Collapsing and reopening the panel restored all ten, which localises the loss
// precisely — the tabs were in memory the whole time, and only the trip through
// storage dropped them. That is why it looked like the file types were unsupported
// rather than merely unpersisted.
//
// The two directions are asserted separately and deliberately:
//   - collapse → reopen must keep everything (no storage involved)
//   - switch scope → return must keep everything (storage involved)
// Testing only the second would not notice a fix that repaired persistence while
// breaking the in-memory path, which is the one users hit far more often.
//
// The restored FORM matters as much as the count. A pdf, office document or image is
// restored from its `fileRef` with empty content, because its viewer re-fetches from
// that ref anyway and a 20 MB image data URL in localStorage would break the quota for
// every other project. A text tab keeps its content, because an unsaved edit exists
// nowhere else.

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
import { previewScopeStorageKey } from '@/renderer/pages/conversation/Preview/context/previewScope';
import type { PreviewContentType } from '@/renderer/pages/conversation/Preview/types';

let ctx: PreviewContextValue;
const Probe: React.FC = () => {
  ctx = usePreviewContext();
  return null;
};

const SCOPE_A = 'project:peA';
const SCOPE_B = 'project:peB';

/**
 * The reported set, by type rather than by extension: .html → html, .sh/.py → code,
 * .md → markdown, .png/.jpeg/.svg → image, .xlsx → excel, .docx → word, .pptx → ppt.
 *
 * Content is non-empty for every one of them, so "restored with empty content" cannot
 * be confused with "was empty to begin with".
 */
const TEN_TABS: Array<{ name: string; type: PreviewContentType }> = [
  { name: 'index.html', type: 'html' },
  { name: 'run.sh', type: 'code' },
  { name: 'main.py', type: 'code' },
  { name: 'readme.md', type: 'markdown' },
  { name: 'a.png', type: 'image' },
  { name: 'b.jpeg', type: 'image' },
  { name: 'c.svg', type: 'image' },
  { name: 'sheet.xlsx', type: 'excel' },
  { name: 'doc.docx', type: 'word' },
  { name: 'deck.pptx', type: 'ppt' },
];

const openTenTabs = (): void => {
  act(() => {
    for (const { name, type } of TEN_TABS) {
      ctx.openPreview(`contents of ${name}`, type, {
        title: name,
        file_name: name,
        fileRef: { kind: 'project', pe_id: 'peA', relative_path: `src/${name}` },
      });
    }
  });
};

const openTitles = (): string[] => ctx.tabs.map((tab) => tab.title ?? '');

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const mount = (): void => {
  render(
    <PreviewProvider>
      <Probe />
    </PreviewProvider>
  );
};

describe('keeping every open tab across a project switch', () => {
  // The control: no storage involved, so this passed even while the bug was live. It is
  // here so a regression in the in-memory path cannot hide behind a persistence fix.
  it('keeps all ten when the panel is only collapsed and reopened', async () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE_A));
    openTenTabs();

    act(() => ctx.closePreview());
    act(() => {
      ctx.openPreview('contents of index.html', 'html', {
        title: 'index.html',
        file_name: 'index.html',
        fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'src/index.html' },
      });
    });

    expect(openTitles().toSorted()).toEqual(TEN_TABS.map((t) => t.name).toSorted());
  });

  // The reported case. Four of ten survived: exactly the types the old whitelist named.
  it('keeps all ten across switching project and returning', async () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE_A));
    openTenTabs();
    await waitFor(() => expect(localStorage.getItem(previewScopeStorageKey(SCOPE_A))).toBeTruthy());

    act(() => ctx.closePreviewIfScopeChanged(SCOPE_B));
    act(() => ctx.closePreviewIfScopeChanged(SCOPE_A));

    await waitFor(() => {
      expect(openTitles().toSorted()).toEqual(TEN_TABS.map((t) => t.name).toSorted());
    });
  });

  it('restores a text tab with its content, so an unsaved edit is not lost', async () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE_A));
    act(() => {
      ctx.openPreview('original text', 'code', {
        title: 'main.py',
        file_name: 'main.py',
        fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'src/main.py' },
      });
    });
    act(() => ctx.updateContent('edited but never saved'));
    await waitFor(() => expect(ctx.activeTab?.isDirty).toBe(true));

    act(() => ctx.closePreviewIfScopeChanged(SCOPE_B));
    act(() => ctx.closePreviewIfScopeChanged(SCOPE_A));

    await waitFor(() => {
      const restored = ctx.tabs.find((tab) => tab.title === 'main.py');
      expect(restored?.content).toBe('edited but never saved');
      // Still marked unsaved: restoring it as clean would tell the user their edit
      // reached the file when it never did.
      expect(restored?.isDirty).toBe(true);
    });
  });

  // The other half of the mixed strategy. Storing a 20 MB image data URL would exceed
  // the storage quota by itself and start evicting other projects through the LRU, and
  // the viewers re-fetch from the ref regardless, so the bytes are not worth keeping.
  it('restores an image or office tab from its identity, without its bytes', async () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE_A));
    openTenTabs();
    await waitFor(() => expect(localStorage.getItem(previewScopeStorageKey(SCOPE_A))).toBeTruthy());

    const stored = JSON.parse(localStorage.getItem(previewScopeStorageKey(SCOPE_A)) as string) as {
      tabs: Array<{ title: string; content: string; content_type: string; metadata?: { fileRef?: unknown } }>;
    };

    const image = stored.tabs.find((tab) => tab.title === 'a.png');
    expect(image?.content).toBe('');
    // The ref is what makes it restorable at all, so its absence would be the bug.
    expect(image?.metadata?.fileRef).toBeTruthy();

    const office = stored.tabs.find((tab) => tab.title === 'doc.docx');
    expect(office?.content).toBe('');
    expect(office?.metadata?.fileRef).toBeTruthy();

    // And the text tab in the same store still has its text — the point is that the two
    // are treated differently, not that everything is blanked.
    expect(stored.tabs.find((tab) => tab.title === 'main.py')?.content).toBe('contents of main.py');
  });

  // The boundary of the re-obtainability rule, and the reason it is not "is the type
  // read-only". `diff` and `patch` are declared `editable: false`, so a rule phrased
  // around editability would sweep them in — and a diff's content is a patch generated
  // in a conversation, with no file behind it (`useDiffPreviewHandlers` passes
  // `diffContent` and no path). Blanking it destroys the only copy.
  //
  // This is the assertion that stops that change from being made quietly.
  it('keeps a diff tab content, because there is no file to re-read it from', async () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE_A));
    act(() => {
      // Exactly how a diff tab is opened: content, no fileRef.
      ctx.openPreview('--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n', 'diff', {
        title: 'x.ts.diff',
        file_name: 'x.ts.diff',
        language: 'diff',
        editable: false,
      });
    });
    await waitFor(() => expect(localStorage.getItem(previewScopeStorageKey(SCOPE_A))).toBeTruthy());

    act(() => ctx.closePreviewIfScopeChanged(SCOPE_B));
    act(() => ctx.closePreviewIfScopeChanged(SCOPE_A));

    await waitFor(() => {
      const restored = ctx.tabs.find((tab) => tab.title === 'x.ts.diff');
      // Present at all, and with its patch text — a blank diff viewer would be a tab
      // that survived in name only.
      expect(restored?.content).toContain('+new');
    });
  });

  // Nothing to reopen from: an image with no ref would restore as a viewer that can
  // never show anything, which is worse than not restoring it.
  it('drops an identity-restored tab that has no file reference', async () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE_A));
    act(() => {
      ctx.openPreview('data:image/png;base64,AAAA', 'image', { title: 'pasted.png', file_name: 'pasted.png' });
      ctx.openPreview('some code', 'code', {
        title: 'kept.ts',
        file_name: 'kept.ts',
        fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'src/kept.ts' },
      });
    });
    await waitFor(() => expect(localStorage.getItem(previewScopeStorageKey(SCOPE_A))).toBeTruthy());

    act(() => ctx.closePreviewIfScopeChanged(SCOPE_B));
    act(() => ctx.closePreviewIfScopeChanged(SCOPE_A));

    await waitFor(() => expect(openTitles()).toEqual(['kept.ts']));
  });
});
