/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// A delta op this build does not handle must not pass in silence.
//
// `applyDelta` skipping unknown ops is deliberate — it is what lets the backend ship a
// protocol addition before the frontend handles it. The cost is that the gap is
// invisible: the `modified` op was being sent and dropped here for several rounds of
// work, because "silently ignored" and "never sent" look identical from the frontend.
//
// So the skip stays (a newer backend must keep working) and the drift says so once.
// Once, not every time: an unknown op usually arrives with every delta for the rest of
// the session, and a console filled with one repeated line is read as noise.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDelta, peKey, type Change, type FactCache } from '@/renderer/pages/conversation/explorer/explorerModel';

const KEY = peKey('peA', 'src');

const cacheWith = (...names: string[]): FactCache =>
  new Map([[KEY, names.map((name) => ({ name, kind: 'file' as const }))]]);

/**
 * An op from a future backend. Cast because the union deliberately excludes it.
 *
 * Each test passes its own `op` string: "already reported" is module-level state that
 * outlives a single test, so a shared name would make these results depend on execution
 * order — the second test to use it would see no warning and pass or fail for a reason
 * that has nothing to do with what it asserts.
 */
const futureOp = (op: string, name: string): Change => ({ op, name }) as unknown as Change;

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // `mockClear` matters: spying on an already-spied method hands back the existing mock
  // rather than a fresh one, so without this a previous test's warning is still in
  // `mock.calls` and the "says nothing" assertion below fails on someone else's call.
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  warn.mockClear();
});

describe('an unrecognised fs/delta op', () => {
  it('is reported rather than dropped in silence', () => {
    applyDelta(cacheWith('a.ts'), KEY, [futureOp('opReported', 'a.ts')]);

    expect(warn).toHaveBeenCalled();
    // The message has to name the op, or it cannot be acted on.
    expect(String(warn.mock.calls[0]?.[0])).toContain('opReported');
  });

  it('leaves the listing untouched instead of throwing', () => {
    const before = cacheWith('a.ts', 'b.ts');

    const after = applyDelta(before, KEY, [futureOp('opUntouched', 'a.ts')]);

    expect(after.get(KEY)?.map((entry) => entry.name)).toEqual(['a.ts', 'b.ts']);
  });

  // Ops the build does understand must stay silent, or the warning becomes noise and
  // stops being read — including `modified`, which this cache legitimately ignores.
  it('says nothing about ops this build handles', () => {
    applyDelta(cacheWith('a.ts'), KEY, [
      { op: 'modified', name: 'a.ts' },
      { op: 'added', name: 'new.ts', kind: 'file' },
      { op: 'removed', name: 'a.ts' },
      { op: 'renamed', from: 'new.ts', to: 'moved.ts' },
    ]);

    expect(warn).not.toHaveBeenCalled();
  });

  // Three occurrences of one op, one warning. Scoped to a single delta on purpose: the
  // "already reported" set is module-level, so asserting across deltas would be
  // asserting on state this test does not own.
  it('does not repeat itself for the same op within one delta', () => {
    applyDelta(cacheWith('a.ts'), KEY, [
      futureOp('opOnce', 'a.ts'),
      futureOp('opOnce', 'b.ts'),
      futureOp('opOnce', 'c.ts'),
    ]);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
