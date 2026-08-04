import { describe, expect, it } from 'vitest';
import {
  batchNeedsCloseConfirm,
  canOpenInSystem,
  classifySaveOutcome,
  dirtyTabsInBatch,
  isOpenableFileRef,
  shouldOfferOpenInSystem,
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

// Closing one dirty tab always asked for confirmation; closing several at once
// (left / right / others / all, or collapsing the panel) went straight through and
// discarded the edits. These pin the guard that removes that asymmetry — the
// unsafe path was also the easier one to reach (a right-click).
const clean = (id: string) => ({ id });
const dirty = (id: string) => ({ id, isDirty: true });
const httpError = (status: number): Error =>
  Object.assign(new Error(`Backend PUT failed (${status})`), { name: 'BackendHttpError', status });

describe('batch close confirmation', () => {
  describe('dirtyTabsInBatch', () => {
    it('picks out only the unsaved tabs', () => {
      expect(dirtyTabsInBatch([clean('a'), dirty('b'), clean('c'), dirty('d')]).map((t) => t.id)).toEqual(['b', 'd']);
    });

    it('returns nothing for an all-clean batch', () => {
      expect(dirtyTabsInBatch([clean('a'), clean('b')])).toEqual([]);
    });

    // `isDirty` is optional, and only an explicit true counts.
    it('treats a missing or false isDirty as clean', () => {
      expect(dirtyTabsInBatch([{ id: 'a' }, { id: 'b', isDirty: false }])).toEqual([]);
    });

    it('handles an empty batch', () => {
      expect(dirtyTabsInBatch([])).toEqual([]);
    });
  });

  describe('batchNeedsCloseConfirm', () => {
    it('requires confirmation when any tab is unsaved', () => {
      expect(batchNeedsCloseConfirm([clean('a'), dirty('b')])).toBe(true);
    });

    it('requires confirmation for a single unsaved tab', () => {
      expect(batchNeedsCloseConfirm([dirty('a')])).toBe(true);
    });

    // A prompt with nothing at stake only trains the user to dismiss prompts.
    it('closes an all-clean batch without asking', () => {
      expect(batchNeedsCloseConfirm([clean('a'), clean('b'), clean('c')])).toBe(false);
    });

    it('does not ask about an empty batch', () => {
      expect(batchNeedsCloseConfirm([])).toBe(false);
    });
  });
});

// A save that failed must never be reported as one that succeeded. The original
// bug: Ctrl+S ran `void saveContent()`, so a refused write produced no message and
// the tab kept its post-save look — the user believed the edit was on disk.
describe('classifySaveOutcome', () => {
  it('reports a successful write as saved', () => {
    expect(classifySaveOutcome(true)).toEqual({ kind: 'saved' });
  });

  // 409 means conflict detection worked and the file moved under us — it needs its
  // own wording, not a generic failure.
  it('classifies a 409 as a conflict', () => {
    expect(classifySaveOutcome(undefined, httpError(409))).toEqual({ kind: 'conflict' });
  });

  it('classifies other backend errors as plain failures', () => {
    expect(classifySaveOutcome(undefined, httpError(500)).kind).toBe('failed');
  });

  // The trap: `false` is a refusal, and must not fall through to 'saved'.
  it('treats a false result as a failure, not a success', () => {
    expect(classifySaveOutcome(false)).toEqual({ kind: 'failed' });
  });

  it('treats an undefined result as a failure', () => {
    expect(classifySaveOutcome(undefined)).toEqual({ kind: 'failed' });
  });

  it('carries the error message as detail when there is one', () => {
    const outcome = classifySaveOutcome(undefined, new Error('disk went away'));
    expect(outcome).toEqual({ kind: 'failed', detail: 'disk went away' });
  });

  it('handles a non-Error throw without inventing a detail', () => {
    expect(classifySaveOutcome(undefined, 'something odd')).toEqual({ kind: 'failed', detail: undefined });
  });

  // An error takes precedence: a stale `true` alongside a rejection must not win.
  it('prefers the error over a resolved value', () => {
    expect(classifySaveOutcome(true, httpError(409))).toEqual({ kind: 'conflict' });
  });
});

// The escape hatch. When the panel cannot show a file, "open in system" is the only
// route the user has to their own file — so the type whitelist must layer ON TOP of
// that, never replace it. Filtering the escape-hatch states by content type leaves a
// tab that says "open this in a system editor" above no button at all.
describe('shouldOfferOpenInSystem', () => {
  const BUILTIN = ['word', 'ppt', 'pdf', 'excel'] as const;

  describe('escape hatch — never filtered by type', () => {
    it('offers it for an oversized text file, which no whitelist would include', () => {
      expect(shouldOfferOpenInSystem('code', true, BUILTIN)).toBe(true);
    });

    it('offers it for an oversized markdown file', () => {
      expect(shouldOfferOpenInSystem('markdown', true, BUILTIN)).toBe(true);
    });

    it('offers it for an unsupported format', () => {
      expect(shouldOfferOpenInSystem('unsupported', false, BUILTIN)).toBe(true);
    });

    // The regression that matters: an empty whitelist must not disarm the hatch.
    it('still offers it when the whitelist is empty', () => {
      expect(shouldOfferOpenInSystem('code', true, [])).toBe(true);
      expect(shouldOfferOpenInSystem('unsupported', false, [])).toBe(true);
    });
  });

  describe('convenience — by type', () => {
    it.each(['word', 'ppt', 'pdf', 'excel'])('offers it for %s, better handled by a real app', (type) => {
      expect(shouldOfferOpenInSystem(type, false, BUILTIN)).toBe(true);
    });

    it.each(['markdown', 'code', 'csv', 'image', 'diff', 'html'])(
      'does not offer it for %s, which renders fine here',
      (type) => {
        expect(shouldOfferOpenInSystem(type, false, BUILTIN)).toBe(false);
      }
    );
  });
});

// A refusal that carries no explanation must not have its own text echoed back as
// detail: the caller prefixes detail with "save failed", so passing "save failed"
// through produced "save failed: save failed".
describe('classifySaveOutcome and bare refusals', () => {
  it('reports a refusal without inventing a detail to append', () => {
    const refusal = Object.assign(new Error('save refused'), { name: 'SaveRefusedError' });
    expect(classifySaveOutcome(undefined, refusal)).toEqual({ kind: 'failed' });
  });

  it('still surfaces detail from a genuine error', () => {
    expect(classifySaveOutcome(undefined, new Error('disk full'))).toEqual({
      kind: 'failed',
      detail: 'disk full',
    });
  });

  it('a conflict still wins over the refusal check', () => {
    const conflict = Object.assign(new Error('save refused'), { name: 'SaveRefusedError', status: 409 });
    expect(classifySaveOutcome(undefined, conflict)).toEqual({ kind: 'conflict' });
  });
});
