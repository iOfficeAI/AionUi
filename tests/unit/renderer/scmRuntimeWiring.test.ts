/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Guards the `scm/*` request shapes `initScmRuntime` puts on the wire. These are
 * the one place the front end can silently diverge from protocol.md: a wrong
 * param name (`project` vs `project_id`, a bare id vs an array) is not a type
 * error — the backend just rejects it with -32602 at runtime.
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
/** The MOST RECENT frame for `method` — a project switch issues the same method twice. */
const frameFor = (method: string): Frame | undefined => sentFrames().findLast((f) => f.method === method);

/** Reply to the last request for `method` as the backend would. */
const replyTo = (method: string, result: unknown): void => {
  const frame = frameFor(method);
  if (!frame?.id) throw new Error(`no in-flight request for ${method}`);
  for (const handler of frameHandlers.get('scm') ?? []) {
    handler({ jsonrpc: '2.0', id: frame.id, result });
  }
};

/**
 * Load a fresh copy of the runtime + store. `initScmRuntime` memoizes its client
 * at module level (correct in production — one client per connection), so tests
 * must get new module instances rather than share one wired to a stale transport.
 */
const loadFreshRuntime = async (): Promise<{
  openScmProject: (id: string) => Promise<void>;
  refreshRepo: (repoId: string) => Promise<void>;
}> => {
  vi.resetModules();
  const transport = await import('@/renderer/pages/conversation/SourceControl/scmTransport');
  const store = await import('@/renderer/pages/conversation/SourceControl/scmStore');
  transport.initScmRuntime();
  return { openScmProject: store.openScmProject, refreshRepo: store.refreshRepo };
};

const repo: ScmRepository = {
  repo_id: 'scm:pe1',
  provider_id: 'git',
  root: { pe_id: 'pe1', relative_path: '' },
  label: 'aion',
  capabilities: { staging: true, local_branches: true, history_graph: false, remote_ops: false },
  state: 'idle',
};

const firstStatus: ScmStatus = { repository: { repo_id: 'scm:pe1' }, resources: [], seq: 1 };

beforeEach(() => {
  wsSend.mockClear();
  wsSend.mockReturnValue(true);
  frameHandlers.clear();
});

describe('initScmRuntime wire shapes', () => {
  it('sends scm/listRepositories with a snake_case project_id', async () => {
    const { openScmProject } = await loadFreshRuntime();
    const open = openScmProject('proj_x');
    await vi.waitFor(() => expect(frameFor('scm/listRepositories')).toBeDefined());

    expect(frameFor('scm/listRepositories')?.params).toEqual({ project_id: 'proj_x' });
    replyTo('scm/listRepositories', { repositories: [] });
    await open;
  });

  it('sends scm/subscribe with a repo_id ARRAY under `repositories`', async () => {
    const { openScmProject } = await loadFreshRuntime();
    const open = openScmProject('proj_x');
    await vi.waitFor(() => expect(frameFor('scm/listRepositories')).toBeDefined());
    replyTo('scm/listRepositories', { repositories: [repo] });

    await vi.waitFor(() => expect(frameFor('scm/subscribe')).toBeDefined());
    expect(frameFor('scm/subscribe')?.params).toEqual({ repositories: ['scm:pe1'] });
    replyTo('scm/subscribe', { statuses: [firstStatus] });
    await open;
  });

  it('sends scm/subscribe as a request (carries an id) so the first frames can be paired', async () => {
    const { openScmProject } = await loadFreshRuntime();
    const open = openScmProject('proj_x');
    await vi.waitFor(() => expect(frameFor('scm/listRepositories')).toBeDefined());
    replyTo('scm/listRepositories', { repositories: [repo] });
    await vi.waitFor(() => expect(frameFor('scm/subscribe')).toBeDefined());

    expect(typeof frameFor('scm/subscribe')?.id).toBe('number');
    replyTo('scm/subscribe', { statuses: [firstStatus] });
    await open;
  });

  it('sends scm/status with a bare repo id under `repository` (not an array)', async () => {
    const { openScmProject, refreshRepo } = await loadFreshRuntime();
    const open = openScmProject('proj_x');
    await vi.waitFor(() => expect(frameFor('scm/listRepositories')).toBeDefined());
    replyTo('scm/listRepositories', { repositories: [repo] });
    await vi.waitFor(() => expect(frameFor('scm/subscribe')).toBeDefined());
    replyTo('scm/subscribe', { statuses: [firstStatus] });
    await open;

    void refreshRepo('scm:pe1');
    await vi.waitFor(() => expect(frameFor('scm/status')).toBeDefined());
    expect(frameFor('scm/status')?.params).toEqual({ repository: 'scm:pe1' });
  });

  it('sends scm/unsubscribe as a NOTIFICATION (no id — fire and forget)', async () => {
    const { openScmProject } = await loadFreshRuntime();
    const open = openScmProject('proj_x');
    await vi.waitFor(() => expect(frameFor('scm/listRepositories')).toBeDefined());
    replyTo('scm/listRepositories', { repositories: [repo] });
    await vi.waitFor(() => expect(frameFor('scm/subscribe')).toBeDefined());
    replyTo('scm/subscribe', { statuses: [firstStatus] });
    await open;

    // Switching project releases the old repos.
    const second = openScmProject('proj_y');
    await vi.waitFor(() => expect(frameFor('scm/unsubscribe')).toBeDefined());
    const frame = frameFor('scm/unsubscribe');
    expect(frame?.params).toEqual({ repositories: ['scm:pe1'] });
    expect(frame && 'id' in frame).toBe(false);
    replyTo('scm/listRepositories', { repositories: [] });
    await second;
  });
});
