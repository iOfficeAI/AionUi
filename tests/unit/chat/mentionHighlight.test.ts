/**
 * @vitest-environment node
 */

/**
 * "Coloured ⇔ a reference is attached."
 *
 * The overlay used to paint every match of the `@…` text pattern, so a
 * hand-typed mention looked identical to a picked one while attaching nothing.
 * The sharpest way to hit it is select-all + cut + paste: the reconciliation
 * retracts every reference while the input is briefly empty, the pasted text is
 * byte-identical, and the message goes out with no marker block. Since a pasted
 * token cannot be re-resolved (a conversation name is not a unique address),
 * making the loss visible is the fix — so these tests are about the loss being
 * visible, not just about colours.
 */

import { describe, expect, it } from 'vitest';

import { buildAttachedMentionRanges, type MentionToken } from '@/renderer/utils/chat/mentionHighlight';

const token = (start: number, end: number, query: string): MentionToken => ({ start, end, query });

const noFiles = { fileTokens: [] as MentionToken[], attachedFileKeys: new Set<string>() };
const noSessions = { sessionTokens: [] as MentionToken[], attachedSessionNames: [] as string[] };

describe('buildAttachedMentionRanges', () => {
  it('paints nothing when nothing is attached', () => {
    expect(buildAttachedMentionRanges({ ...noFiles, ...noSessions })).toEqual([]);
  });

  it('paints a file token that matches a selected file', () => {
    const ranges = buildAttachedMentionRanges({
      fileTokens: [token(0, 12, 'src/a.rs')],
      attachedFileKeys: new Set(['src/a.rs']),
      ...noSessions,
    });
    expect(ranges).toEqual([{ start: 0, end: 12 }]);
  });

  // The reported bug: typing the text alone attaches nothing.
  it('leaves a hand-typed file token unpainted', () => {
    const ranges = buildAttachedMentionRanges({
      fileTokens: [token(0, 12, 'src/a.rs')],
      attachedFileKeys: new Set(),
      ...noSessions,
    });
    expect(ranges).toEqual([]);
  });

  it('paints a session token whose name has a reference', () => {
    const ranges = buildAttachedMentionRanges({
      ...noFiles,
      sessionTokens: [token(3, 8, '你好')],
      attachedSessionNames: ['你好'],
    });
    expect(ranges).toEqual([{ start: 3, end: 8 }]);
  });

  it('leaves a hand-typed session token unpainted', () => {
    const ranges = buildAttachedMentionRanges({
      ...noFiles,
      sessionTokens: [token(3, 8, '你好')],
      attachedSessionNames: [],
    });
    expect(ranges).toEqual([]);
  });

  it('paints only as many repeated session tokens as there are references', () => {
    // Mirrors `reconcileSessionRefs`: two `@@你好` tokens and one reference means
    // exactly one of them is live.
    const ranges = buildAttachedMentionRanges({
      ...noFiles,
      sessionTokens: [token(0, 5, '你好'), token(6, 11, '你好')],
      attachedSessionNames: ['你好'],
    });
    expect(ranges).toEqual([{ start: 0, end: 5 }]);
  });

  it('paints both repeated session tokens when both have references', () => {
    const ranges = buildAttachedMentionRanges({
      ...noFiles,
      sessionTokens: [token(0, 5, '你好'), token(6, 11, '你好')],
      attachedSessionNames: ['你好', '你好'],
    });
    expect(ranges).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ]);
  });

  it('returns both lanes merged in ascending order', () => {
    // The overlay slices the text between ranges in order, so an out-of-order
    // range would produce a negative slice and silently drop text.
    const ranges = buildAttachedMentionRanges({
      fileTokens: [token(20, 30, 'src/a.rs')],
      attachedFileKeys: new Set(['src/a.rs']),
      sessionTokens: [token(3, 8, '你好')],
      attachedSessionNames: ['你好'],
    });
    expect(ranges).toEqual([
      { start: 3, end: 8 },
      { start: 20, end: 30 },
    ]);
  });

  it('paints an attached mention while leaving an unattached one plain', () => {
    // The mixed case the user actually hit.
    const ranges = buildAttachedMentionRanges({
      fileTokens: [token(3, 15, 'config.json')],
      attachedFileKeys: new Set(),
      sessionTokens: [token(20, 25, '你好')],
      attachedSessionNames: ['你好'],
    });
    expect(ranges).toEqual([{ start: 20, end: 25 }]);
  });

  it('matches a file on either of its keys', () => {
    // `getSelectedItemMatchKeys` yields relativePath AND path, so a token may
    // legitimately name either one.
    const byAbsolute = buildAttachedMentionRanges({
      fileTokens: [token(0, 20, '/abs/proj/src/a.rs')],
      attachedFileKeys: new Set(['src/a.rs', '/abs/proj/src/a.rs']),
      ...noSessions,
    });
    expect(byAbsolute).toHaveLength(1);
  });
});
