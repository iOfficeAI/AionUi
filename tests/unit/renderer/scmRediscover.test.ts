/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Guards `rediscoverRepos` — the manual-refresh fallback that re-runs
 * `scm/listRepositories` for the OPEN project and reconciles the result into the
 * live store WITHOUT the full teardown `openScmProject` does. This is the only
 * front-end path that surfaces a worktree created mid-session (the backend does
 * not push `repositoriesChanged` for a new worktree inside an already-attached
 * repo, and status/focus refresh only touch already-subscribed repos).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsSend = vi.fn<(name: string, data: unknown) => boolean>(() => true);
const frameHandlers = new Map<string, Array<(f: unknown) => void>>();

vi.mock('@/common/adapter/httpBridge', () => ({
  wsSend: (name: string, data: unknown) => wsSend(name, data),
  wsEmitter: (eventName: string) => ({
    on: (cb: (f: unknown) => void) => {
      const list = frameHandlers.get(eventName) ?? [];
      list.push(cb);
      frameHandlers.set(eventName, list);
      return () => {};
    },
    emit: () => {},
  }),
}));

import type { ScmRepository, ScmStatus } from '@/renderer/pages/conversation/SourceControl/scmModel';

type Frame = { jsonrpc: string; id?: number; method: string; params?: Record<string, unknown> };

const sentFrames = (): Frame[] => wsSend.mock.calls.map((c) => c[1] as Frame);
const frameFor = (method: string): Frame | undefined => sentFrames().findLast((f) => f.method === method);
const framesFor = (method: string): Frame[] => sentFrames().filter((f) => f.method === method);

const replyTo = (method: string, result: unknown): void => {
  const frame = frameFor(method);
  if (!frame?.id) throw new Error(`no in-flight request for ${method}`);
  for (const handler of frameHandlers.get('scm') ?? []) {
    handler({ jsonrpc: '2.0', id: frame.id, result });
  }
};

type Store = typeof import('@/renderer/pages/conversation/SourceControl/scmStore');

const loadFreshRuntime = async (): Promise<Store> => {
  vi.resetModules();
  const transport = await import('@/renderer/pages/conversation/SourceControl/scmTransport');
  const store = await import('@/renderer/pages/conversation/SourceControl/scmStore');
  transport.initScmRuntime();
  return store;
};

const mkRepo = (id: string, peId: string, label: string): ScmRepository => ({
  repo_id: id,
  provider_id: 'git',
  root: { pe_id: peId, relative_path: '' },
  label,
  capabilities: { staging: true, local_branches: true, history_graph: false, remote_ops: false },
  state: 'idle',
});

const primary = mkRepo('scm:pe1', 'pe1', 'zumi');
const worktree = mkRepo('scm:pe1:wt', 'pe1', 'log-correlation-tracing');
const statusFor = (repoId: string, seq: number): ScmStatus => ({ repository: { repo_id: repoId }, resources: [], seq });

/** Open a project with `repos`, settling the initial list + subscribe round. */
const openWith = async (store: Store, repos: ScmRepository[]): Promise<void> => {
  const open = store.openScmProject('proj_x');
  await vi.waitFor(() => expect(frameFor('scm/listRepositories')).toBeDefined());
  replyTo('scm/listRepositories', { repositories: repos });
  if (repos.length > 0) {
    await vi.waitFor(() => expect(frameFor('scm/subscribe')).toBeDefined());
    replyTo('scm/subscribe', { statuses: repos.map((r, i) => statusFor(r.repo_id, i + 1)) });
  }
  await open;
};

beforeEach(() => {
  wsSend.mockClear();
  wsSend.mockReturnValue(true);
  frameHandlers.clear();
});

describe('rediscoverRepos', () => {
  it('re-lists the open project and subscribes only a newly discovered worktree', async () => {
    const store = await loadFreshRuntime();
    await openWith(store, [primary]);
    expect(store.getScmSnapshot().repositories.map((r) => r.repo_id)).toEqual(['scm:pe1']);

    wsSend.mockClear();
    const done = store.rediscoverRepos();
    await vi.waitFor(() => expect(frameFor('scm/listRepositories')).toBeDefined());
    // Re-list carries the same snake_case project_id as the initial open.
    expect(frameFor('scm/listRepositories')?.params).toEqual({ project_id: 'proj_x' });
    replyTo('scm/listRepositories', { repositories: [primary, worktree] });
    await done;

    // Only the newly discovered worktree is subscribed; the primary is untouched.
    await vi.waitFor(() => expect(frameFor('scm/subscribe')).toBeDefined());
    expect(frameFor('scm/subscribe')?.params).toEqual({ repositories: ['scm:pe1:wt'] });
    expect(store.getScmSnapshot().repositories.map((r) => r.repo_id)).toEqual(['scm:pe1', 'scm:pe1:wt']);
  });

  it('drops a repo that has disappeared from the re-listed set', async () => {
    const store = await loadFreshRuntime();
    await openWith(store, [primary, worktree]);
    expect(store.getScmSnapshot().repositories).toHaveLength(2);

    wsSend.mockClear();
    const done = store.rediscoverRepos();
    await vi.waitFor(() => expect(frameFor('scm/listRepositories')).toBeDefined());
    replyTo('scm/listRepositories', { repositories: [primary] });
    await done;

    expect(store.getScmSnapshot().repositories.map((r) => r.repo_id)).toEqual(['scm:pe1']);
  });

  it('does not re-subscribe when the re-listed set is unchanged (warm status preserved)', async () => {
    const store = await loadFreshRuntime();
    await openWith(store, [primary]);

    wsSend.mockClear();
    const done = store.rediscoverRepos();
    await vi.waitFor(() => expect(frameFor('scm/listRepositories')).toBeDefined());
    replyTo('scm/listRepositories', { repositories: [primary] });
    await done;

    expect(framesFor('scm/subscribe')).toHaveLength(0);
    expect(store.getScmSnapshot().repositories.map((r) => r.repo_id)).toEqual(['scm:pe1']);
  });
});
