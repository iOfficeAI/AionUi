/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetailDto, ProjectEntryDto } from '@/common/types/project';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({ usePreviewContext: () => ({ openPreview: () => {} }) }));

// Isolate the container from the real WS runtime.
const initExplorerRuntime = vi.fn(() => ({}));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({
  initExplorerRuntime: () => initExplorerRuntime(),
}));

// Mock the HTTP control-plane fetch.
const projectGet = vi.fn<(p: { project_id: string }) => Promise<ProjectDetailDto>>();
vi.mock('@/common', () => ({
  ipcBridge: { project: { get: { invoke: (p: { project_id: string }) => projectGet(p) } } },
}));

import { ExplorerContainer } from '@/renderer/pages/conversation/explorer/ExplorerContainer';
import { resetExplorerStoreForTest } from '@/renderer/pages/conversation/explorer/explorerStore';

const entry = (over: Partial<ProjectEntryDto>): ProjectEntryDto => ({
  pe_id: 'peA',
  role: 'workspace',
  display_name: null,
  display_path: '/x',
  order_index: 0,
  runtime_status: 'available',
  ...over,
});

// `project_id` must match the projectId the container was mounted with — the
// container only applies a detail whose `project_id === projectId` (the
// apply-time guard against a poisoned shared SWR entry painting another project).
const detail = (entries: ProjectEntryDto[], projectId = 'p1'): ProjectDetailDto => ({
  project_id: projectId,
  name: 'Proj',
  explorer: { workspace_pe_id: entries[0]?.pe_id ?? '', entries },
});

// Fresh SWR cache per render so tests don't share fetch results.
const renderContainer = (projectId: string) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ExplorerContainer projectId={projectId} />
    </SWRConfig>
  );

beforeEach(() => {
  resetExplorerStoreForTest();
  initExplorerRuntime.mockClear();
  projectGet.mockReset();
  try {
    localStorage.clear();
  } catch {
    /* jsdom always has localStorage */
  }
});

afterEach(() => {
  cleanup();
});

describe('ExplorerContainer data integration', () => {
  it('fetches GET /projects/{id} and projects the returned roots into the tree', async () => {
    projectGet.mockResolvedValue(detail([entry({ pe_id: 'peA', display_name: 'Root Alpha' })]));
    renderContainer('p1');

    expect(await screen.findByText('Root Alpha')).toBeInTheDocument();
    expect(projectGet).toHaveBeenCalledWith({ project_id: 'p1' });
  });

  it('renders every entry as a sibling root', async () => {
    projectGet.mockResolvedValue(
      detail([
        entry({ pe_id: 'peA', role: 'workspace', display_name: 'Root Alpha' }),
        entry({ pe_id: 'peB', role: 'attached', display_name: 'Root Beta', order_index: 1 }),
      ])
    );
    renderContainer('p1');

    expect(await screen.findByText('Root Alpha')).toBeInTheDocument();
    expect(screen.getByText('Root Beta')).toBeInTheDocument();
  });

  it('renders an empty tree (no crash) when the fetch rejects', async () => {
    projectGet.mockRejectedValue(new Error('boom'));
    renderContainer('p1');

    // Nothing to assert positively; ensure the fetch was attempted and no root shows.
    await waitFor(() => expect(projectGet).toHaveBeenCalled());
    expect(screen.queryByText('Root Alpha')).not.toBeInTheDocument();
  });

  it('does not fetch and renders nothing when projectId is empty', () => {
    renderContainer('');
    expect(projectGet).not.toHaveBeenCalled();
    expect(screen.queryByText('Root Alpha')).not.toBeInTheDocument();
  });

  it('greys and caution-marks a root whose folder is unreachable (runtime_status != available)', async () => {
    projectGet.mockResolvedValue(
      detail([entry({ pe_id: 'peA', display_name: 'Broken Root', runtime_status: 'missing' })])
    );
    renderContainer('p1');

    const title = await screen.findByText('Broken Root');
    const row = title.closest('[data-runtime-status]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('data-runtime-status')).toBe('missing');
    expect(row?.className).toContain('text-t-secondary'); // greyed
  });

  it('does not grey an available root', async () => {
    projectGet.mockResolvedValue(
      detail([entry({ pe_id: 'peA', display_name: 'Healthy Root', runtime_status: 'available' })])
    );
    renderContainer('p1');

    const title = await screen.findByText('Healthy Root');
    const row = title.closest('[data-runtime-status]');
    expect(row?.getAttribute('data-runtime-status')).toBe('available');
    expect(row?.className).not.toContain('text-t-secondary');
  });

  it('switches to the Changes tab without unmounting the explorer (kept mounted)', async () => {
    projectGet.mockResolvedValue(detail([entry({ pe_id: 'peA', display_name: 'Root Alpha' })]));
    renderContainer('p1');
    expect(await screen.findByText('Root Alpha')).toBeInTheDocument();

    // Component-switcher tabs present (t returns the raw key here).
    fireEvent.click(screen.getByText('conversation.explorer.tabs.changes'));
    // Changes tab shows the Source Control panel. With no SCM port configured (the
    // WS runtime is stubbed here) the store lands in its error state, which is
    // enough to prove the real panel — not the old placeholder — is mounted.
    expect(await screen.findByText('conversation.explorer.scm.loadFailed')).toBeInTheDocument();
    // …and the explorer stays mounted (root still in the DOM, just hidden) — no rebuild.
    expect(screen.getByText('Root Alpha')).toBeInTheDocument();

    // Switching back unmounts the SCM panel and keeps the tree.
    fireEvent.click(screen.getByText('conversation.explorer.tabs.files'));
    expect(screen.queryByText('conversation.explorer.scm.loadFailed')).not.toBeInTheDocument();
    expect(screen.getByText('Root Alpha')).toBeInTheDocument();
  });

  it('refetches and re-projects when projectId changes', async () => {
    // Echo the requested project_id into the returned detail — faithfully models
    // the key-derived fetcher (a fetch for key X always resolves project X's
    // data), so the container's `project_id === projectId` guard sees a match for
    // whichever project is mounted. Avoids a hardcoded id that would rot.
    projectGet.mockImplementation(async ({ project_id }) => {
      const isP1 = project_id === 'p1';
      return detail(
        [entry({ pe_id: isP1 ? 'peA' : 'peB', display_name: isP1 ? 'Root Alpha' : 'Root Beta' })],
        project_id
      );
    });

    const { rerender } = renderContainer('p1');
    expect(await screen.findByText('Root Alpha')).toBeInTheDocument();

    rerender(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ExplorerContainer projectId='p2' />
      </SWRConfig>
    );
    expect(await screen.findByText('Root Beta')).toBeInTheDocument();
    expect(screen.queryByText('Root Alpha')).not.toBeInTheDocument();
  });

  // Apply-time guard: a detail whose project_id does not match the mounted
  // projectId (a poisoned shared SWR entry — another project's data filed under
  // this key during a rapid switch) must NOT paint that other project's roots.
  // Removing the `data.project_id === projectId` guard makes this render "Ghost
  // Root" (the pre-fix wrong-tree bug).
  it('never paints roots from a detail belonging to a different project (anti-poison guard)', async () => {
    projectGet.mockResolvedValue(detail([entry({ pe_id: 'peX', display_name: 'Ghost Root' })], 'other-project'));
    renderContainer('p1');

    await waitFor(() => expect(projectGet).toHaveBeenCalled());
    // The fetched detail belongs to 'other-project', not 'p1' → dropped, no roots.
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText('Ghost Root')).not.toBeInTheDocument();
  });
});
