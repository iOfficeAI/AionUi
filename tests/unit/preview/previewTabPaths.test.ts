/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Path resolution behind the tab context menu's copy-path entries. The risky
 * part is not the happy path but deciding when a path is NOT copyable: a tab
 * whose absolute path never reached the renderer, a file that merely shares a
 * prefix with the workspace root, or a browser tab that has no file at all.
 * Getting those wrong hands the user a confidently wrong path.
 */

import { describe, expect, it } from 'vitest';
import {
  canCopyAbsolutePath,
  canRevealInFolder,
  previewTabPaths,
} from '@renderer/pages/conversation/Preview/components/PreviewPanel/previewTabPaths';
import type { PreviewTabPathSource } from '@renderer/pages/conversation/Preview/components/PreviewPanel/previewTabPaths';

const tab = (overrides: Partial<PreviewTabPathSource>): PreviewTabPathSource => ({
  content: '',
  content_type: 'code',
  ...overrides,
});

describe('previewTabPaths — file tabs', () => {
  it('reports a local ref path as the absolute path', () => {
    const paths = previewTabPaths(tab({ metadata: { fileRef: { kind: 'local', path: '/repo/src/main.ts' } } }));
    expect(paths.absolute).toEqual({ kind: 'filePath', value: '/repo/src/main.ts' });
  });

  it('derives the relative path from the workspace root', () => {
    const paths = previewTabPaths(
      tab({
        metadata: { fileRef: { kind: 'local', path: '/repo/src/main.ts' }, workspace: '/repo' },
      })
    );
    expect(paths.relative).toBe('src/main.ts');
  });

  it('tolerates a workspace root written with a trailing separator', () => {
    const paths = previewTabPaths(
      tab({
        metadata: { fileRef: { kind: 'local', path: '/repo/src/main.ts' }, workspace: '/repo/' },
      })
    );
    expect(paths.relative).toBe('src/main.ts');
  });

  it('refuses a relative path when the root only shares a prefix', () => {
    // `/repo-backup` is not inside `/repo`, however alike the strings look.
    const paths = previewTabPaths(
      tab({
        metadata: { fileRef: { kind: 'local', path: '/repo-backup/src/main.ts' }, workspace: '/repo' },
      })
    );
    expect(paths.relative).toBeUndefined();
    expect(paths.absolute).toEqual({ kind: 'filePath', value: '/repo-backup/src/main.ts' });
  });

  it('refuses a relative path when the file sits outside the workspace', () => {
    const paths = previewTabPaths(
      tab({
        metadata: { fileRef: { kind: 'local', path: '/tmp/scratch.txt' }, workspace: '/repo' },
      })
    );
    expect(paths.relative).toBeUndefined();
  });

  it('omits the relative path when no workspace root is known', () => {
    const paths = previewTabPaths(tab({ metadata: { fileRef: { kind: 'local', path: '/repo/src/main.ts' } } }));
    expect(paths.relative).toBeUndefined();
  });

  it('falls back to file_path for viewers not yet migrated to fileRef', () => {
    const paths = previewTabPaths(tab({ metadata: { file_path: '/repo/doc.md', workspace: '/repo' } }));
    expect(paths).toEqual({ absolute: { kind: 'filePath', value: '/repo/doc.md' }, relative: 'doc.md' });
  });

  it('returns nothing copyable for a tab with no path at all', () => {
    expect(previewTabPaths(tab({ metadata: {} }))).toEqual({});
    expect(previewTabPaths(tab({}))).toEqual({});
  });

  it('treats a blank file_path as no path rather than copying whitespace', () => {
    expect(previewTabPaths(tab({ metadata: { file_path: '   ' } }))).toEqual({});
  });
});

describe('previewTabPaths — Windows paths', () => {
  // Runnable from any OS: these are string-shape cases, not filesystem calls.
  const winTab = (path: string, workspace: string) =>
    previewTabPaths(tab({ metadata: { fileRef: { kind: 'local', path }, workspace } }));

  it('splits on backslashes and keeps them in the result', () => {
    expect(winTab('C:\\repo\\src\\main.ts', 'C:\\repo').relative).toBe('src\\main.ts');
  });

  it('tolerates a root written with a trailing backslash', () => {
    expect(winTab('C:\\repo\\src\\main.ts', 'C:\\repo\\').relative).toBe('src\\main.ts');
  });

  it('still refuses a sibling that merely shares a prefix', () => {
    expect(winTab('C:\\repo-backup\\src\\main.ts', 'C:\\repo').relative).toBeUndefined();
  });

  it('matches despite a drive letter written in a different case', () => {
    // Windows paths are case-insensitive, and the two strings reach us from
    // different sources; a byte-wise compare greyed the entry out for no reason.
    expect(winTab('c:\\repo\\src\\main.ts', 'C:\\repo').relative).toBe('src\\main.ts');
  });

  it('matches despite a directory written in a different case', () => {
    expect(winTab('C:\\Repo\\src\\main.ts', 'c:\\repo').relative).toBe('src\\main.ts');
  });

  it('keeps POSIX comparison case-sensitive, where the cases are two directories', () => {
    const paths = previewTabPaths(
      tab({ metadata: { fileRef: { kind: 'local', path: '/home/me/Repo/a.ts' }, workspace: '/home/me/repo' } })
    );
    expect(paths.relative).toBeUndefined();
  });
});

describe('previewTabPaths — project refs', () => {
  it('uses the ref identity as the relative path', () => {
    const paths = previewTabPaths(
      tab({ metadata: { fileRef: { kind: 'project', pe_id: 'pe-1', relative_path: 'src/app.tsx' } } })
    );
    expect(paths.relative).toBe('src/app.tsx');
  });

  it('routes the absolute path through the backend when the renderer never got one', () => {
    // Explorer-opened tabs deliberately carry no absolute path — the renderer is
    // never given one. Copying it has to go back to the backend, which resolves
    // the ref and writes the clipboard itself.
    const paths = previewTabPaths(
      tab({ metadata: { fileRef: { kind: 'project', pe_id: 'pe-1', relative_path: 'src/app.tsx' } } })
    );
    expect(paths.absolute).toEqual({ kind: 'projectRef', pe_id: 'pe-1', relative_path: 'src/app.tsx' });
  });

  it('prefers an absolute path the renderer already holds over a backend round-trip', () => {
    const paths = previewTabPaths(
      tab({
        metadata: {
          fileRef: { kind: 'project', pe_id: 'pe-1', relative_path: 'src/app.tsx' },
          file_path: '/repo/src/app.tsx',
        },
      })
    );
    expect(paths.absolute).toEqual({ kind: 'filePath', value: '/repo/src/app.tsx' });
  });
});

describe('previewTabPaths — browser tabs', () => {
  it('copies the URL as the tab address', () => {
    const paths = previewTabPaths(tab({ content: 'https://example.com/docs', content_type: 'browser' }));
    expect(paths.absolute).toEqual({ kind: 'url', value: 'https://example.com/docs' });
  });

  it('offers no relative path, which is meaningless for a URL', () => {
    const paths = previewTabPaths(
      tab({ content: 'https://example.com/docs', content_type: 'browser', metadata: { workspace: '/repo' } })
    );
    expect(paths.relative).toBeUndefined();
  });

  it('returns nothing copyable for a blank browser tab', () => {
    expect(previewTabPaths(tab({ content: '   ', content_type: 'browser' }))).toEqual({});
  });
});

describe('canCopyAbsolutePath — runtime gate', () => {
  it('offers a backend-resolved path on the desktop', () => {
    expect(canCopyAbsolutePath({ kind: 'projectRef', pe_id: 'pe-1', relative_path: 'a.ts' }, true)).toBe(true);
  });

  it('withholds it from a remote WebUI, which must not see host device paths', () => {
    expect(canCopyAbsolutePath({ kind: 'projectRef', pe_id: 'pe-1', relative_path: 'a.ts' }, false)).toBe(false);
  });

  it('copies a path the renderer already holds regardless of runtime', () => {
    expect(canCopyAbsolutePath({ kind: 'filePath', value: '/repo/a.ts' }, false)).toBe(true);
    expect(canCopyAbsolutePath({ kind: 'filePath', value: '/repo/a.ts' }, true)).toBe(true);
  });

  it('has nothing to offer when the tab has no address', () => {
    expect(canCopyAbsolutePath(undefined, true)).toBe(false);
  });
});

describe('canRevealInFolder — runtime gate', () => {
  it('reveals a project file through the backend on the desktop', () => {
    expect(canRevealInFolder({ kind: 'projectRef', pe_id: 'pe-1', relative_path: 'a.ts' }, true)).toBe(true);
  });

  it('reveals a path the renderer already holds on the desktop', () => {
    expect(canRevealInFolder({ kind: 'filePath', value: '/repo/a.ts' }, true)).toBe(true);
  });

  it('refuses a browser tab, whose URL has no containing folder', () => {
    // The split that makes this possible: a URL must never reach showItemInFolder.
    expect(canRevealInFolder({ kind: 'url', value: 'https://example.com' }, true)).toBe(false);
  });

  it('refuses off the desktop, where the file manager would open on another machine', () => {
    expect(canRevealInFolder({ kind: 'filePath', value: '/repo/a.ts' }, false)).toBe(false);
    expect(canRevealInFolder({ kind: 'projectRef', pe_id: 'pe-1', relative_path: 'a.ts' }, false)).toBe(false);
  });

  it('has nothing to reveal when the tab has no address', () => {
    expect(canRevealInFolder(undefined, true)).toBe(false);
  });
});
