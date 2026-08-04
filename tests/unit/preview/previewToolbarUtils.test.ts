import { describe, expect, it } from 'vitest';
import {
  canOpenInSystem,
  isOpenableFileRef,
  shouldShowDownload,
  wouldDownloadEmptyFile,
} from '@renderer/pages/conversation/Preview/components/PreviewPanel/previewToolbarUtils';

describe('shouldShowDownload', () => {
  it('hides download for on-disk code files', () => {
    expect(shouldShowDownload('code', true)).toBe(false);
  });
  it('hides download for on-disk markdown files', () => {
    expect(shouldShowDownload('markdown', true)).toBe(false);
  });
  it('shows download for synthetic (no file_path) markdown', () => {
    expect(shouldShowDownload('markdown', false)).toBe(true);
  });
  it('shows download for code without a backing file', () => {
    expect(shouldShowDownload('code', false)).toBe(true);
  });
  it('shows download for other content types', () => {
    expect(shouldShowDownload('html', true)).toBe(true);
    expect(shouldShowDownload('diff', true)).toBe(true);
  });
});

const projectRef = (relative_path: string) => ({ kind: 'project' as const, pe_id: 'peA', relative_path });

// A project ref addresses a file by pe root + relative path; '' means the root
// directory itself. Since the "open in system" condition was widened to accept any
// ref, a ref that cannot name a file must not slip through — shell-opening a
// directory is not what the button promises.
describe('isOpenableFileRef', () => {
  it('accepts a project ref that names a file', () => {
    expect(isOpenableFileRef(projectRef('docs/readme.md'))).toBe(true);
  });

  // The trap: '' is the pe root, i.e. a directory.
  it('rejects a project ref whose relative_path is empty (the pe root directory)', () => {
    expect(isOpenableFileRef(projectRef(''))).toBe(false);
  });

  it('rejects a project ref whose relative_path is only whitespace', () => {
    expect(isOpenableFileRef(projectRef('   '))).toBe(false);
  });

  it('accepts local and upload refs with a path', () => {
    expect(isOpenableFileRef({ kind: 'local', path: '/abs/a.txt' })).toBe(true);
    expect(isOpenableFileRef({ kind: 'upload', path: '/uploads/b.txt' })).toBe(true);
  });

  it('rejects local and upload refs with an empty path', () => {
    expect(isOpenableFileRef({ kind: 'local', path: '' })).toBe(false);
    expect(isOpenableFileRef({ kind: 'upload', path: '  ' })).toBe(false);
  });

  it('rejects a missing ref', () => {
    expect(isOpenableFileRef(undefined)).toBe(false);
  });
});

// The escape hatch for tabs that cannot be previewed. An explorer-opened file
// carries only a ChatFileRef (no absolute path, deliberately), so requiring a
// file_path left oversized files from the tree with nothing the user could click.
describe('canOpenInSystem', () => {
  const fileRef = { kind: 'project' as const, pe_id: 'peA', relative_path: 'docs/a.md' };
  const rootRef = { kind: 'project' as const, pe_id: 'peA', relative_path: '' };

  it('allows opening with only a fileRef — the explorer case', () => {
    expect(canOpenInSystem(false, fileRef)).toBe(true);
  });
  it('allows opening with only a file_path — legacy entry points', () => {
    expect(canOpenInSystem(true, undefined)).toBe(true);
  });
  it('allows opening when both identities are present', () => {
    expect(canOpenInSystem(true, fileRef)).toBe(true);
  });
  it('refuses when the tab has no identity at all (e.g. mermaid)', () => {
    expect(canOpenInSystem(false, undefined)).toBe(false);
  });
  it('refuses a root-directory ref rather than offering to shell-open a folder', () => {
    expect(canOpenInSystem(false, rootRef)).toBe(false);
  });
  it('still allows opening when a root ref is paired with a real file_path', () => {
    expect(canOpenInSystem(true, rootRef)).toBe(true);
  });
});

// Guards a silent data error: an oversized tab holds no content, so writing it out
// yields a 0-byte file while the browser reports a successful download.
describe('wouldDownloadEmptyFile', () => {
  it('flags an oversized tab with no disk path — the 0-byte case', () => {
    expect(wouldDownloadEmptyFile(true, false)).toBe(true);
  });
  it('allows an oversized tab that can copy the real file from disk', () => {
    expect(wouldDownloadEmptyFile(true, true)).toBe(false);
  });
  it('does not interfere with normal tabs that have content', () => {
    expect(wouldDownloadEmptyFile(false, false)).toBe(false);
    expect(wouldDownloadEmptyFile(false, true)).toBe(false);
  });
});
