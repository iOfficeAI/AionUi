/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import {
  buildAtSessionInsertion,
  escapeAtSessionName,
  getActiveAtSessionQuery,
  getAllAtSessionQueries,
  isAtSessionBoundaryChar,
} from '@/renderer/utils/chat/atSessionQuery';
import { escapeAtFilePath, getActiveAtFileQuery, getAllAtFileQueries } from '@/renderer/utils/chat/atFileQuery';
import {
  applyMentionInsertion,
  insertMentionAtCaret,
  shouldAppendSpaceAfterMention,
} from '@/renderer/utils/chat/mentionInsertion';

describe('shouldAppendSpaceAfterMention', () => {
  it('appends when the mention ends the input', () => {
    const value = 'ask @@auth';
    expect(shouldAppendSpaceAfterMention(value, value.length)).toBe(true);
  });

  it('does not append when a space already follows', () => {
    // `hi @@auth world` — tokenEnd points AT the space, so adding another would
    // leave a double space.
    expect(shouldAppendSpaceAfterMention('hi @@auth world', 9)).toBe(false);
  });

  it('does not append when punctuation follows', () => {
    // `hi @@auth, and` — a space here would push the comma off its word.
    expect(shouldAppendSpaceAfterMention('hi @@auth, and', 9)).toBe(false);
  });

  it('appends for an empty input whose token is the whole value', () => {
    expect(shouldAppendSpaceAfterMention('@@a', 3)).toBe(true);
  });

  it('treats an out-of-range end as the end of the input', () => {
    expect(shouldAppendSpaceAfterMention('@@a', 99)).toBe(true);
  });
});

/**
 * The splice and the caret together, driven through the REAL query function so
 * the `start`/`end` under test are the ones the send box actually passes.
 */
describe('applyMentionInsertion', () => {
  /** What the send box does when a picker item is chosen. */
  const pick = (value: string, caretPosition: number, name: string) => {
    const query = getActiveAtSessionQuery(value, caretPosition);
    if (!query) throw new Error(`no active query in ${JSON.stringify(value)} at ${caretPosition}`);
    return applyMentionInsertion(value, query.start, query.end, buildAtSessionInsertion(name));
  };

  it('appends a space and puts the caret after it at the end of the input', () => {
    const value = '问下 @@重构';
    const result = pick(value, value.length, '重构-鉴权模块');
    expect(result.value).toBe('问下 @@重构-鉴权模块 ');
    expect(result.caret).toBe(result.value.length);
    // The caret past the space is what closes the picker.
    expect(getActiveAtSessionQuery(result.value, result.caret)).toBeNull();
  });

  it('does not double the space when text already follows', () => {
    const value = '问下 @@重构 那件事';
    const caret = value.indexOf(' 那件事');
    const result = pick(value, caret, '重构-鉴权模块');
    expect(result.value).toBe('问下 @@重构-鉴权模块 那件事');
    expect(result.value).not.toContain('  ');
    // Caret sits at the end of the mention, before the existing separator.
    expect(result.value.slice(result.caret)).toBe(' 那件事');
  });

  it('leaves punctuation attached to the mention', () => {
    const value = 'ask @@auth, now';
    const caret = value.indexOf(',');
    const result = pick(value, caret, 'auth rewrite');
    expect(result.value).toBe('ask @@auth\\ rewrite, now');
    expect(result.value).not.toContain(' ,');
  });

  /// Pre-existing, and NOT introduced by the trailing space: the boundary set is
  /// `/[\s,;!?()[\]{}]/`, which is ASCII-only, so CJK punctuation counts as part
  /// of the name. `@@重构，急` is therefore one token ending at the input's end,
  /// and completing it replaces the comma too. Pinned so the next reader does
  /// not mistake it for a regression in the insertion rule.
  it('treats CJK punctuation as part of the token, not as a separator', () => {
    const value = '问下 @@重构，急';
    const query = getActiveAtSessionQuery(value, value.length);
    expect(query?.query).toBe('重构，急');
    expect(query?.end).toBe(value.length);
  });

  it('escapes a name containing spaces and still appends the separator', () => {
    const value = '问下 @@my';
    const result = pick(value, value.length, 'my session');
    // The name's own space is escaped; the appended one is not, so the token
    // still ends where the parser thinks it does.
    expect(result.value).toBe('问下 @@my\\ session ');
    expect(getAllAtSessionQueries(result.value).map((token) => token.query)).toEqual(['my session']);
  });

  it('supports a second mention typed straight after the first', () => {
    const first = pick('问下 @@重构', '问下 @@重构'.length, '重构-鉴权模块');
    const typed = `${first.value}@@文档`;
    const second = pick(typed, typed.length, '文档站改版');
    expect(second.value).toBe('问下 @@重构-鉴权模块 @@文档站改版 ');
    expect(getAllAtSessionQueries(second.value).map((token) => token.query)).toEqual(['重构-鉴权模块', '文档站改版']);
  });
});

/**
 * The behaviour the trailing space exists for. Both lanes require the candidate
 * `@` to be preceded by a boundary character, so a mention left flush against
 * the caret makes the NEXT mention unparseable — the scan falls back to the
 * first `@` and searches for a name containing the second one.
 */
describe('a second mention is only reachable after a separator', () => {
  it('parses the second `@@` once the first ends with a space', () => {
    const value = '问下 @@重构-鉴权模块 @@文档站';
    const active = getActiveAtSessionQuery(value, value.length);
    expect(active?.query).toBe('文档站');
    expect(getAllAtSessionQueries(value).map((token) => token.query)).toEqual(['重构-鉴权模块', '文档站']);
  });

  it('misreads the second `@@` when the first has no separator', () => {
    // Pinned as the pre-existing hazard, not as desired behaviour: without the
    // space the whole run is read as ONE token whose name contains `@@`.
    const value = '问下 @@重构@@文档站';
    const tokens = getAllAtSessionQueries(value);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].query).toContain('@@');
  });

  it('parses the second `@` once the first ends with a space', () => {
    const value = 'look at @src/a.rs @src/b.rs';
    const active = getActiveAtFileQuery(value, value.length);
    expect(active?.query).toBe('src/b.rs');
  });

  it('misreads the second `@` when the first has no separator', () => {
    const value = 'look at @src/a.rs@src/b.rs';
    const active = getActiveAtFileQuery(value, value.length);
    // Anchors on the FIRST `@`, so the query swallows both paths.
    expect(active?.query).toBe('src/a.rs@src/b.rs');
  });
});

/**
 * The secondary benefit: the caret landing past a boundary character closes the
 * picker without help from the dismissal key.
 */
describe('the caret after a trailing space closes the picker', () => {
  it('reports no active session query', () => {
    const value = '问下 @@重构-鉴权模块 ';
    expect(getActiveAtSessionQuery(value, value.length)).toBeNull();
  });

  it('reports no active file query', () => {
    const value = 'look at @src/a.rs ';
    expect(getActiveAtFileQuery(value, value.length)).toBeNull();
  });

  it('still reports the token when the caret moves back inside it', () => {
    // Why the dismissal key stays: the menu must be suppressible here too.
    const value = '问下 @@重构-鉴权模块 ';
    const insideToken = value.indexOf('鉴权');
    expect(getActiveAtSessionQuery(value, insideToken)?.query).toBe('重构-鉴权模块');
  });
});

/**
 * The escape set and the boundary set must agree.
 *
 * Each lane derives both from one character-class constant, but the invariant is
 * asserted as a black-box round trip rather than by comparing the two regexes:
 * what actually matters is the consequence. If a boundary character is not
 * escaped, the inserted token parses SHORT, and the reconciliation that matches a
 * selection against the token text stops recognising it and retracts the
 * reference — the silent-drop failure this feature keeps circling.
 *
 * The sample is every printable ASCII character plus a few whitespace and CJK
 * ones, so adding a character to either lane's set is covered automatically and
 * cannot drift away from a hand-maintained list.
 */
describe('every boundary character survives an insert/parse round trip', () => {
  const SAMPLE: string[] = [
    ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, index) => String.fromCharCode(0x20 + index)),
    '\t',
    '\n',
    '\r',
    ' ',
    '　',
    '中',
    '，',
    '：',
    '、',
  ];

  /** What the send box writes, then what the parser reads back out of it. */
  const sessionRoundTrip = (name: string): string | undefined =>
    getAllAtSessionQueries(`hi @@${escapeAtSessionName(name)}`)[0]?.query;

  const fileRoundTrip = (path: string): string | undefined =>
    getAllAtFileQueries(`hi @${escapeAtFilePath(path)}`)[0]?.query;

  it.each(SAMPLE.map((character) => [JSON.stringify(character), character] as const))(
    'session name containing %s round-trips',
    (_label, character) => {
      const name = `a${character}b`;
      expect(sessionRoundTrip(name)).toBe(name);
    }
  );

  it.each(SAMPLE.map((character) => [JSON.stringify(character), character] as const))(
    'file path containing %s round-trips',
    (_label, character) => {
      const path = `dir/a${character}b.ts`;
      expect(fileRoundTrip(path)).toBe(path);
    }
  );
});

/**
 * Inserting a mention at the caret, with no token to replace — the path taken
 * when the target comes from a conversation chip on an earlier message instead of
 * from the picker.
 */
describe('insertMentionAtCaret', () => {
  const at = (value: string, caret: number, insertion = '@@周总结') =>
    insertMentionAtCaret(value, caret, insertion, isAtSessionBoundaryChar);

  it('inserts into an empty input without stray separators', () => {
    const result = at('', 0);
    expect(result.value).toBe('@@周总结 ');
    expect(result.caret).toBe(result.value.length);
  });

  // The trap: both lanes require the opening `@` to follow a boundary, so
  // `问他@@周总结` would not parse at all and the reference would be retracted.
  it('adds a leading separator when the caret follows a word', () => {
    const result = at('问他', 2);
    expect(result.value).toBe('问他 @@周总结 ');
    expect(getAllAtSessionQueries(result.value).map((token) => token.query)).toEqual(['周总结']);
  });

  it('does not double a separator that is already there', () => {
    const result = at('问他 ', 3);
    expect(result.value).toBe('问他 @@周总结 ');
    expect(result.value).not.toContain('  ');
  });

  it('separates on both sides when inserting mid-text', () => {
    const result = at('问他觉得怎么样', 2);
    expect(result.value).toBe('问他 @@周总结 觉得怎么样');
    expect(getAllAtSessionQueries(result.value).map((token) => token.query)).toEqual(['周总结']);
  });

  it('reuses the existing separator on the trailing side', () => {
    const result = at('问他 觉得怎么样', 3);
    expect(result.value).toBe('问他 @@周总结 觉得怎么样');
    expect(result.value).not.toContain('  ');
  });

  it('leaves the caret after the whole mention so typing continues cleanly', () => {
    const result = at('问他', 2);
    expect(result.value.slice(result.caret)).toBe('');
    expect(getActiveAtSessionQuery(result.value, result.caret)).toBeNull();
  });

  it('clamps an out-of-range caret to the end', () => {
    const result = at('问他', 99);
    expect(result.value).toBe('问他 @@周总结 ');
  });

  it('parses alongside a mention that was already in the text', () => {
    const result = at('问下 @@重构-鉴权模块 然后', '问下 @@重构-鉴权模块 然后'.length);
    expect(getAllAtSessionQueries(result.value).map((token) => token.query)).toEqual(['重构-鉴权模块', '周总结']);
  });
});
