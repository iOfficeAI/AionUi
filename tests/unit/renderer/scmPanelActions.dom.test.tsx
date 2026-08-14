/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PR-4 action-side behaviour of the Changes panel.
 *
 * The assertions here are mostly about what must NOT happen: no stage button on a
 * conflicted row, no staging affordance without the capability, no conflicted row
 * inside a batch, no "operation failed" wording when the action partly succeeded,
 * and no retry button on a rejection that retrying cannot fix.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScmRepository, ScmResource, ScmStatus } from '@/renderer/pages/conversation/SourceControl/scmModel';
import type { ScmActionResult, ScmPort } from '@/renderer/pages/conversation/SourceControl/scmStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, unknown>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
  }),
}));

vi.mock('@/renderer/pages/conversation/SourceControl/scmTransport', () => ({
  initScmRuntime: () => ({}),
}));

/** Captured `Modal.confirm` calls, so the confirmation copy can be asserted and the
 *  OK path driven without a real dialog. */
const confirmCalls: Array<{ content?: unknown; onOk?: () => unknown }> = [];

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Modal: {
      ...actual.Modal,
      confirm: (cfg: { content?: unknown; onOk?: () => unknown }) => {
        confirmCalls.push(cfg);
        return { close: () => {} };
      },
    },
  };
});

import { ScmPanel } from '@/renderer/pages/conversation/SourceControl/ScmPanel';
import { resourceKey } from '@/renderer/pages/conversation/SourceControl/scmModel';
import { configureScmStore, resetScmStoreForTest } from '@/renderer/pages/conversation/SourceControl/scmStore';
import { RPC_DISCONNECTED, RPC_RECONNECTED, RpcError } from '@/renderer/pages/conversation/explorer/monitorClient';

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

const status = (repoId: string, seq: number, resources: ScmResource[]): ScmStatus => ({
  repository: { repo_id: repoId },
  resources,
  seq,
});

type Setup = {
  repository?: ScmRepository;
  resources?: ScmResource[];
  /** `failed[]` the action responds with. */
  failures?: ScmActionResult['failed'];
  /** Reject the action with this **protocol** code instead of responding. */
  rejectCode?: number;
  /** Reject with a **transport-level** error (as MonitorClient constructs it). */
  rejectTransport?: number;
};

const actCalls: Array<{ action: string; files: Array<{ relative_path: string }> }> = [];

const install = (setup: Setup): void => {
  const repository = setup.repository ?? repo();
  const port: ScmPort = {
    listRepositories: async () => ({ repositories: [repository] }),
    subscribe: async () => ({ statuses: [status(repository.repo_id, 1, setup.resources ?? [])] }),
    unsubscribe: () => {},
    status: async () => status(repository.repo_id, 1, setup.resources ?? []),
    diff: async () => ({ patch: 'p' }),
    act: async (action, params) => {
      actCalls.push({ action, files: params.files });
      if (setup.rejectTransport !== undefined) {
        throw new RpcError({ code: setup.rejectTransport, message: 'transport', transport: true });
      }
      if (setup.rejectCode !== undefined) throw new RpcError({ code: setup.rejectCode, message: 'no' });
      return setup.failures ? { failed: setup.failures } : {};
    },
  };
  configureScmStore(port);
};

const rowFor = (name: string): HTMLElement => {
  const label = screen.getByText(name);
  const row = label.closest('[data-scm-resource]');
  if (!row) throw new Error(`no row for ${name}`);
  return row as HTMLElement;
};

beforeEach(() => {
  resetScmStoreForTest();
  confirmCalls.length = 0;
  actCalls.length = 0;
});

afterEach(() => {
  cleanup();
  resetScmStoreForTest();
});

describe('action gating', () => {
  it('offers stage on an unstaged row and unstage on a staged row', async () => {
    install({
      resources: [resource('unstaged.ts', { staged: false }), resource('staged.ts', { staged: true })],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('unstaged.ts');

    expect(rowFor('unstaged.ts').querySelector('[data-scm-action="stage"]')).not.toBeNull();
    expect(rowFor('staged.ts').querySelector('[data-scm-action="unstage"]')).not.toBeNull();
    expect(rowFor('unstaged.ts').querySelector('[data-scm-action="unstage"]')).toBeNull();
  });

  it('offers NO action at all on a conflicted row', async () => {
    // Acting on a half-resolved merge is a data-safety problem, and the backend
    // refuses it with -32053 anyway.
    install({ resources: [resource('conflict.ts', { state: 'conflicted', staged: undefined })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('conflict.ts');

    const row = rowFor('conflict.ts');
    expect(row.querySelector('[data-scm-action="stage"]')).toBeNull();
    expect(row.querySelector('[data-scm-action="unstage"]')).toBeNull();
    expect(row.querySelector('[data-scm-action="discard"]')).toBeNull();
  });

  it('offers no action on a row whose state this build does not recognise', async () => {
    install({ resources: [resource('future.ts', { state: 'merge', staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('future.ts');

    expect(rowFor('future.ts').querySelector('[data-scm-action]')).toBeNull();
  });

  it('hides staging actions entirely when the provider has no staging area', async () => {
    // Calling stage/unstage on such a provider is -32052; the button must not exist.
    install({
      repository: repo({ capabilities: { ...repo().capabilities, staging: false } }),
      resources: [resource('a.ts', { staged: undefined })],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    const row = rowFor('a.ts');
    expect(row.querySelector('[data-scm-action="stage"]')).toBeNull();
    expect(row.querySelector('[data-scm-action="unstage"]')).toBeNull();
    // discard needs no staging area, so it stays available.
    expect(row.querySelector('[data-scm-action="discard"]')).not.toBeNull();
  });

  it('offers no bulk staging button on the blocked group', async () => {
    install({
      resources: [
        resource('edited.ts', { staged: false }),
        resource('conflict.ts', { state: 'conflicted', staged: undefined }),
      ],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('conflict.ts');

    expect(document.querySelector('[data-scm-group="blocked"] [data-scm-bulk]')).toBeNull();
    // Stage-all for the unstaged side now lives on the Changes section header, not on a
    // (removed) unstaged group title row.
    expect(document.querySelector('[data-scm-header-stage-all]')).not.toBeNull();
  });
});

describe('dispatching an action', () => {
  it('sends stage for a single row without any confirmation', async () => {
    install({ resources: [resource('a.ts', { staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(actCalls).toHaveLength(1));
    expect(actCalls[0]).toEqual({ action: 'stage', files: [{ pe_id: 'pe1', relative_path: 'a.ts' }] });
    expect(confirmCalls).toHaveLength(0); // stage is reversible — no dialog
  });

  it('excludes conflicted rows from a bulk action instead of letting the batch be refused', async () => {
    install({
      resources: [
        resource('ok1.ts', { staged: false }),
        resource('ok2.ts', { staged: false }),
        resource('conflict.ts', { state: 'conflicted', staged: undefined }),
      ],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('ok1.ts');

    fireEvent.click(document.querySelector('[data-scm-header-stage-all]')!);
    await waitFor(() => expect(actCalls).toHaveLength(1));
    expect(actCalls[0].files.map((f) => f.relative_path)).toEqual(['ok1.ts', 'ok2.ts']);
  });

  it('does not select the row when its action button is clicked', async () => {
    install({ resources: [resource('a.ts', { staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(actCalls).toHaveLength(1));
    expect(document.querySelector('[data-scm-diff]')).toBeNull(); // no diff opened
  });
});

describe('discard confirmation (the two consequences differ)', () => {
  it('warns that the edit is unrecoverable for a tracked file', async () => {
    install({ resources: [resource('edited.ts', { state: 'modified', staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('edited.ts');

    fireEvent.click(rowFor('edited.ts').querySelector('[data-scm-action="discard"]')!);
    expect(confirmCalls).toHaveLength(1);
    expect(String(confirmCalls[0].content)).toContain('confirmDiscardTracked');
    expect(actCalls).toHaveLength(0); // nothing sent before the user confirms
  });

  it('says the file goes to the trash for an untracked file', async () => {
    install({ resources: [resource('new.ts', { state: 'created', staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('new.ts');

    fireEvent.click(rowFor('new.ts').querySelector('[data-scm-action="discard"]')!);
    expect(String(confirmCalls[0].content)).toContain('confirmDiscardUntracked');
  });

  it('uses the mixed wording when one selection contains both kinds', async () => {
    // Reached via the bulk path: discarding a group that holds an edited file and a
    // new file must state BOTH consequences, since neither sentence alone is true.
    install({
      resources: [
        resource('edited.ts', { state: 'modified', staged: false }),
        resource('new.ts', { state: 'created', staged: false }),
      ],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('edited.ts');

    fireEvent.click(document.querySelector('[data-scm-header-discard-all]')!);
    expect(confirmCalls).toHaveLength(1);
    const content = String(confirmCalls[0].content);
    expect(content).toContain('confirmDiscardMixed');
    expect(content).toContain('"tracked":1');
    expect(content).toContain('"untracked":1');
  });

  it('sends the discard only after the confirmation is accepted', async () => {
    install({ resources: [resource('edited.ts', { staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('edited.ts');

    fireEvent.click(rowFor('edited.ts').querySelector('[data-scm-action="discard"]')!);
    expect(actCalls).toHaveLength(0);

    await confirmCalls[0].onOk?.();
    await waitFor(() => expect(actCalls).toHaveLength(1));
    expect(actCalls[0].action).toBe('discard');
  });
});

describe('outcome reporting', () => {
  it('reports success with a count', async () => {
    install({ resources: [resource('a.ts', { staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-report="success"]')).not.toBeNull());
  });

  it('reports PARTIAL as a warning with counts — never as "the operation failed"', async () => {
    // The files not listed were really changed. A blanket "failed" would make the
    // user retry and re-apply the action to files already done.
    install({
      resources: [resource('a.ts', { staged: false }), resource('b.ts', { staged: false })],
      failures: [{ file: { pe_id: 'pe1', relative_path: 'a.ts' }, reason: 'move to trash failed: busy' }],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(document.querySelector('[data-scm-header-stage-all]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-report="warning"]')).not.toBeNull());

    const banner = document.querySelector('[data-scm-report="warning"]')!;
    expect(banner.textContent).toContain('actions.partial');
    expect(banner.textContent).toContain('"succeeded":1');
    expect(banner.textContent).toContain('"failed":1');
    expect(banner.textContent).not.toContain('rejectedFailed');
    // Partial success is never retryable — the successful files must not be redone.
    // Retry (when present) lives in the report's secondary row, so assert at panel scope.
    expect(document.querySelector('[data-scm-retry]')).toBeNull();
  });

  it('flags the failed row so the user can see which file it was', async () => {
    install({
      resources: [resource('a.ts', { staged: false }), resource('b.ts', { staged: false })],
      failures: [{ file: { pe_id: 'pe1', relative_path: 'a.ts' }, reason: 'io' }],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(document.querySelector('[data-scm-header-stage-all]')!);
    await waitFor(() => expect(rowFor('a.ts').getAttribute('data-scm-failed')).toBe('true'));
    expect(rowFor('b.ts').getAttribute('data-scm-failed')).toBeNull();
  });

  it('offers retry for -32051 (the action ran and broke)', async () => {
    install({ resources: [resource('a.ts', { staged: false })], rejectCode: -32051 });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-report="error"]')).not.toBeNull());
    expect(document.querySelector('[data-scm-retry]')).not.toBeNull();
  });

  it('does NOT offer retry for -32053 and says nothing was changed', async () => {
    // Retrying a blocked resource can never succeed until the conflict is resolved.
    install({ resources: [resource('a.ts', { staged: false })], rejectCode: -32053 });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-report="error"]')).not.toBeNull());

    const banner = document.querySelector('[data-scm-report="error"]')!;
    expect(banner.textContent).toContain('rejectedBlocked');
    // Retry lives in the report's secondary row; assert its absence at panel scope.
    expect(document.querySelector('[data-scm-retry]')).toBeNull();
  });

  it('does NOT offer retry for -32052 (a static provider property)', async () => {
    install({ resources: [resource('a.ts', { staged: false })], rejectCode: -32052 });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-report="error"]')).not.toBeNull());
    expect(document.querySelector('[data-scm-retry]')).toBeNull();
    expect(document.querySelector('[data-scm-report="error"]')!.textContent).toContain('rejectedUnsupported');
  });

  it('re-sends the same action when retry is used', async () => {
    install({ resources: [resource('a.ts', { staged: false })], rejectCode: -32051 });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-retry]')).not.toBeNull());

    fireEvent.click(document.querySelector('[data-scm-retry]')!);
    await waitFor(() => expect(actCalls).toHaveLength(2));
    expect(actCalls[1].action).toBe('stage');
  });
});

describe('no optimistic update', () => {
  it('leaves the row where it was until the backend pushes a new status frame', async () => {
    install({ resources: [resource('a.ts', { staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');
    const key = resourceKey(resource('a.ts', { staged: false }));

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-report]')).not.toBeNull());

    // Still in the unstaged group: the panel does not guess, it waits for the frame.
    expect(document.querySelector('[data-scm-group="unstaged"]')!.textContent).toContain('a.ts');
    expect(document.querySelector('[data-scm-group="staged"]')).toBeNull();
    void key;
  });
});

describe('discard is offered on the unstaged side only — all six cells', () => {
  // `scm/discard` acts on the unstaged side (protocol.md v11): the engine restores
  // via `checkout_index`, so discarding "a staged row" would destroy the newest
  // working-tree edit — a DIFFERENT row the user never touched, unrecoverably.
  //
  // The five cells exist because the bug's root cause is "one dimension considered
  // in one branch and forgotten in another". Asserting only that a staged row lost
  // its button would let the opposite mistake through: silently removing discard
  // from a provider that has no staging area at all.

  it('cell 1 — a STAGED row (staging provider) has NO discard', async () => {
    install({ resources: [resource('staged.ts', { staged: true })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('staged.ts');

    expect(rowFor('staged.ts').querySelector('[data-scm-action="discard"]')).toBeNull();
    // unstage is still offered — only discard is side-specific.
    expect(rowFor('staged.ts').querySelector('[data-scm-action="unstage"]')).not.toBeNull();
  });

  it('cell 2 — an UNSTAGED row (staging provider) HAS discard', async () => {
    install({ resources: [resource('unstaged.ts', { staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('unstaged.ts');

    expect(rowFor('unstaged.ts').querySelector('[data-scm-action="discard"]')).not.toBeNull();
  });

  it('cell 3 — the STAGED group has NO bulk discard', async () => {
    install({ resources: [resource('a.ts', { staged: true }), resource('b.ts', { staged: true })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    expect(document.querySelector('[data-scm-group="staged"] [data-scm-bulk-discard]')).toBeNull();
    // The group still offers bulk unstage.
    expect(document.querySelector('[data-scm-group="staged"] [data-scm-bulk="unstage"]')).not.toBeNull();
  });

  it('cell 4 — the UNSTAGED side HAS a bulk discard (now on the section header)', async () => {
    install({ resources: [resource('a.ts', { staged: false }), resource('b.ts', { staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    // The unstaged group's title row was removed as a duplicate of the section header;
    // its bulk discard was hoisted onto that header.
    expect(document.querySelector('[data-scm-header-discard-all]')).not.toBeNull();
  });

  it('cell 5 — a provider with NO staging area keeps discard (rows AND bulk)', async () => {
    // THE CELL THAT GUARDS AGAINST OVER-FIXING. Such a provider (a future SVN one)
    // reports every row with `staged: undefined` and has exactly one
    // "working tree vs committed" notion — discard is its most basic action.
    // Gating on the row's flag alone (`staged !== true` / `staged === false`) would
    // silently take this whole provider's capability away.
    install({
      repository: repo({ capabilities: { ...repo().capabilities, staging: false } }),
      resources: [resource('a.ts', { staged: undefined }), resource('b.ts', { staged: undefined })],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    // The `changes` group renders its rows but, like `unstaged`, no longer draws a
    // duplicate title row; its bulk discard lives on the section header.
    expect(document.querySelector('[data-scm-group="changes"]')).not.toBeNull();
    expect(rowFor('a.ts').querySelector('[data-scm-action="discard"]')).not.toBeNull();
    expect(document.querySelector('[data-scm-header-discard-all]')).not.toBeNull();
  });

  it('cell 6 — a CONFLICTED row has no discard, though its `staged` is also undefined', async () => {
    // The discriminating pair with cell 5: **both rows carry `staged: undefined`**,
    // yet the expected answers are opposite. So the two gates are independent
    // dimensions and neither can be folded into the other:
    //
    //   cell 5  staged=undefined, state=modified,   staging=false → discard YES
    //   cell 6  staged=undefined, state=conflicted, staging=true  → discard NO
    //
    // What separates them is `isActionable(state)`, not the staging flag. Anyone who
    // "simplifies" the two gates into a single condition breaks exactly one of these
    // two cells — which is why they belong side by side.
    install({
      resources: [
        resource('conflict.ts', { state: 'conflicted', staged: undefined }),
        resource('edited.ts', { state: 'modified', staged: false }),
      ],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('conflict.ts');

    expect(rowFor('conflict.ts').getAttribute('data-scm-kind')).toBe('conflicted');
    expect(rowFor('conflict.ts').querySelector('[data-scm-action="discard"]')).toBeNull();
    // The blocked group offers no bulk discard either — every row in it is inert.
    expect(document.querySelector('[data-scm-group="blocked"] [data-scm-bulk-discard]')).toBeNull();
    // …while the ordinary unstaged row in the same repo still has its discard, so
    // this is a per-row gate and not the whole panel going read-only.
    expect(rowFor('edited.ts').querySelector('[data-scm-action="discard"]')).not.toBeNull();
  });

  it('never sends a discard for a staged row, even via the header’s bulk discard', async () => {
    // Behavioural backstop for cells 1+3: whatever the UI does, no staged row may
    // reach the wire in a discard request.
    install({
      resources: [resource('both.ts', { staged: true }), resource('both.ts', { staged: false })],
    });
    render(<ScmPanel projectId='p1' />);
    await waitFor(() => expect(document.querySelectorAll('[data-scm-resource]')).toHaveLength(2));

    fireEvent.click(document.querySelector('[data-scm-header-discard-all]')!);
    await confirmCalls[0].onOk?.();
    await waitFor(() => expect(actCalls).toHaveLength(1));
    expect(actCalls[0].action).toBe('discard');
    expect(actCalls[0].files).toHaveLength(1); // only the unstaged row
  });
});

describe('transport failure wording (must never claim the action did not run)', () => {
  it('a connection reset does NOT say the action failed or was not executed', async () => {
    // Acceptance criterion: the -2 path must carry no "not executed / nothing
    // changed" semantics. The request may well have completed; telling the user it
    // did not is the front end asserting what it cannot know — and for a discard it
    // costs a second irreversible destruction when they redo it.
    install({ resources: [resource('a.ts', { staged: false })], rejectTransport: RPC_RECONNECTED });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-report]')).not.toBeNull());

    const banner = document.querySelector('[data-scm-report]')!;
    expect(banner.textContent).toContain('actions.outcomeUnknown');
    // The three "nothing happened" wordings must NOT be used here.
    expect(banner.textContent).not.toContain('rejectedFailed');
    expect(banner.textContent).not.toContain('rejectedBlocked');
    expect(banner.textContent).not.toContain('actions.notSent');
    // …and it must not invite a redo. Retry lives in the report's secondary row
    // (a sibling of the summary banner), so assert it at panel scope, not inside
    // the banner node.
    expect(document.querySelector('[data-scm-retry]')).toBeNull();
  });

  it('a frame that never left the client DOES say nothing changed, and offers retry', async () => {
    install({ resources: [resource('a.ts', { staged: false })], rejectTransport: RPC_DISCONNECTED });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-report]')).not.toBeNull());

    const banner = document.querySelector('[data-scm-report]')!;
    expect(banner.textContent).toContain('actions.notSent');
    // Retry now sits in the report's secondary row beside the failed-file detail,
    // a sibling of the summary banner — assert at panel scope.
    expect(document.querySelector('[data-scm-retry]')).not.toBeNull();
  });
});

describe('retry re-asks before repeating a discard', () => {
  it('confirms again on retry (one confirmation per destructive request sent)', async () => {
    install({ resources: [resource('a.ts', { staged: false })], rejectCode: -32051 });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="discard"]')!);
    expect(confirmCalls).toHaveLength(1);
    await confirmCalls[0].onOk?.();
    await waitFor(() => expect(actCalls).toHaveLength(1));

    fireEvent.click(document.querySelector('[data-scm-retry]')!);
    // Retry must go through the same gate — not straight to the wire.
    expect(confirmCalls).toHaveLength(2);
    expect(actCalls).toHaveLength(1); // still only one request until confirmed
    await confirmCalls[1].onOk?.();
    await waitFor(() => expect(actCalls).toHaveLength(2));
  });

  it('does not confirm on retry for a non-destructive action', async () => {
    install({ resources: [resource('a.ts', { staged: false })], rejectCode: -32051 });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-retry]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-scm-retry]')!);

    await waitFor(() => expect(actCalls).toHaveLength(2));
    expect(confirmCalls).toHaveLength(0); // stage is reversible
  });
});

describe('partial counts stay sane', () => {
  it('never renders a negative success count when failed exceeds requested', async () => {
    // Off-contract but observed: 1 file requested, 2 failures reported. "completed
    // -1/1" reads as a UI bug and destroys trust in the whole message.
    install({
      resources: [resource('a.ts', { staged: false })],
      failures: [
        { file: { pe_id: 'pe1', relative_path: 'a.ts' }, reason: 'io' },
        { file: { pe_id: 'pe1', relative_path: 'ghost.ts' }, reason: 'io' },
      ],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-report]')).not.toBeNull());

    const text = document.querySelector('[data-scm-report]')!.textContent ?? '';
    expect(text).not.toMatch(/-\d/); // no negative number anywhere
  });

  it('reports an all-failed action as an error, not as a light "partial" warning', async () => {
    install({
      resources: [resource('a.ts', { staged: false })],
      failures: [{ file: { pe_id: 'pe1', relative_path: 'a.ts' }, reason: 'io' }],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    fireEvent.click(rowFor('a.ts').querySelector('[data-scm-action="stage"]')!);
    await waitFor(() => expect(document.querySelector('[data-scm-report]')).not.toBeNull());

    expect(document.querySelector('[data-scm-report="error"]')).not.toBeNull();
    expect(document.querySelector('[data-scm-report]')!.textContent).toContain('actions.allFailed');
  });
});

describe('blocked group states its reason inline', () => {
  it('renders the hint so an all-inert group does not read like a bug', async () => {
    install({ resources: [resource('conflict.ts', { state: 'conflicted', staged: undefined })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('conflict.ts');

    const hint = document.querySelector('[data-scm-group="blocked"] [data-scm-blocked-hint]');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain('actions.blockedHint');
  });

  it('does not render the hint on ordinary groups', async () => {
    install({ resources: [resource('a.ts', { staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('a.ts');

    expect(document.querySelector('[data-scm-blocked-hint]')).toBeNull();
  });
});

describe('status letter colour follows the state (and the theme)', () => {
  /** The A/M/D letter element for a row, found by its state badge. */
  const badgeOf = (name: string): HTMLElement => {
    const badge = rowFor(name).querySelector('[aria-label^="conversation.explorer.scm.state."]');
    if (!badge) throw new Error(`no badge for ${name}`);
    return badge as HTMLElement;
  };

  it('colours created / modified / deleted with the three semantic theme tokens', async () => {
    // Asserting on `text-success` / `text-warning` / `text-danger` rather than on hex
    // values is the point, not an accident: those classes resolve to `--success` /
    // `--warning` / `--danger`, which are defined once per light and dark scheme in
    // `styles/themes/default-color-scheme.css`. A hard-coded hex here would pass this
    // test and then be wrong in one of the two themes.
    install({
      resources: [
        resource('added.ts', { state: 'created', staged: false }),
        resource('changed.ts', { state: 'modified', staged: false }),
        resource('gone.ts', { state: 'deleted', staged: false }),
      ],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('added.ts');

    expect(badgeOf('added.ts').className).toContain('text-success');
    expect(badgeOf('changed.ts').className).toContain('text-warning');
    expect(badgeOf('gone.ts').className).toContain('text-danger');
  });

  it('gives DELETED and CONFLICTED different classes — they must never be unified', async () => {
    // ⚠️ This is the reverse assertion that guards the whole point of the change.
    // Both states are "red-ish", so a future "let's unify the red states" cleanup
    // would keep every forward assertion above green while destroying the one
    // distinction that matters: a deleted row has actions, a conflicted row has
    // NONE. If they look alike, the user hunts for buttons that were never there.
    install({
      resources: [
        resource('gone.ts', { state: 'deleted', staged: false }),
        resource('clash.ts', { state: 'conflicted', staged: undefined }),
      ],
    });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('clash.ts');

    const deleted = badgeOf('gone.ts').className;
    const conflicted = badgeOf('clash.ts').className;
    expect(conflicted).not.toBe(deleted);
    // And the difference is structural (a chip), not merely a different shade —
    // shade alone would not survive a colour-blind or low-contrast display.
    expect(conflicted).toContain('bg-danger-light-1');
    expect(conflicted).toContain('border-danger-4');
    expect(deleted).not.toContain('bg-danger-light-1');
  });

  it('keeps conflicted at least as prominent as deleted (never quieter)', async () => {
    // It is the state that most needs attention; making it subtler than an ordinary
    // change would invert the priority.
    install({ resources: [resource('clash.ts', { state: 'conflicted', staged: undefined })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('clash.ts');

    const cls = badgeOf('clash.ts').className;
    expect(cls).not.toContain('text-t-tertiary'); // the "quietest" token
    expect(cls).not.toContain('text-t-secondary');
  });

  it('colours renamed like created — the two renderings of one move stay consistent', async () => {
    // Over the rename-detection budget the same move arrives as `deleted` + `created`
    // instead of one `renamed`. Colouring renamed like created keeps both renderings
    // reading as "the file is here now" rather than inventing a fourth hue.
    install({ resources: [resource('moved.ts', { state: 'renamed', rename_from: 'old.ts', staged: false })] });
    render(<ScmPanel projectId='p1' />);
    // This file's i18n mock renders interpolations as `key:{json}` (see the
    // react-i18next mock at the top), so the label is matched on that shape.
    const label = await screen.findByText(/scm\.renamedFrom/);
    const badge = label
      .closest('[data-scm-resource]')
      ?.querySelector('[aria-label^="conversation.explorer.scm.state."]');
    expect(badge?.className).toContain('text-success');
  });

  it('leaves an UNKNOWN state on the quiet token, borrowing no other state colour', async () => {
    // We cannot say what it means, so it must not wear created/modified/deleted's colour.
    install({ resources: [resource('future.ts', { state: 'merge', staged: false })] });
    render(<ScmPanel projectId='p1' />);
    await screen.findByText('future.ts');

    const cls = badgeOf('future.ts').className;
    expect(cls).toContain('text-t-tertiary');
    for (const borrowed of ['text-success', 'text-warning', 'text-danger']) {
      expect(cls).not.toContain(borrowed);
    }
  });
});
