/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getActiveAtFileQuery, getAllAtFileQueries } from '@/renderer/utils/chat/atFileQuery';
import {
  buildAtSessionInsertion,
  escapeAtSessionName,
  getActiveAtSessionQuery,
  getAllAtSessionQueries,
  resolveAtSessionMenuKey,
} from '@/renderer/utils/chat/atSessionQuery';

describe('getActiveAtSessionQuery', () => {
  it('recognises a `@@` token and returns the text after both @', () => {
    const value = 'hi @@auth';
    const query = getActiveAtSessionQuery(value, value.length);
    expect(query).not.toBeNull();
    expect(query!.query).toBe('auth');
    expect(query!.token).toBe('@@auth');
    expect(query!.start).toBe(3);
  });

  it('does not fire on a single `@`', () => {
    const value = 'hi @auth';
    expect(getActiveAtSessionQuery(value, value.length)).toBeNull();
  });

  it('fires at the start of the input', () => {
    const value = '@@auth';
    expect(getActiveAtSessionQuery(value, value.length)?.query).toBe('auth');
  });

  it('fires on a bare `@@` with nothing typed yet, so the picker can open', () => {
    const value = '@@';
    const query = getActiveAtSessionQuery(value, value.length);
    expect(query).not.toBeNull();
    expect(query!.query).toBe('');
  });

  it('does not fire when `@@` is glued to a preceding word', () => {
    const value = 'mail@@auth';
    expect(getActiveAtSessionQuery(value, value.length)).toBeNull();
  });

  it('stops the token at a boundary character', () => {
    const value = '@@auth, and more';
    const query = getActiveAtSessionQuery(value, 6);
    expect(query!.query).toBe('auth');
    expect(query!.end).toBe(6);
  });

  it('unescapes an escaped boundary inside the name', () => {
    const value = '@@my\\ session';
    expect(getActiveAtSessionQuery(value, value.length)?.query).toBe('my session');
  });

  it('returns null when the caret is before the token', () => {
    const value = 'hi @@auth';
    expect(getActiveAtSessionQuery(value, 1)).toBeNull();
  });

  it('does not fire for an escaped `@@`', () => {
    const value = 'hi \\@@auth';
    expect(getActiveAtSessionQuery(value, value.length)).toBeNull();
  });
});

describe('`@` / `@@` mutual exclusion', () => {
  it('the file matcher must not fire once `@@` matched', () => {
    const value = 'hi @@auth';
    expect(getActiveAtSessionQuery(value, value.length)).not.toBeNull();
    expect(getActiveAtFileQuery(value, value.length)).toBeNull();
  });

  it('the file matcher still fires for a plain single `@`', () => {
    const value = 'hi @src/auth.rs';
    expect(getActiveAtSessionQuery(value, value.length)).toBeNull();
    expect(getActiveAtFileQuery(value, value.length)?.query).toBe('src/auth.rs');
  });

  it('a `@@` earlier in the line does not suppress a later single `@`', () => {
    const value = '@@session then @src/auth.rs';
    expect(getActiveAtFileQuery(value, value.length)?.query).toBe('src/auth.rs');
  });

  it('getAllAtFileQueries skips `@@` tokens entirely', () => {
    // Reconciliation walks all tokens, so a `@@` leaking into the file lane
    // would make the file chip list fight the session chip list.
    const tokens = getAllAtFileQueries('@@one and @two');
    expect(tokens.map((t) => t.query)).toEqual(['two']);
  });
});

describe('getAllAtSessionQueries', () => {
  it('finds every `@@` token for reconciliation', () => {
    const tokens = getAllAtSessionQueries('@@one and @@two and @three');
    expect(tokens.map((t) => t.query)).toEqual(['one', 'two']);
  });

  it('returns an empty list when there are no `@@` tokens', () => {
    expect(getAllAtSessionQueries('@one @two')).toEqual([]);
  });

  it('does not double-count overlapping `@` characters', () => {
    const tokens = getAllAtSessionQueries('@@a @@b');
    expect(tokens).toHaveLength(2);
  });
});

describe('buildAtSessionInsertion', () => {
  it('escapes boundary characters in the name', () => {
    expect(buildAtSessionInsertion('my session')).toBe('@@my\\ session');
  });

  it('round-trips through the parser', () => {
    const inserted = buildAtSessionInsertion('重构 鉴权, 模块');
    const value = `hi ${inserted}`;
    expect(getActiveAtSessionQuery(value, value.length)?.query).toBe('重构 鉴权, 模块');
  });

  it('escapes a backslash so it does not swallow the next character', () => {
    expect(escapeAtSessionName('a\\b')).toBe('a\\\\b');
  });
});

describe('resolveAtSessionMenuKey', () => {
  it('Escape dismisses even with no items', () => {
    expect(resolveAtSessionMenuKey('Escape', false)).toBe('dismiss');
  });

  it('navigation and accept need items', () => {
    expect(resolveAtSessionMenuKey('ArrowDown', false)).toBeNull();
    expect(resolveAtSessionMenuKey('ArrowDown', true)).toBe('down');
    expect(resolveAtSessionMenuKey('ArrowUp', true)).toBe('up');
    expect(resolveAtSessionMenuKey('Enter', true)).toBe('accept');
    expect(resolveAtSessionMenuKey('Tab', true)).toBe('accept');
  });

  it('leaves unrelated keys unhandled so typing still works', () => {
    expect(resolveAtSessionMenuKey('a', true)).toBeNull();
    expect(resolveAtSessionMenuKey('Backspace', true)).toBeNull();
  });
});
