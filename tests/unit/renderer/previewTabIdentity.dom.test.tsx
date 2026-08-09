/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Tab identity, and what persistence is allowed to change about a tab.
//
// Three defects that turned out to share one root — identity is decided in one
// place and persistence quietly rewrote it:
//
//   D15  a five-level match chain deduped on file name / title / whole content, so
//        two diffs of same-named files in different directories became one tab and
//        overwrote each other, while the same file from two entry points opened
//        twice.
//   L3   persistence forced `isDirty: false` and overwrote `originalContent`, so an
//        unsaved edit was stored looking exactly like a saved one.
//   L5   `closePreview()` emptied `tabs`, which the persist effect then wrote back
//        over the scope's stored list — one click erased a project's whole
//        remembered set, saved tabs included.

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
import { previewScopeStorageKey } from '@/renderer/pages/conversation/Preview/context/previewScope';
import {
  configurePreviewWatch,
  currentPreviewWatchTargets,
  resetPreviewWatch,
} from '@/renderer/pages/conversation/Preview/context/previewWatchStore';
import { peKey } from '@/renderer/pages/conversation/explorer/explorerModel';

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

const projectRef = (relativePath: string) => ({
  kind: 'project' as const,
  pe_id: 'peA',
  relative_path: relativePath,
});

const SCOPE = '/ws/identity';

/** Wrap mermaid source the way MermaidBlock does when opening a preview. */
const mermaid = (code: string) => `\`\`\`mermaid\n${code}\n\`\`\``;

/** Read the tab list currently persisted for SCOPE. */
const storedTabs = (): unknown[] => {
  const raw = localStorage.getItem(previewScopeStorageKey(SCOPE));
  if (!raw) return [];
  return (JSON.parse(raw) as { tabs?: unknown[] }).tabs ?? [];
};

const flushPersist = () => act(() => void vi.advanceTimersByTime(300));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  localStorage.clear();
});

describe('tab identity comes from the file ref', () => {
  it('reuses the tab when the same file is opened again', () => {
    mount();
    act(() => ctx.openPreview('x', 'code', { file_name: 'a.ts', fileRef: projectRef('src/a.ts') }));
    const firstId = ctx.activeTabId;

    act(() => ctx.openPreview('x updated', 'code', { file_name: 'a.ts', fileRef: projectRef('src/a.ts') }));

    expect(ctx.tabs).toHaveLength(1);
    expect(ctx.activeTabId).toBe(firstId);
  });

  // The damage the old chain caused: `a.ts` in two directories shares a file name,
  // and merging them made one file's content replace the other's.
  it('keeps same-named files from different directories apart', () => {
    mount();
    act(() => ctx.openPreview('one', 'code', { file_name: 'a.ts', fileRef: projectRef('src/a.ts') }));
    act(() => ctx.openPreview('two', 'code', { file_name: 'a.ts', fileRef: projectRef('lib/a.ts') }));

    expect(ctx.tabs).toHaveLength(2);
    expect(ctx.tabs.map((tab) => tab.content)).toEqual(['one', 'two']);
  });

  it('keeps the same relative path in different projects apart', () => {
    mount();
    act(() =>
      ctx.openPreview('p1', 'code', {
        file_name: 'a.ts',
        fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'src/a.ts' },
      })
    );
    act(() =>
      ctx.openPreview('p2', 'code', {
        file_name: 'a.ts',
        fileRef: { kind: 'project', pe_id: 'peB', relative_path: 'src/a.ts' },
      })
    );

    expect(ctx.tabs).toHaveLength(2);
  });

  // Not a guess either way: they may be the same file, but merging on a hunch risks
  // one tab silently overwriting the other.
  it('does not merge a tab that has a ref with one that does not', () => {
    mount();
    act(() => ctx.openPreview('x', 'code', { file_name: 'a.ts', fileRef: projectRef('src/a.ts') }));
    act(() => ctx.openPreview('x', 'code', { file_name: 'a.ts' }));

    expect(ctx.tabs).toHaveLength(2);
  });

  it('never merges tabs of different content types', () => {
    mount();
    act(() => ctx.openPreview('x', 'code', { file_name: 'a.ts', fileRef: projectRef('src/a.ts') }));
    act(() => ctx.openPreview('x', 'markdown', { file_name: 'a.ts', fileRef: projectRef('src/a.ts') }));

    expect(ctx.tabs).toHaveLength(2);
  });

  describe('ref-less tabs use an explicit namespace key', () => {
    it('reuses the tab for the same diagram', () => {
      mount();
      act(() => ctx.openPreview(mermaid('graph TD; A-->B'), 'markdown', { title: 'Diagram' }));
      act(() => ctx.openPreview(mermaid('graph TD; A-->B'), 'markdown', { title: 'Diagram' }));

      expect(ctx.tabs).toHaveLength(1);
    });

    // Two diagrams starting with the same line used to collide on their truncated
    // title and overwrite one another.
    it('keeps different diagrams apart even when their titles match', () => {
      mount();
      act(() => ctx.openPreview(mermaid('graph TD; A-->B'), 'markdown', { title: 'Diagram' }));
      act(() => ctx.openPreview(mermaid('graph TD; A-->C'), 'markdown', { title: 'Diagram' }));

      expect(ctx.tabs).toHaveLength(2);
    });

    it('reuses the tab for the same diff', () => {
      mount();
      act(() => ctx.openPreview('@@ -1 +1 @@\n-a\n+b', 'diff', { file_name: 'a.ts' }));
      act(() => ctx.openPreview('@@ -1 +1 @@\n-a\n+b', 'diff', { file_name: 'a.ts' }));

      expect(ctx.tabs).toHaveLength(1);
    });

    it('keeps diffs of same-named files in different directories apart', () => {
      mount();
      act(() => ctx.openPreview('@@ -1 +1 @@\n-a\n+b', 'diff', { file_name: 'a.ts' }));
      act(() => ctx.openPreview('@@ -9 +9 @@\n-x\n+y', 'diff', { file_name: 'a.ts' }));

      expect(ctx.tabs).toHaveLength(2);
    });
  });
});

describe('persistence records unsaved work as unsaved', () => {
  it('stores the dirty flag instead of pretending the tab was saved', () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE));
    act(() => ctx.openPreview('saved text', 'code', { file_name: 'a.ts', fileRef: projectRef('a.ts') }));
    act(() => ctx.updateContent('edited but not saved'));
    flushPersist();

    const [stored] = storedTabs() as Array<{ isDirty?: boolean; content?: string; originalContent?: string }>;
    expect(stored.isDirty).toBe(true);
    expect(stored.content).toBe('edited but not saved');
    // The last saved text has to survive too, or the restored tab cannot tell what
    // changed and Cmd+S has nothing to compare against.
    expect(stored.originalContent).toBe('saved text');
  });

  it('restores the tab still marked unsaved', () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE));
    act(() => ctx.openPreview('saved text', 'code', { file_name: 'a.ts', fileRef: projectRef('a.ts') }));
    act(() => ctx.updateContent('edited but not saved'));
    flushPersist();

    // Leave and come back.
    act(() => ctx.closePreviewIfScopeChanged('/ws/other'));
    act(() => ctx.closePreviewIfScopeChanged(SCOPE));

    expect(ctx.tabs).toHaveLength(1);
    expect(ctx.tabs[0].isDirty).toBe(true);
    expect(ctx.tabs[0].content).toBe('edited but not saved');
  });

  it('leaves a saved tab clean', () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE));
    act(() => ctx.openPreview('untouched', 'code', { file_name: 'a.ts', fileRef: projectRef('a.ts') }));
    flushPersist();

    const [stored] = storedTabs() as Array<{ isDirty?: boolean }>;
    expect(stored.isDirty).toBe(false);
  });

  // A stored ref of the wrong shape leaves the tab unable to dedup or save. Keeping
  // it as a ref-less tab meant it reopened as a duplicate and could never be written.
  it('drops a restored tab whose stored ref is malformed', () => {
    localStorage.setItem(
      previewScopeStorageKey(SCOPE),
      JSON.stringify({
        isOpen: true,
        activeTabId: 'broken',
        tabs: [
          {
            id: 'broken',
            title: 'a.ts',
            content: 'x',
            content_type: 'code',
            metadata: { file_name: 'a.ts', fileRef: { kind: 'project', pe_id: 'peA' } },
          },
        ],
      })
    );

    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE));

    expect(ctx.tabs).toHaveLength(0);
  });

  it('keeps a restored tab whose stored ref is well formed', () => {
    localStorage.setItem(
      previewScopeStorageKey(SCOPE),
      JSON.stringify({
        isOpen: true,
        activeTabId: 'ok',
        tabs: [
          {
            id: 'ok',
            title: 'a.ts',
            content: 'x',
            content_type: 'code',
            metadata: { file_name: 'a.ts', fileRef: projectRef('a.ts') },
          },
        ],
      })
    );

    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE));

    expect(ctx.tabs).toHaveLength(1);
  });
});

describe('closing the panel does not discard the project’s tabs', () => {
  /** Open three tabs in SCOPE, one of them unsaved. */
  const openThree = (): void => {
    act(() => ctx.closePreviewIfScopeChanged(SCOPE));
    act(() => ctx.openPreview('one', 'code', { file_name: 'a.ts', fileRef: projectRef('a.ts') }));
    act(() => ctx.openPreview('two', 'code', { file_name: 'b.ts', fileRef: projectRef('b.ts') }));
    act(() => ctx.openPreview('three', 'code', { file_name: 'c.ts', fileRef: projectRef('c.ts') }));
    act(() => ctx.updateContent('three, edited'));
  };

  // The reported scenario, end to end: three tabs on disk, one click, three still
  // there. Before the split this left zero.
  it('keeps the stored list intact when the panel is closed', () => {
    mount();
    openThree();
    flushPersist();
    expect(storedTabs()).toHaveLength(3);

    act(() => ctx.closePreview());
    flushPersist();

    expect(storedTabs()).toHaveLength(3);
  });

  it('restores every tab after closing and switching back', () => {
    mount();
    openThree();
    flushPersist();

    act(() => ctx.closePreview());
    flushPersist();
    act(() => ctx.closePreviewIfScopeChanged('/ws/elsewhere'));
    act(() => ctx.closePreviewIfScopeChanged(SCOPE));

    expect(ctx.tabs).toHaveLength(3);
  });

  it('keeps the tabs in memory, only hiding the panel', () => {
    mount();
    openThree();

    act(() => ctx.closePreview());

    expect(ctx.isOpen).toBe(false);
    expect(ctx.tabs).toHaveLength(3);
  });

  it('still discards when asked explicitly', () => {
    mount();
    openThree();
    flushPersist();

    act(() => ctx.clearPreviewForScope());
    flushPersist();

    expect(ctx.tabs).toHaveLength(0);
    expect(storedTabs()).toHaveLength(0);
  });
});

// The LRU that bounds stored scopes ranks them by `savedAt`, so a write with no
// content change would make a scope look "hot" and outrank scopes that really do
// hold tabs. Hiding the panel must therefore not trigger a persist at all — which
// falls out of `closePreview` no longer touching `tabs`, but is worth pinning since
// the two features were built separately and only interact through this field.
describe('hiding the panel does not refresh the storage recency stamp', () => {
  const savedAt = (): number | undefined => {
    const raw = localStorage.getItem(previewScopeStorageKey(SCOPE));
    if (!raw) return undefined;
    return (JSON.parse(raw) as { savedAt?: number }).savedAt;
  };

  it('leaves savedAt untouched when the panel is closed', () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged(SCOPE));
    act(() => ctx.openPreview('body', 'code', { file_name: 'a.ts', fileRef: projectRef('a.ts') }));
    flushPersist();
    const before = savedAt();
    expect(before).toBeGreaterThan(0);

    // Advance real time so a fresh write would produce a visibly newer stamp.
    act(() => void vi.advanceTimersByTime(5_000));
    act(() => ctx.closePreview());
    flushPersist();

    expect(savedAt()).toBe(before);
  });
});

// Switching project must leave the incoming project's directories watched.
//
// Asserts the OUTCOME — the incoming project ends up watched — and nothing about the
// order in which the switch does its work. Both orders currently produce this same
// result, because the switch is synchronous and React flushes the subscription effect
// only after it returns; a test claiming to pin the order would be claiming a
// guarantee it does not provide.
describe('switching project keeps the new project watched', () => {
  const port = { subscribe: vi.fn(async () => ({ snapshots: [] })), unsubscribe: vi.fn() };

  beforeEach(() => {
    port.subscribe.mockClear();
    port.unsubscribe.mockClear();
    configurePreviewWatch(port);
    resetPreviewWatch();
  });

  // Uses a project with restored tabs, since a project with none would pass whether or
  // not the restore subscribed anything.
  //
  // (Written while investigating whether the release/restore order matters. It does
  // not, currently — see the comment on closePreviewIfScopeChanged — so this asserts
  // the outcome only.)
  it('holds the incoming project directory when its tabs are restored', () => {
    localStorage.setItem(
      previewScopeStorageKey('proj-b'),
      JSON.stringify({
        isOpen: true,
        activeTabId: 'tab-b',
        tabs: [
          {
            id: 'tab-b',
            title: 'b.ts',
            content: 'b',
            content_type: 'code',
            metadata: {
              file_name: 'b.ts',
              fileRef: { kind: 'project', pe_id: 'peB', relative_path: 'lib/b.ts' },
            },
          },
        ],
      })
    );

    mount();
    act(() => ctx.closePreviewIfScopeChanged('proj-a'));
    act(() => ctx.openPreview('a', 'code', { file_name: 'a.ts', fileRef: projectRef('src/a.ts') }));
    expect(currentPreviewWatchTargets().has(peKey('peA', 'src'))).toBe(true);

    act(() => ctx.closePreviewIfScopeChanged('proj-b'));

    // B's restored tab must be watched; A's must not still be.
    expect([...currentPreviewWatchTargets()]).toEqual([peKey('peB', 'lib')]);
  });

  it('leaves nothing watched when the incoming project has no tabs', () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged('proj-a'));
    act(() => ctx.openPreview('a', 'code', { file_name: 'a.ts', fileRef: projectRef('src/a.ts') }));

    act(() => ctx.closePreviewIfScopeChanged('proj-empty'));

    expect(currentPreviewWatchTargets().size).toBe(0);
  });
});
