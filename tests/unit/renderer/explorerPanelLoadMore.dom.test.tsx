/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression for AIONUI-22 (React #185 "Maximum update depth exceeded"): the arco
 * `loadMore` handler must be IDEMPOTENT. arco fires loadMore for any non-leaf node
 * lacking a `children` array — which includes an already-expanded dir whose WS
 * listing has not arrived yet (buildChildren returns undefined until the snapshot
 * lands). If loadMore re-added an already-expanded key it would keep producing
 * expand → commit → re-render → loadMore turns — the self-triggering loop that
 * crashes the app.
 *
 * arco's internal switcher wiring that fires loadMore is not reproducible under
 * jsdom (fireEvent does not reach it), so this drives the handler directly via a
 * captured-prop stub `Tree`, and asserts a loadMore on an already-expanded key is a
 * true no-op — no new expand, no new subscribe (both would restart the loop). A
 * loadMore on a NOT-yet-expanded key still expands (control), proving the guard
 * only suppresses the redundant re-add.
 */

import React from 'react';
import { act, render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({ initExplorerRuntime: () => ({}) }));

// Capture the `loadMore` prop arco would call, so it can be invoked directly — the
// switcher click that triggers it inside real arco is not reachable under jsdom.
let capturedLoadMore: ((node: unknown) => Promise<unknown>) | undefined;
vi.mock('@arco-design/web-react', async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    Tree: (props: { loadMore?: (node: unknown) => Promise<unknown> }) => {
      capturedLoadMore = props.loadMore;
      return null;
    },
  };
});

import type { DirRef, Entry, PeKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import { peKey, refToKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import type { MonitorPort } from '@/renderer/pages/conversation/explorer/explorerStore';
import * as explorerStore from '@/renderer/pages/conversation/explorer/explorerStore';
import {
  configureExplorerStore,
  getExplorerInternalsForTest,
  resetExplorerStoreForTest,
} from '@/renderer/pages/conversation/explorer/explorerStore';
import { ExplorerPanel } from '@/renderer/pages/conversation/explorer/ExplorerPanel';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

const dir = (name: string): Entry => ({ name, kind: 'dir' });
const file = (name: string): Entry => ({ name, kind: 'file' });

const makePort = (snapshots: Record<PeKey, Entry[]>) => {
  let subscribeCalls = 0;
  const port: MonitorPort = {
    subscribe: async (refs: DirRef[]) => {
      subscribeCalls++;
      return { snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })) };
    },
    unsubscribe: () => {},
  };
  return { port, calls: () => subscribeCalls };
};

const node = (key: PeKey) => ({ props: { dataRef: { key } } });

beforeEach(() => {
  resetExplorerStoreForTest();
  localStorage.clear();
  capturedLoadMore = undefined;
});
afterEach(() => cleanup());

describe('ExplorerPanel loadMore idempotency (AIONUI-22 #185 loop guard)', () => {
  it('a loadMore on an already-expanded key is a no-op — no new expand, no new subscribe', async () => {
    const rootKey = peKey('pe1', '');
    const h = makePort({ [rootKey]: [dir('sub'), file('a.ts')], [peKey('pe1', 'sub')]: [file('deep.ts')] });
    configureExplorerStore(h.port);
    render(<ExplorerPanel projectId='p1' roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]} />);
    await act(async () => {
      await flush();
    });

    // Root auto-expands on open; the store now holds it and has subscribed once.
    expect(getExplorerInternalsForTest().expanded).toContain(rootKey);
    expect(capturedLoadMore).toBeTypeOf('function');
    const subsAfterOpen = h.calls();
    const expandedAfterOpen = getExplorerInternalsForTest().expanded.length;

    // Spy setExpandedKeys AFTER open (open itself never calls it — root auto-expand
    // is internal). This asserts the guard at its source: a redundant loadMore must
    // not even CALL setExpandedKeys. Asserting only the store's expanded/subscribe
    // would be vacuous — Set dedup + the commit equality-bailout make a re-added key
    // a no-op downstream even WITHOUT the guard, so those alone can't prove Step 2.
    const setExpandedSpy = vi.spyOn(explorerStore, 'setExpandedKeys');

    // Repeated loadMore on the already-expanded root → guard skips every one →
    // setExpandedKeys is never called (the state churn that restarts the #185 loop),
    // and nothing observable changes.
    await act(async () => {
      await capturedLoadMore!(node(rootKey));
      await capturedLoadMore!(node(rootKey));
      await capturedLoadMore!(node(rootKey));
      await flush();
    });
    expect(setExpandedSpy).not.toHaveBeenCalled();
    expect(getExplorerInternalsForTest().expanded.length).toBe(expandedAfterOpen);
    expect(h.calls()).toBe(subsAfterOpen);

    // Control: loadMore on the NOT-yet-expanded 'sub' → it DOES call setExpandedKeys
    // and expands (+subscribe), so the guard suppresses only the redundant re-add,
    // not genuine expansion.
    await act(async () => {
      await capturedLoadMore!(node(peKey('pe1', 'sub')));
      await flush();
    });
    expect(setExpandedSpy).toHaveBeenCalledTimes(1);
    expect(getExplorerInternalsForTest().expanded).toContain(peKey('pe1', 'sub'));
    expect(h.calls()).toBeGreaterThan(subsAfterOpen);
  });
});
