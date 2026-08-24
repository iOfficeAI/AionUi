/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { reconcileSessionRefs } from '@/renderer/components/chat/SendBox/sessionMentionReconcile';

describe('reconcileSessionRefs', () => {
  const nameById = { c1: 'auth', c2: 'docs' };

  it('keeps refs whose token is still in the text', () => {
    const result = reconcileSessionRefs('@@auth hello', [{ id: 'c1' }], nameById);
    expect(result).toEqual([{ id: 'c1' }]);
  });

  it('drops a ref whose token the user deleted', () => {
    const result = reconcileSessionRefs('hello', [{ id: 'c1' }], nameById);
    expect(result).toEqual([]);
  });

  it('drops only the deleted one when several are referenced', () => {
    const result = reconcileSessionRefs('@@docs only', [{ id: 'c1' }, { id: 'c2' }], nameById);
    expect(result).toEqual([{ id: 'c2' }]);
  });

  it('keeps both refs when two conversations share a name and both tokens remain', () => {
    // Duplicate names are harmless: the wire carries ids.
    const dupes = { c1: 'same', c2: 'same' };
    const result = reconcileSessionRefs('@@same and @@same', [{ id: 'c1' }, { id: 'c2' }], dupes);
    expect(result).toEqual([{ id: 'c1' }, { id: 'c2' }]);
  });

  it('drops one of two same-named refs when only one token is left', () => {
    // The multiset behaviour: a plain Set would wrongly keep both.
    const dupes = { c1: 'same', c2: 'same' };
    const result = reconcileSessionRefs('@@same only once', [{ id: 'c1' }, { id: 'c2' }], dupes);
    expect(result).toEqual([{ id: 'c1' }]);
  });

  it('handles an escaped name', () => {
    const result = reconcileSessionRefs('@@my\\ session', [{ id: 'c3' }], { c3: 'my session' });
    expect(result).toEqual([{ id: 'c3' }]);
  });

  it('is a no-op for an empty selection', () => {
    expect(reconcileSessionRefs('@@auth', [], nameById)).toEqual([]);
  });

  it('keeps a ref whose name is unknown rather than silently discarding it', () => {
    // Losing the user's deliberate reference is worse than keeping a stale one.
    const result = reconcileSessionRefs('no tokens', [{ id: 'unknown' }], nameById);
    expect(result).toEqual([{ id: 'unknown' }]);
  });

  it('ignores single-`@` file tokens entirely', () => {
    const result = reconcileSessionRefs('@auth is a file', [{ id: 'c1' }], nameById);
    expect(result).toEqual([]);
  });

  it('drops every ref when the text is cleared', () => {
    const result = reconcileSessionRefs('', [{ id: 'c1' }, { id: 'c2' }], nameById);
    expect(result).toEqual([]);
  });
});
