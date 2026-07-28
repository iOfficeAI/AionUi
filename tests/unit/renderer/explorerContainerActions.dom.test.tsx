/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Message } from '@arco-design/web-react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetailDto, ProjectEntryDto } from '@/common/types/project';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const openPreview = vi.fn();
vi.mock('@/renderer/pages/conversation/Preview', () => ({ usePreviewContext: () => ({ openPreview }) }));

const fsRead = vi.fn();
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({
  initExplorerRuntime: () => ({ request: (m: string, p: unknown) => fsRead(m, p) }),
}));

// Mock the tree so the test targets only the container's action wiring;
// the marker exposes onRemoveRoot / onOpenFile via buttons.
vi.mock('@/renderer/pages/conversation/explorer/ExplorerPanel', () => ({
  ExplorerPanel: ({
    roots,
    onRemoveRoot,
    onOpenFile,
  }: {
    roots: Array<{ title: string }>;
    onRemoveRoot?: (id: string) => void;
    onOpenFile?: (pe: string, rel: string) => void;
  }) => (
    <div>
      <span data-testid='roots'>{roots.map((r) => r.title).join(',')}</span>
      <button data-testid='do-remove' onClick={() => onRemoveRoot?.('peA')}>
        rm
      </button>
      <button data-testid='do-open' onClick={() => onOpenFile?.('peA', 'docs/readme.md')}>
        open
      </button>
    </div>
  ),
}));

const projectGet = vi.fn<(p: { project_id: string }) => Promise<ProjectDetailDto>>();
const attachFolder = vi.fn();
const removeFolder = vi.fn();
const showOpen = vi.fn();
vi.mock('@/common', () => ({
  ipcBridge: {
    project: {
      get: { invoke: (p: { project_id: string }) => projectGet(p) },
      attachFolder: { invoke: (p: unknown) => attachFolder(p) },
      removeFolder: { invoke: (p: unknown) => removeFolder(p) },
    },
    dialog: { showOpen: { invoke: (p: unknown) => showOpen(p) } },
  },
}));

import { ExplorerContainer } from '@/renderer/pages/conversation/explorer/ExplorerContainer';
import { resetExplorerStoreForTest } from '@/renderer/pages/conversation/explorer/explorerStore';

const entry = (over: Partial<ProjectEntryDto>): ProjectEntryDto => ({
  pe_id: 'peA',
  role: 'workspace',
  display_name: 'Root',
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
const backendErr = (code: string) => ({ name: 'BackendHttpError', status: 409, code });

const renderIt = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ExplorerContainer projectId='p1' />
    </SWRConfig>
  );

beforeEach(() => {
  resetExplorerStoreForTest();
  projectGet.mockReset().mockResolvedValue(detail([entry({ pe_id: 'peA', display_name: 'Root' })]));
  attachFolder.mockReset();
  removeFolder.mockReset();
  showOpen.mockReset();
  openPreview.mockReset();
  fsRead.mockReset().mockResolvedValue({ content: 'hello', encoding: 'utf-8' });
  vi.spyOn(Message, 'info').mockImplementation(() => '' as never);
  vi.spyOn(Message, 'warning').mockImplementation(() => '' as never);
  vi.spyOn(Message, 'error').mockImplementation(() => '' as never);
  try {
    localStorage.clear();
  } catch {
    /* jsdom */
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const clickAdd = async () => {
  await screen.findByTestId('roots');
  fireEvent.click(screen.getByLabelText('conversation.explorer.addFolder'));
};

describe('ExplorerContainer attach/remove', () => {
  it('attaches a picked directory as a file:// URI and revalidates the tree', async () => {
    showOpen.mockResolvedValue(['/Users/me/lib']);
    attachFolder.mockResolvedValue(entry({ pe_id: 'peB', role: 'attached' }));
    renderIt();
    await clickAdd();

    await waitFor(() => expect(attachFolder).toHaveBeenCalledWith({ project_id: 'p1', uri: 'file:///Users/me/lib' }));
    await waitFor(() => expect(projectGet).toHaveBeenCalledTimes(2)); // initial + revalidate
  });

  it('does nothing when the directory picker is cancelled', async () => {
    showOpen.mockResolvedValue(undefined);
    renderIt();
    await clickAdd();
    await waitFor(() => expect(showOpen).toHaveBeenCalled());
    expect(attachFolder).not.toHaveBeenCalled();
  });

  it('shows an info message on a duplicate-folder 409 (already in project)', async () => {
    showOpen.mockResolvedValue(['/dup']);
    attachFolder.mockRejectedValue(backendErr('project_explorer_duplicate'));
    renderIt();
    await clickAdd();
    await waitFor(() => expect(Message.info).toHaveBeenCalledWith('conversation.explorer.attachDuplicate'));
  });

  it('shows a warning on an overlap 409', async () => {
    showOpen.mockResolvedValue(['/overlap']);
    attachFolder.mockRejectedValue(backendErr('project_explorer_overlap'));
    renderIt();
    await clickAdd();
    await waitFor(() => expect(Message.warning).toHaveBeenCalledWith('conversation.explorer.attachOverlap'));
  });

  it('shows a generic error on other attach failures', async () => {
    showOpen.mockResolvedValue(['/x']);
    attachFolder.mockRejectedValue(new Error('network'));
    renderIt();
    await clickAdd();
    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('conversation.explorer.attachFailed'));
  });

  it('opens a selected file in preview via WS fs/read (pe_id + relative_path, no absolute path)', async () => {
    renderIt();
    await screen.findByTestId('roots');
    fireEvent.click(screen.getByTestId('do-open'));
    await waitFor(() =>
      expect(fsRead).toHaveBeenCalledWith('fs/read', {
        file: { pe_id: 'peA', relative_path: 'docs/readme.md' },
        encoding: 'utf-8',
      })
    );
    await waitFor(() => expect(openPreview).toHaveBeenCalled());
    const [content, type] = openPreview.mock.calls[0];
    expect(content).toBe('hello');
    expect(type).toBe('markdown'); // readme.md → markdown
  });

  it('removes an attached folder and revalidates the tree', async () => {
    removeFolder.mockResolvedValue(undefined);
    renderIt();
    await screen.findByTestId('roots');
    fireEvent.click(screen.getByTestId('do-remove'));
    await waitFor(() => expect(removeFolder).toHaveBeenCalledWith({ project_id: 'p1', pe_id: 'peA' }));
    await waitFor(() => expect(projectGet).toHaveBeenCalledTimes(2));
  });
});
