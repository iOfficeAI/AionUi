/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Parse a unified diff (the `patch` field of `GitDiffResult`) into a
 * compact list of line decorations suitable for Monaco's
 * `deltaDecorations` API on the **current file content** (post-change).
 *
 * Why post-change? The editor shows the working copy on disk. The user
 * wants to know which lines in the file *they're looking at* correspond
 * to additions, modifications, or deletions. The hunk header
 * `@@ -oldStart,oldCount +newStart,newCount @@` carries both sides, and
 * the per-line prefix (`+`, `-`, ` `) tells us which side a line belongs
 * to. By walking the hunk in order we can map each `+` line to an
 * absolute 1-based line number in the new file.
 *
 * Limitations / out of scope:
 *   - Binary files are skipped (no decorations — we can't even draw a
 *     meaningful gutter mark for a blob the user can't read).
 *   - Modifications are reported as a `modified` decoration on the new
 *     line that replaces the old; we do not attempt to surface intra-
 *     line changes.
 *   - Deletions (pure `-` lines) are exposed with `line: 0` and the
 *     consumer can choose to skip them or anchor them to the previous
 *     visible new-file line. We do not invent a line number.
 *   - "New file" patches (no `--- a/...` header) treat every line as
 *     `added` starting at the hunk's newStart.
 */

/** A single line decoration in the working-copy file. */
export type GitLineDecoration = {
  /** 1-based line number in the new (post-change) file, or 0 for pure deletions. */
  line: number;
  kind: 'added' | 'modified' | 'deleted';
};

/** Regex matching the hunk header `@@ -a,b +c,d @@`. Groups capture the four numerics. */
const HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

const toInt = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Walk a unified diff and produce one decoration per meaningful line in
 * the new (post-change) file. The function is pure: no I/O, no Monaco
 * references. Test-friendly.
 */
export const decorationsFromUnifiedPatch = (patch: string): GitLineDecoration[] => {
  if (typeof patch !== 'string' || patch.length === 0) return [];

  const lines = patch.split(/\r?\n/);
  const result: GitLineDecoration[] = [];

  // Track whether this is a "new file" patch. Git produces
  //   diff --git a/<file> b/<file>
  //   new file mode 100644
  //   index 0000000..<sha>
  //   --- /dev/null
  //   +++ b/<file>
  // for untracked / newly-added files. Detect by the absence of `--- a/`
  // or the presence of `new file mode`. Either is enough; we use both
  // for robustness against weird patches.
  let isNewFile = false;
  for (const line of lines) {
    if (line.startsWith('new file mode')) {
      isNewFile = true;
      break;
    }
    if (line.startsWith('--- a/') || line.startsWith('--- "a/')) {
      isNewFile = false;
      break;
    }
  }

  // Detect binary files: git emits "Binary files ... differ" or a single
  // hunk whose first line is "GIT binary patch". Either is enough to
  // bail out — we cannot decorate a binary.
  for (const line of lines) {
    if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      return [];
    }
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith('@@')) {
      i += 1;
      continue;
    }
    const match = HUNK_HEADER_RE.exec(line);
    if (!match) {
      i += 1;
      continue;
    }
    const oldStart = toInt(match[1], 0);
    const newStart = toInt(match[3], 0);
    let newLine = newStart;
    void oldStart;
    i += 1;

    // Pre-scan the hunk: does it contain any `-` lines? If so, every
    // `+` line in the hunk is a modification (the hunk is a balanced
    // replacement). If the hunk is `+`-only, those lines are pure
    // additions. Pure-deletion hunks have no `+` lines to mark.
    const hunkStart = i;
    let hunkHasRemoval = false;
    let hunkHasAddition = false;
    while (i < lines.length) {
      const body = lines[i];
      if (body.startsWith('@@')) break;
      if (body && body[0] === '-') hunkHasRemoval = true;
      if (body && body[0] === '+') hunkHasAddition = true;
      i += 1;
    }
    const hunkEnd = i;
    let hunkLine = newStart;

    for (let j = hunkStart; j < hunkEnd; j += 1) {
      const body = lines[j];
      if (body === '') {
        // Trailing blank after the last hunk line — not part of the diff body.
        continue;
      }
      const prefix = body[0];
      if (prefix === '+') {
        if (isNewFile) {
          result.push({ line: hunkLine, kind: 'added' });
        } else if (hunkHasRemoval) {
          result.push({ line: hunkLine, kind: 'modified' });
        } else {
          result.push({ line: hunkLine, kind: 'added' });
        }
        hunkLine += 1;
      } else if (prefix === '-') {
        // Pure deletion lines in the old file. When the hunk also adds
        // lines (`+`), the `+` side is marked `modified` — skip deleted
        // anchors so we do not paint unchanged context lines (e.g. line 1
        // above a one-line replace).
        if (!hunkHasAddition) {
          const anchor = hunkLine > newStart ? hunkLine - 1 : 0;
          result.push({ line: anchor, kind: 'deleted' });
        }
      } else if (prefix === ' ') {
        // Context line — exists in both old and new; not decorated.
        hunkLine += 1;
      } else if (prefix === '\\') {
        // "\ No newline at end of file" — meta, skip.
      } else {
        // Anything else (diff headers, etc.) — stop the hunk walk.
        break;
      }
    }
  }

  return result;
};
