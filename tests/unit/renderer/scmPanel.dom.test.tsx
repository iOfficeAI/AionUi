/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScmRepository, ScmResource, ScmStatus } from '@/renderer/pages/conversation/SourceControl/scmModel';
import type { ScmPort } from '@/renderer/pages/conversation/SourceControl/scmStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, unknown>) => (vars ? `${k}:${Object.values(vars).join('→')}` : k),
  }),
}));

// The panel wires the WS runtime on mount; tests inject their own port instead.
vi.mock('@/renderer/pages/conversation/SourceControl/scmTransport', () => ({
  initScmRuntime: () => ({}),
}));

// Selecting a change now hands its diff to the shared preview panel via
// `openPreview` rather than rendering an inline pane. The panel is mounted here
// without a real PreviewProvider, so we mock the Preview module and capture the
// `openPreview` calls to assert what tab the panel would open.
const openPreviewMock = vi.fn();
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: openPreviewMock }),
}));

import { ScmPanel } from '@/renderer/pages/conversation/SourceControl/ScmPanel';
import {
  applyScmNotification,
  configureScmStore,
  getScmInternalsForTest,
  resetScmStoreForTest,
} from '@/renderer/pages/conversation/SourceControl/scmStore';

const repo = (over: Partial<ScmRepository> = {}): ScmRepository => ({
  repo_id: 'scm:pe1',
  provider_id: 'git',
  root: { pe_id: 'pe1', relative_path: '' },
  label: 'aion',
  head: { name: 'main' },
  capabilities: { staging: true, local_branches: true, history_graph: false, remote_ops: false },
  state: 'idle',
  ...over,
});

const resource = (path: string, over: Partial<ScmResource> = {}): ScmResource => ({
  file: { pe_id: 'pe1', relative_path: path },
  repo_relative_path: path,
  state: 'modified',
  staged: false,
  ...over,
});

const status = (repoId: string, seq: number, resources: ScmResource[], over: Partial<ScmStatus> = {}): ScmStatus => ({
  repository: { repo_id: repoId },
  resources,
  seq,
  ...over,
});

type PortSetup = {
  repositories?: ScmRepository[];
  firstFrames?: Record<string, ScmStatus>;
  diff?: () => Promise<{ patch?: string; binary?: boolean; truncated?: boolean }>;
};

const diffCalls: unknown[] = [];

const installPort = (setup: PortSetup): void => {
  const port: ScmPort = {
    listRepositories: async () => ({ repositories: setup.repositories ?? [] }),
    subscribe: async (ids) => ({
      statuses: ids.map((id) => setup.firstFrames?.[id]).filter((s): s is ScmStatus => Boolean(s)),
    }),
    unsubscribe: () => {},
    status: async (id) => setup.firstFrames?.[id] ?? status(id, 1, []),
    diff: async (params) => {
      diffCalls.push(params);
      return setup.diff ? setup.diff() : { patch: 'unified patch text' };
    },
  };
  configureScmStore(port);
};

beforeEach(() => {
  resetScmStoreForTest();
  diffCalls.length = 0;
  openPreviewMock.mockClear();
});

afterEach(() => {
  cleanup();
  resetScmStoreForTest();
});

describe('ScmPanel empty / failure states', () => {
  it('shows `not a repository` when no pe root of the project is a repo', async () => {
    installPort({ repositories: [] });
    render(<ScmPanel projectId='p1' />);

    expect(await screen.findByText('conversation.explorer.scm.notARepository')).toBeInTheDocument();
  });

  it('shows a load failure instead of an empty list when listRepositories rejects', async () => {
    configureScmStore({
      listRepositories: async () => {
        throw new Error('backend down');
      },
      subscribe: async () => ({ statuses: [] }),
      unsubscribe: () => {},
      status: async () => status('x', 1, []),
      diff: async () => ({}),
    });
    render(<ScmPanel projectId='p1' />);

    expect(await screen.findByText('conversation.explorer.scm.loadFailed')).toBeInTheDocument();
  });

  it('shows `no changes` for a clean repo', async () => {
    installPort({ repositories: [repo()], firstFrames: { 'scm:pe1': status('scm:pe1', 1, []) } });
    render(<ScmPanel projectId='p1' />);

    expect(await screen.findByText('conversation.explorer.scm.noChanges')).toBeInTheDocument();
  });
});

describe('ScmPanel grouping derived from capabilities', () => {
  it('renders staged and unstaged groups for a staging provider', async () => {
    installPort({
      repositories: [repo()],
      firstFrames: {
        'scm:pe1': status('scm:pe1', 1, [
          resource('src/staged.ts', { staged: true }),
          resource('src/unstaged.ts', { staged: false }),
        ]),
      },
    });
    render(<ScmPanel projectId='p1' />);

    await screen.findByText('staged.ts');
    expect(document.querySelector('[data-scm-group="staged"]')).not.toBeNull();
    expect(document.querySelector('[data-scm-group="unstaged"]')).not.toBeNull();
    expect(document.querySelector('[data-scm-group="changes"]')).toBeNull();
  });

  it('renders a flagless (conflicted) row in its own group, OUTSIDE the staging split', async () => {
    // protocol.md v10: a staging provider omits `staged` for opaque states. Such a
    // row must not sit in staged/unstaged (that would imply a staging side it does
    // not have, and hand it a stage button the backend rejects with -32053).
    installPort({
      repositories: [repo()],
      firstFrames: {
        'scm:pe1': status('scm:pe1', 1, [
          resource('src/edited.ts', { staged: false }),
          resource('src/conflict.ts', { state: 'conflicted', staged: undefined }),
        ]),
      },
    });
    render(<ScmPanel projectId='p1' />);

    await screen.findByText('conflict.ts');
    const blocked = document.querySelector('[data-scm-group="blocked"]');
    expect(blocked).not.toBeNull();
    // The conflicted row is inside `blocked`, and the staging groups do not hold it.
    expect(blocked?.textContent).toContain('conflict.ts');
    expect(document.querySelector('[data-scm-group="unstaged"]')?.textContent).not.toContain('conflict.ts');
    expect(document.querySelector('[data-scm-group="staged"]')).toBeNull();
  });

  it('renders ONE undifferentiated group when the provider has no staging area', async () => {
    installPort({
      repositories: [repo({ capabilities: { ...repo().capabilities, staging: false } })],
      firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('a.ts', { staged: undefined })]) },
    });
    render(<ScmPanel projectId='p1' />);

    await screen.findByText('a.ts');
    expect(document.querySelector('[data-scm-group="changes"]')).not.toBeNull();
    expect(document.querySelector('[data-scm-group="staged"]')).toBeNull();
    expect(document.querySelector('[data-scm-group="unstaged"]')).toBeNull();
  });
});

describe('ScmPanel state rendering (data-safety rules)', () => {
  const renderStates = async (resources: ScmResource[]): Promise<void> => {
    installPort({ repositories: [repo()], firstFrames: { 'scm:pe1': status('scm:pe1', 1, resources) } });
    render(<ScmPanel projectId='p1' />);
    await waitFor(() => expect(document.querySelectorAll('[data-scm-resource]').length).toBe(resources.length));
  };

  it('renders a conflicted resource distinctly from a modified one', async () => {
    await renderStates([resource('conflict.ts', { state: 'conflicted' }), resource('plain.ts', { state: 'modified' })]);

    const rows = [...document.querySelectorAll('[data-scm-resource]')];
    const conflicted = rows.find((r) => r.getAttribute('data-scm-state') === 'conflicted');
    const modified = rows.find((r) => r.getAttribute('data-scm-state') === 'modified');
    expect(conflicted?.getAttribute('data-scm-kind')).toBe('conflicted');
    expect(modified?.getAttribute('data-scm-kind')).toBe('regular');
    expect(conflicted?.getAttribute('data-scm-kind')).not.toBe(modified?.getAttribute('data-scm-kind'));
  });

  it('renders an UNKNOWN state as opaque, not as a regular state', async () => {
    await renderStates([resource('future.ts', { state: 'merge' })]);

    const row = document.querySelector('[data-scm-resource]');
    expect(row?.getAttribute('data-scm-kind')).toBe('opaque');
    // Its badge/label must fall back to the `unknown` key — never a made-up label
    // from the raw wire value.
    expect(screen.getByText('conversation.explorer.scm.badge.unknown')).toBeInTheDocument();
  });

  it('renders a renamed resource as `from → to`', async () => {
    await renderStates([resource('src/new.ts', { state: 'renamed', rename_from: 'src/old.ts' })]);

    expect(screen.getByText('conversation.explorer.scm.renamedFrom:src/old.ts→new.ts')).toBeInTheDocument();
  });

  it('renders a degraded move (delete + create) as two ordinary rows', async () => {
    // Over the rename-detection budget the backend reports one move as two rows.
    // Both shapes must render — the panel must not assume a move is one `renamed`.
    await renderStates([resource('src/old.ts', { state: 'deleted' }), resource('src/new.ts', { state: 'created' })]);

    const kinds = [...document.querySelectorAll('[data-scm-resource]')].map((r) => r.getAttribute('data-scm-kind'));
    expect(kinds).toEqual(['regular', 'regular']);
    expect(screen.getByText('old.ts')).toBeInTheDocument();
    expect(screen.getByText('new.ts')).toBeInTheDocument();
  });
});

describe('ScmPanel degraded / truncated notices', () => {
  it('shows the degraded notice without turning the panel into an error', async () => {
    installPort({
      repositories: [repo()],
      firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('a.ts')], { degraded: true }) },
    });
    render(<ScmPanel projectId='p1' />);

    expect(await screen.findByText('conversation.explorer.scm.degraded')).toBeInTheDocument();
    // The list itself is complete — the row is still shown.
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.queryByText('conversation.explorer.scm.loadFailed')).not.toBeInTheDocument();
  });

  it('shows the truncated notice for an over-large change list', async () => {
    installPort({
      repositories: [repo()],
      firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('a.ts')], { truncated: true }) },
    });
    render(<ScmPanel projectId='p1' />);

    expect(await screen.findByText('conversation.explorer.scm.truncated')).toBeInTheDocument();
  });

  it('shows no degraded notice for a normal frame', async () => {
    installPort({ repositories: [repo()], firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('a.ts')]) } });
    render(<ScmPanel projectId='p1' />);

    await screen.findByText('a.ts');
    expect(screen.queryByText('conversation.explorer.scm.degraded')).not.toBeInTheDocument();
  });
});

describe('ScmPanel diff view', () => {
  const setup = async (): Promise<void> => {
    installPort({
      repositories: [repo()],
      firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('src/a.ts', { staged: false })]) },
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');
  };

  it('requests the diff with the ContentRef pair derived from the row', async () => {
    await setup();
    fireEvent.click(screen.getByText('a.ts'));

    await waitFor(() => expect(diffCalls).toHaveLength(1));
    expect(diffCalls[0]).toEqual({
      repository: 'scm:pe1',
      file: { pe_id: 'pe1', relative_path: 'src/a.ts' },
      from: 'staged',
      to: 'working',
    });
    // The fetched patch is opened as a `'diff'` tab in the shared preview panel,
    // titled by the file name — not rendered inline under this panel.
    await waitFor(() => expect(openPreviewMock).toHaveBeenCalledTimes(1));
    expect(openPreviewMock).toHaveBeenCalledWith('unified patch text', 'diff', { file_name: 'a.ts', title: 'a.ts' });
  });

  it('never sends the staged anchor when opening a conflicted row (would return empty content)', async () => {
    // End-to-end guard for protocol.md v11: the backend does not reject the staged
    // anchor for a conflicted file — it answers with EMPTY content (the index holds
    // only base/ours/theirs, no stage 0). So the panel must never ask for it, or the
    // diff view would render "this file is empty" as if that were the truth.
    installPort({
      repositories: [repo()],
      firstFrames: {
        'scm:pe1': status('scm:pe1', 1, [resource('src/conflict.ts', { state: 'conflicted', staged: undefined })]),
      },
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('conflict.ts');

    fireEvent.click(screen.getByText('conflict.ts'));
    await waitFor(() => expect(diffCalls).toHaveLength(1));
    expect(diffCalls[0]).toEqual({
      repository: 'scm:pe1',
      file: { pe_id: 'pe1', relative_path: 'src/conflict.ts' },
      from: 'committed',
      to: 'working',
    });
  });

  it('opens nothing in the preview panel when the diff request rejects (passive bridge)', async () => {
    installPort({
      repositories: [repo()],
      firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('src/a.ts')]) },
      diff: () => Promise.reject(new Error('no such blob')),
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');
    fireEvent.click(screen.getByText('a.ts'));

    // The fetch is attempted, but a failure leaves the selection intact and opens no
    // tab — error surfacing belongs to the action-report path, not this bridge.
    await waitFor(() => expect(diffCalls).toHaveLength(1));
    expect(openPreviewMock).not.toHaveBeenCalled();
  });

  it('opens a binary placeholder as the diff tab body instead of a patch', async () => {
    installPort({
      repositories: [repo()],
      firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('logo.png')]) },
      diff: async () => ({ binary: true }),
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('logo.png');
    fireEvent.click(screen.getByText('logo.png'));

    await waitFor(() => expect(openPreviewMock).toHaveBeenCalledTimes(1));
    expect(openPreviewMock).toHaveBeenCalledWith('conversation.explorer.scm.diff.binary', 'diff', {
      file_name: 'logo.png',
      title: 'logo.png',
    });
  });

  it('stops bridging (no further openPreview) once the selected row disappears from a newer frame', async () => {
    await setup();
    fireEvent.click(screen.getByText('a.ts'));
    await waitFor(() => expect(openPreviewMock).toHaveBeenCalledTimes(1));

    // The change was committed elsewhere → the whole-frame replace drops the row and
    // clears the selection, so the diff bridge unmounts and opens no stale tab. The
    // preview panel owns its already-open tab's lifecycle from here.
    openPreviewMock.mockClear();
    applyScmNotification('scm/statusChanged', status('scm:pe1', 2, []));
    await waitFor(() => expect(document.querySelector('[data-scm-resource]')).toBeNull());
    expect(openPreviewMock).not.toHaveBeenCalled();
  });
});

describe('ScmPanel lifecycle (tab switch must not release the subscription)', () => {
  it('keeps the declared subscription after the panel unmounts (tab switched away)', async () => {
    installPort({ repositories: [repo()], firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('a.ts')]) } });
    const { unmount } = render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');
    expect(getScmInternalsForTest().subscribed).toEqual(['scm:pe1']);

    // Unmounting = the user clicked the Files tab. The backend watch must survive,
    // otherwise every tab click would cost a full status recompute on return.
    unmount();
    expect(getScmInternalsForTest().subscribed).toEqual(['scm:pe1']);
  });

  it('re-mounting for the same project reuses the warm status (no refetch flicker)', async () => {
    installPort({ repositories: [repo()], firstFrames: { 'scm:pe1': status('scm:pe1', 5, [resource('a.ts')]) } });
    const first = render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');
    first.unmount();

    render(<ScmPanel projectId='p1' />);
    // Present synchronously on the very first paint — no loading state in between.
    expect(screen.getByText('a.ts')).toBeInTheDocument();
  });
});

describe('ScmPanel multi-repo (top list + click to switch, D2丙)', () => {
  const twoRepos = (): PortSetup => ({
    repositories: [
      repo(),
      repo({
        repo_id: 'scm:pe2',
        label: 'shared-lib',
        root: { pe_id: 'pe2', relative_path: '' },
        head: { name: 'dev' },
      }),
    ],
    firstFrames: {
      'scm:pe1': status('scm:pe1', 1, [resource('a.ts')]),
      'scm:pe2': status('scm:pe2', 1, [
        resource('b.ts', { file: { pe_id: 'pe2', relative_path: 'b.ts' }, state: 'created' }),
      ]),
    },
  });

  it('lists every repo up top but renders only the selected one in the body (defaults to the first)', async () => {
    installPort(twoRepos());
    render(<ScmPanel projectId='p1' />);

    // The list carries one item per repo, and it is a list — not two stacked sections.
    await waitFor(() => expect(document.querySelectorAll('[data-scm-repo-item]')).toHaveLength(2));
    expect(document.querySelector('[data-scm-repo-list]')).not.toBeNull();
    expect(screen.getByText('aion')).toBeInTheDocument();
    expect(screen.getByText('shared-lib')).toBeInTheDocument();

    // Body shows only the first repo's changes — the second repo's file is not rendered.
    expect(document.querySelectorAll('[data-scm-repo]')).toHaveLength(1);
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.queryByText('b.ts')).not.toBeInTheDocument();
  });

  it('renders the OTHER repo after its list item is clicked — no refetch, pure switch', async () => {
    installPort(twoRepos());
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(screen.getByText('shared-lib'));

    await screen.findByText('b.ts');
    expect(screen.queryByText('a.ts')).not.toBeInTheDocument();
    expect(document.querySelector('[data-scm-repo="scm:pe2"]')).not.toBeNull();
    // The selected item is marked current.
    expect(document.querySelector('[data-scm-repo-item="scm:pe2"]')?.getAttribute('aria-current')).toBe('true');
  });

  it('falls back to the first repo when the SELECTED repo is removed (repositoriesChanged)', async () => {
    installPort(twoRepos());
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    // Select the second repo, then have the backend drop it.
    fireEvent.click(screen.getByText('shared-lib'));
    await screen.findByText('b.ts');

    applyScmNotification('scm/repositoriesChanged', { project_id: 'p1', removed: ['scm:pe2'] });

    // Only one repo remains → the list disappears and the body lands on it.
    await screen.findByText('a.ts');
    expect(screen.queryByText('b.ts')).not.toBeInTheDocument();
    expect(document.querySelector('[data-scm-repo-list]')).toBeNull();
  });

  it('omits the repo list for a single-repo project and shows the changes directly', async () => {
    installPort({ repositories: [repo()], firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('a.ts')]) } });
    render(<ScmPanel projectId='p1' />);

    await screen.findByText('a.ts');
    expect(document.querySelector('[data-scm-repo-list]')).toBeNull();
    // The repo's own name is not shown anywhere for a single repo (no list, no header).
    expect(screen.queryByText('aion')).not.toBeInTheDocument();
  });

  it('labels a repo by its pe_name when present, falling back to label otherwise', async () => {
    installPort({
      repositories: [
        repo({ pe_name: 'My Frontend' }), // pe_name present → wins over label 'aion'
        repo({ repo_id: 'scm:pe2', label: 'shared-lib', root: { pe_id: 'pe2', relative_path: '' } }), // no pe_name → label
        // Empty-string pe_name must ALSO fall back to label. This is the second half
        // of the double-insurance: the backend promises never to emit Some(""), but
        // the render uses `||` (not `??`) so a stray "" cannot smear into a blank
        // repo name. Reverting the render to `??` makes this assertion fail.
        repo({ repo_id: 'scm:pe3', pe_name: '', label: 'empty-name-repo', root: { pe_id: 'pe3', relative_path: '' } }),
      ],
      firstFrames: {
        'scm:pe1': status('scm:pe1', 1, [resource('a.ts')]),
        'scm:pe2': status('scm:pe2', 1, [resource('b.ts', { file: { pe_id: 'pe2', relative_path: 'b.ts' } })]),
        'scm:pe3': status('scm:pe3', 1, [resource('c.ts', { file: { pe_id: 'pe3', relative_path: 'c.ts' } })]),
      },
    });
    render(<ScmPanel projectId='p1' />);

    await waitFor(() => expect(document.querySelectorAll('[data-scm-repo-item]')).toHaveLength(3));
    expect(screen.getByText('My Frontend')).toBeInTheDocument(); // pe_name shown
    expect(screen.queryByText('aion')).not.toBeInTheDocument(); // bare label hidden when pe_name exists
    expect(screen.getByText('shared-lib')).toBeInTheDocument(); // missing pe_name → fallback to label
    expect(screen.getByText('empty-name-repo')).toBeInTheDocument(); // empty-string pe_name → fallback to label
  });
});

describe('ScmPanel filename colour (dark-mode legibility)', () => {
  // The filename span must carry an explicit theme token, never inherit: with no
  // colour class it inherited a value that does not follow the theme, so a dark
  // scheme rendered the name dark-on-dark. jsdom loads no CSS, so this asserts the
  // CLASS the component applies (the layer jsdom can see); that the token paints
  // correctly in both themes is verified in scmBadgeCss.test.ts + a real-browser probe.
  it('gives an ordinary filename the primary-text token, not an inherited colour', async () => {
    installPort({
      repositories: [repo()],
      firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('a.ts', { state: 'modified' })]) },
    });
    render(<ScmPanel projectId='p1' />);

    const name = await screen.findByText('a.ts');
    expect(name.className).toContain('text-t-primary');
    expect(name.className).not.toContain('text-danger');
  });

  it('keeps a conflicted filename on the danger token (not primary)', async () => {
    installPort({
      repositories: [repo()],
      firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('c.ts', { state: 'conflicted', staged: undefined })]) },
    });
    render(<ScmPanel projectId='p1' />);

    const name = await screen.findByText('c.ts');
    expect(name.className).toContain('text-danger');
    expect(name.className).not.toContain('text-t-primary');
  });
});

describe('ScmPanel first-frame loading (protocol.md v10: `refreshing` is never pushed in stage 1)', () => {
  /** A port whose `subscribe` never settles — the repo list is known, no status yet. */
  const installPendingSubscribe = (repository: ScmRepository): void => {
    configureScmStore({
      listRepositories: async () => ({ repositories: [repository] }),
      subscribe: () => new Promise(() => {}), // never resolves
      unsubscribe: () => {},
      status: async () => status(repository.repo_id, 1, []),
      diff: async () => ({}),
    });
  };

  it('shows a spinner while a repo has no status yet, even though `state` is idle', async () => {
    // Stage 1 never sends `state:'refreshing'`, so gating the spinner on that state
    // would render an empty repo block for the whole (possibly slow) first compute.
    installPendingSubscribe(repo({ state: 'idle' }));
    render(<ScmPanel projectId='p1' />);

    await waitFor(() => expect(document.querySelector('[data-scm-loading]')).not.toBeNull());
  });

  it('stops showing the spinner once the first status frame is applied', async () => {
    installPort({ repositories: [repo()], firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('a.ts')]) } });
    render(<ScmPanel projectId='p1' />);

    await screen.findByText('a.ts');
    expect(document.querySelector('[data-scm-loading]')).toBeNull();
  });

  it('still shows progress for an explicitly refreshing repo (forward compatibility)', async () => {
    // If a future backend does push `state:'refreshing'`, an in-progress recompute
    // must show progress even though a previous status is already on screen.
    installPort({
      repositories: [repo({ state: 'refreshing' })],
      firstFrames: { 'scm:pe1': status('scm:pe1', 1, [resource('a.ts')]) },
    });
    render(<ScmPanel projectId='p1' />);

    await screen.findByText('a.ts');
    expect(document.querySelector('[data-scm-loading]')).not.toBeNull();
  });
});
