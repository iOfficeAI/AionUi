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

const detail = (entries: ProjectEntryDto[]): ProjectDetailDto => ({
  project_id: 'p1',
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
    // Changes tab shows the placeholder…
    expect(screen.getByText('conversation.explorer.changesPlaceholder')).toBeInTheDocument();
    // …and the explorer stays mounted (root still in the DOM, just hidden) — no rebuild.
    expect(screen.getByText('Root Alpha')).toBeInTheDocument();

    // Switching back hides the placeholder and keeps the tree.
    fireEvent.click(screen.getByText('conversation.explorer.tabs.files'));
    expect(screen.queryByText('conversation.explorer.changesPlaceholder')).not.toBeInTheDocument();
    expect(screen.getByText('Root Alpha')).toBeInTheDocument();
  });

  it('refetches and re-projects when projectId changes', async () => {
    projectGet.mockImplementation(async ({ project_id }) =>
      project_id === 'p1'
        ? detail([entry({ pe_id: 'peA', display_name: 'Root Alpha' })])
        : detail([entry({ pe_id: 'peB', display_name: 'Root Beta' })])
    );

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
});
