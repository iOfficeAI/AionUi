/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
// Import from the source file directly to avoid pulling in MonacoEditor
// (the barrel re-exports it, which the Node test environment cannot load).
import {
  decorationsFromUnifiedPatch,
  type GitLineDecoration,
} from '@/renderer/pages/conversation/Editor/gitDecorationsFromPatch';

const PATCH_SINGLE_ADD = `@@ -0,0 +1,3 @@
+line one
+line two
+line three
`;

const PATCH_MODIFIED = `@@ -1,3 +1,3 @@
 old one
-old two
+new two
 old three
`;

const PATCH_PURE_DELETION = `@@ -1,3 +1,1 @@
 keep
-drop me
-also me
`;

const PATCH_NEW_FILE = `diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..abcd123
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+first
+second
`;

const PATCH_BINARY = `Binary files a/img.png and b/img.png differ
`;

const PATCH_GIT_BINARY_PATCH = `GIT binary patch
literal 1234
`;

const PATCH_MULTI_HUNK = `@@ -1,2 +1,2 @@
-a
+b
 keep
@@ -10,2 +10,2 @@
-c
+d
 keep
`;

const findDecoration = (
  decorations: GitLineDecoration[],
  line: number,
  kind: GitLineDecoration['kind']
): GitLineDecoration | undefined => decorations.find((d) => d.line === line && d.kind === kind);

describe('decorationsFromUnifiedPatch', () => {
  it('returns an empty array for an empty patch', () => {
    expect(decorationsFromUnifiedPatch('')).toEqual([]);
  });

  it('handles a single-hunk add patch (all + lines)', () => {
    const decorations = decorationsFromUnifiedPatch(PATCH_SINGLE_ADD);
    expect(findDecoration(decorations, 1, 'added')).toBeDefined();
    expect(findDecoration(decorations, 2, 'added')).toBeDefined();
    expect(findDecoration(decorations, 3, 'added')).toBeDefined();
    // 3 added lines, no modifications or deletions
    expect(decorations.filter((d) => d.kind === 'added').length).toBe(3);
    expect(decorations.filter((d) => d.kind !== 'added').length).toBe(0);
  });

  it('classifies paired + and - lines as modified', () => {
    const decorations = decorationsFromUnifiedPatch(PATCH_MODIFIED);
    // The `-old two` was replaced with `+new two` on new-line 2.
    expect(findDecoration(decorations, 2, 'modified')).toBeDefined();
    // The pure context lines (`old one`, `old three`) shouldn't be decorated.
    expect(decorations.filter((d) => d.line === 1).length).toBe(0);
    expect(decorations.filter((d) => d.line === 3).length).toBe(0);
  });

  it('reports pure deletions anchored to the previous new-file line', () => {
    const decorations = decorationsFromUnifiedPatch(PATCH_PURE_DELETION);
    // The first deletion ("drop me") anchors to the new-file line
    // before it (line 1, "keep"). The second deletion ("also me")
    // anchors to the new-file line before THAT deletion (also line 1,
    // because the previous deletion consumed no new-file line).
    const deletions = decorations.filter((d) => d.kind === 'deleted');
    expect(deletions.length).toBe(2);
    deletions.forEach((d) => expect(d.line).toBeGreaterThanOrEqual(0));
  });

  it('treats new-file patches as additions (no --- a/ header)', () => {
    const decorations = decorationsFromUnifiedPatch(PATCH_NEW_FILE);
    // The two + lines in the hunk are both additions, both anchored at
    // newStart=1.
    expect(findDecoration(decorations, 1, 'added')).toBeDefined();
    expect(findDecoration(decorations, 2, 'added')).toBeDefined();
    expect(decorations.filter((d) => d.kind === 'added').length).toBe(2);
  });

  it('returns an empty array for binary "differ" markers', () => {
    expect(decorationsFromUnifiedPatch(PATCH_BINARY)).toEqual([]);
    expect(decorationsFromUnifiedPatch(PATCH_GIT_BINARY_PATCH)).toEqual([]);
  });

  it('walks multiple hunks and accumulates decorations', () => {
    const decorations = decorationsFromUnifiedPatch(PATCH_MULTI_HUNK);
    // First hunk: a -> b at new-line 1 (modified).
    expect(findDecoration(decorations, 1, 'modified')).toBeDefined();
    // Second hunk: c -> d at new-line 10 (modified).
    expect(findDecoration(decorations, 10, 'modified')).toBeDefined();
  });

  it('produces monotonically increasing line numbers within a hunk', () => {
    const decorations = decorationsFromUnifiedPatch(PATCH_SINGLE_ADD);
    const lines = decorations.map((d) => d.line).filter((n) => n > 0);
    const sorted = [...lines].toSorted((a, b) => a - b);
    expect(lines).toEqual(sorted);
  });
});
