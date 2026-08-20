/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetailDto, ProjectEntryDto } from '@/common/types/project';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, opts?: { index?: number }) => (opts?.index ? `${k}#${opts.index}` : k) }),
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({ usePreviewContext: () => ({ openPreview: () => {} }) }));

const initExplorerRuntime = vi.fn(() => ({}));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({
  initExplorerRuntime: () => initExplorerRuntime(),
}));

const projectGet = vi.fn<(p: { project_id: string }) => Promise<ProjectDetailDto>>();
vi.mock('@/common', () => ({
  ipcBridge: { project: { get: { invoke: (p: { project_id: string }) => projectGet(p) } } },
}));

// Marker stubs: this suite asserts tab/dropdown behavior, not the panels.
vi.mock('@/renderer/pages/conversation/explorer/ExplorerPanel', () => ({
  ExplorerPanel: () => <div data-testid='files-panel' />,
}));
vi.mock('@/renderer/pages/conversation/SourceControl/ScmPanel', () => ({
  ScmPanel: () => <div data-testid='scm-panel' />,
}));
vi.mock('@/renderer/pages/conversation/explorer/search/SearchPanel', () => ({
  SearchPanel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { ExplorerContainer } from '@/renderer/pages/conversation/explorer/ExplorerContainer';
import { resetExplorerStoreForTest } from '@/renderer/pages/conversation/explorer/explorerStore';
import {
  resetCurrentConversationForTest,
  setCurrentConversation,
} from '@/renderer/pages/conversation/explorer/currentConversationStore';
import {
  resetSideConversationUiForTest,
  setSideConversationUi,
  type SideConversationUiSnapshot,
} from '@/renderer/pages/conversation/components/SideConversationPanel/sideConversationUiStore';
import { dispatchExplorerShowSideEvent } from '@/renderer/utils/workspace/workspaceEvents';

const entry: ProjectEntryDto = {
  pe_id: 'peA',
  role: 'workspace',
  display_name: 'Root Alpha',
  display_path: '/x',
  order_index: 0,
  runtime_status: 'available',
};

const detail: ProjectDetailDto = {
  project_id: 'p1',
  name: 'Proj',
  explorer: { workspace_pe_id: 'peA', entries: [entry] },
};

const SIDE_TAB = 'conversation.sideConversation.title';

const publishSide = (over: Partial<SideConversationUiSnapshot> = {}): SideConversationUiSnapshot => {
  const snapshot: SideConversationUiSnapshot = {
    parentId: 'conv1',
    threads: [
      { id: 'c1', label: 'first question', mode: 'fork', promoted: false },
      { id: 'c2', label: 'second question', mode: 'fork', promoted: false },
    ],
    activeThreadId: 'c1',
    content: <div data-testid='side-content' />,
    selectTab: vi.fn(),
    discardTab: vi.fn(),
    openNewTab: vi.fn(),
    promoteCurrent: vi.fn(),
    ...over,
  };
  setSideConversationUi(snapshot);
  return snapshot;
};

const renderContainer = (projectId?: string) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ExplorerContainer projectId={projectId} />
    </SWRConfig>
  );

beforeEach(() => {
  resetExplorerStoreForTest();
  resetCurrentConversationForTest();
  resetSideConversationUiForTest();
  initExplorerRuntime.mockClear();
  projectGet.mockReset();
  projectGet.mockResolvedValue(detail);
  setCurrentConversation('conv1');
});

afterEach(() => {
  cleanup();
});

describe('ExplorerContainer side tab', () => {
  it('shows the side tab with a thread-count badge next to files/changes in project mode', async () => {
    publishSide();
    renderContainer('p1');

    expect(await screen.findByText(SIDE_TAB)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // badge
    expect(screen.getByText('conversation.explorer.tabs.files')).toBeInTheDocument();
    expect(screen.getByText('conversation.explorer.tabs.changes')).toBeInTheDocument();
    // Side panel mounted but hidden while files is the active tab.
    const sideContent = screen.getByTestId('side-content');
    expect((sideContent.parentElement as HTMLElement).style.display).toBe('none');
  });

  it('hides the badge when there are no threads and ignores foreign snapshots', async () => {
    publishSide({ threads: [], activeThreadId: undefined });
    renderContainer('p1');
    expect(await screen.findByText(SIDE_TAB)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();

    cleanup();
    publishSide({ parentId: 'someone-else' });
    renderContainer('p1');
    await screen.findByText('conversation.explorer.tabs.files');
    expect(screen.queryByText(SIDE_TAB)).not.toBeInTheDocument();
  });

  it('activates the side panel on first click and opens the dropdown on the next', async () => {
    const side = publishSide();
    renderContainer('p1');
    const tab = await screen.findByText(SIDE_TAB);

    // First click: activates the panel, dropdown stays closed.
    fireEvent.click(tab);
    expect((screen.getByTestId('side-content').parentElement as HTMLElement).style.display).toBe('');
    expect(screen.queryByText('first question')).not.toBeInTheDocument();

    // Second click (tab already active): dropdown lists threads + actions.
    fireEvent.click(tab);
    expect(await screen.findByText('first question')).toBeInTheDocument();
    expect(screen.getByText('second question')).toBeInTheDocument();
    expect(screen.getByText('conversation.sideConversation.newTab')).toBeInTheDocument();
    expect(screen.getByText('conversation.sideConversation.promoteCurrent')).toBeInTheDocument();

    // Switch thread from the dropdown.
    fireEvent.click(screen.getByText('second question'));
    expect(side.selectTab).toHaveBeenCalledWith('c2');
  });

  it('closes a thread from the row ✕ without selecting it', async () => {
    const side = publishSide();
    renderContainer('p1');
    const tab = await screen.findByText(SIDE_TAB);
    fireEvent.click(tab); // activate
    fireEvent.click(tab); // open dropdown
    await screen.findByText('first question');

    const closeButtons = screen.getAllByLabelText('conversation.sideConversation.closeTab');
    fireEvent.click(closeButtons[1]);

    expect(side.discardTab).toHaveBeenCalledWith('c2');
    expect(side.selectTab).not.toHaveBeenCalled();
  });

  it('creates a new thread from the dropdown and promotes only the current one', async () => {
    const side = publishSide();
    renderContainer('p1');
    const tab = await screen.findByText(SIDE_TAB);
    fireEvent.click(tab);
    fireEvent.click(tab);

    fireEvent.click(await screen.findByText('conversation.sideConversation.newTab'));
    expect(side.openNewTab).toHaveBeenCalledTimes(1);

    fireEvent.click(tab); // reopen after the menu closed
    fireEvent.click(await screen.findByText('conversation.sideConversation.promoteCurrent'));
    expect(side.promoteCurrent).toHaveBeenCalledTimes(1);
  });

  it('disables promote when the current thread is already promoted', async () => {
    const side = publishSide({
      threads: [{ id: 'c1', label: 'first question', mode: 'fork', promoted: true }],
      activeThreadId: 'c1',
    });
    renderContainer('p1');
    const tab = await screen.findByText(SIDE_TAB);
    fireEvent.click(tab);
    fireEvent.click(tab);

    // Arco swallows clicks on disabled menu items.
    fireEvent.click(await screen.findByText('conversation.sideConversation.promoteCurrent'));
    expect(side.promoteCurrent).not.toHaveBeenCalled();
  });

  it('switches to the side tab when a side entry point fires the show-side event', async () => {
    publishSide();
    renderContainer('p1');
    await screen.findByText(SIDE_TAB);
    expect((screen.getByTestId('side-content').parentElement as HTMLElement).style.display).toBe('none');

    dispatchExplorerShowSideEvent();

    await waitFor(() => {
      expect((screen.getByTestId('side-content').parentElement as HTMLElement).style.display).toBe('');
    });
  });

  it('keeps the side panel mounted when switching back to files', async () => {
    publishSide();
    renderContainer('p1');
    const tab = await screen.findByText(SIDE_TAB);
    fireEvent.click(tab); // activate side
    expect((screen.getByTestId('side-content').parentElement as HTMLElement).style.display).toBe('');

    fireEvent.click(screen.getByText('conversation.explorer.tabs.files'));
    const sideContent = screen.getByTestId('side-content');
    expect((sideContent.parentElement as HTMLElement).style.display).toBe('none');
  });

  it('no-project mode hosts ONLY the side tab', async () => {
    publishSide();
    renderContainer(undefined);

    expect(await screen.findByText(SIDE_TAB)).toBeInTheDocument();
    expect(screen.queryByText('conversation.explorer.tabs.files')).not.toBeInTheDocument();
    expect(screen.queryByText('conversation.explorer.tabs.changes')).not.toBeInTheDocument();
    // Side tab is the default-active tab in no-project mode.
    expect((screen.getByTestId('side-content').parentElement as HTMLElement).style.display).toBe('');
    expect(projectGet).not.toHaveBeenCalled();
  });

  it('no-project mode renders nothing when side conversations are unavailable', () => {
    const { container } = renderContainer(undefined);
    expect(container.firstChild).toBeNull();
  });
});
