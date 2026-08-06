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

const emit = vi.fn();
vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: (...a: unknown[]) => emit(...a) } }));

// Controllable active conversation id for add-to-chat targeting.
let activeConversationId: string | null = null;
vi.mock('@/renderer/pages/conversation/explorer/currentConversationStore', () => ({
  useCurrentConversation: () => activeConversationId,
}));

// Mock the tree so the test targets only the container's action wiring; the
// marker exposes onRemoveRoot / onOpenFile / onAddToChat via buttons and shows
// whether onAddToChat was supplied (menu visibility mirrors this).
vi.mock('@/renderer/pages/conversation/explorer/ExplorerPanel', () => ({
  ExplorerPanel: ({
    roots,
    onRemoveRoot,
    onOpenFile,
    onAddToChat,
    onImportFiles,
  }: {
    roots: Array<{ title: string }>;
    onRemoveRoot?: (id: string) => void;
    onOpenFile?: (pe: string, rel: string) => void;
    onAddToChat?: (pe: string, rel: string, name: string, isFile: boolean) => void;
    onImportFiles?: (pe: string, rel: string, paths: string[]) => void;
  }) => (
    <div>
      <span data-testid='roots'>{roots.map((r) => r.title).join(',')}</span>
      <span data-testid='add-to-chat-enabled'>{onAddToChat ? 'yes' : 'no'}</span>
      <button data-testid='do-remove' onClick={() => onRemoveRoot?.('peA')}>
        rm
      </button>
      <button data-testid='do-open' onClick={() => onOpenFile?.('peA', 'docs/readme.md')}>
        open
      </button>
      <button data-testid='do-add-to-chat' onClick={() => onAddToChat?.('peA', 'src/main.ts', 'main.ts', true)}>
        add
      </button>
      <button data-testid='do-import' onClick={() => onImportFiles?.('peA', 'sub', ['/os/a.txt', '/os/b.txt'])}>
        import
      </button>
    </div>
  ),
}));

const projectGet = vi.fn<(p: { project_id: string }) => Promise<ProjectDetailDto>>();
const attachFolder = vi.fn();
const removeFolder = vi.fn();
const showOpen = vi.fn();
const copyFiles = vi.fn();
const readContent = vi.fn();
const getContentMetadata = vi.fn();
vi.mock('@/common', () => ({
  ipcBridge: {
    project: {
      get: { invoke: (p: { project_id: string }) => projectGet(p) },
      attachFolder: { invoke: (p: unknown) => attachFolder(p) },
      removeFolder: { invoke: (p: unknown) => removeFolder(p) },
    },
    fs: {
      copyFilesToProject: { invoke: (p: unknown) => copyFiles(p) },
      readContent: { invoke: (p: unknown) => readContent(p) },
      // Opening a file goes through resolvePreviewPayload, which stats it first:
      // size decides whether the content is read at all, lastModified becomes the
      // save-time If-Match.
      getContentMetadata: { invoke: (p: unknown) => getContentMetadata(p) },
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
  copyFiles.mockReset().mockResolvedValue({ copied_files: [], failed_files: [] });
  emit.mockReset();
  activeConversationId = null;
  fsRead.mockReset().mockResolvedValue({ content: 'hello', encoding: 'utf-8' });
  readContent.mockReset().mockResolvedValue('hello');
  // Small file, well within the preview size ceiling.
  getContentMetadata.mockReset().mockResolvedValue({
    name: 'readme.md',
    path: '/abs/readme.md',
    size: 5,
    type: 'file',
    lastModified: 1_717_000_000,
  });
  vi.spyOn(Message, 'info').mockImplementation(() => '' as never);
  vi.spyOn(Message, 'warning').mockImplementation(() => '' as never);
  vi.spyOn(Message, 'error').mockImplementation(() => '' as never);
  vi.spyOn(Message, 'success').mockImplementation(() => '' as never);
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

  it('opens a selected file in preview via /content by ChatFileRef (pe_id + relative_path, no absolute path)', async () => {
    renderIt();
    await screen.findByTestId('roots');
    fireEvent.click(screen.getByTestId('do-open'));
    // Text content is read by Project ChatFileRef over /api/fs/content (utf8), not WS fs/read.
    await waitFor(() =>
      expect(readContent).toHaveBeenCalledWith({
        file: { kind: 'project', pe_id: 'peA', relative_path: 'docs/readme.md' },
        encoding: 'utf8',
      })
    );
    expect(fsRead).not.toHaveBeenCalled();
    await waitFor(() => expect(openPreview).toHaveBeenCalled());
    const [content, type, metadata] = openPreview.mock.calls[0];
    expect(content).toBe('hello');
    expect(type).toBe('markdown'); // readme.md → markdown
    // Carries the Project ref so preview I/O addresses the file by pe identity.
    expect(metadata.fileRef).toEqual({ kind: 'project', pe_id: 'peA', relative_path: 'docs/readme.md' });
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

describe('ExplorerContainer add-to-chat', () => {
  it('disables add-to-chat when there is no active conversation (e.g. non-chat route)', async () => {
    activeConversationId = null;
    renderIt();
    expect(await screen.findByTestId('add-to-chat-enabled')).toHaveTextContent('no');
  });

  it('emits the append on all agent prefixes carrying the active conversation id (targeted)', async () => {
    activeConversationId = 'c1';
    renderIt();
    expect(await screen.findByTestId('add-to-chat-enabled')).toHaveTextContent('yes');
    fireEvent.click(screen.getByTestId('do-add-to-chat'));
    await waitFor(() => expect(emit).toHaveBeenCalledTimes(3));
    const payload = [
      {
        path: 'src/main.ts',
        name: 'main.ts',
        isFile: true,
        chatRef: { kind: 'project', pe_id: 'peA', relative_path: 'src/main.ts' },
      },
    ];
    // Every prefix carries the target id 'c1' — only the box whose conversation
    // matches consumes it (ids are unique), so same-type team peers don't leak.
    expect(emit).toHaveBeenCalledWith('acp.selected.file.append', payload, 'c1');
    expect(emit).toHaveBeenCalledWith('codex.selected.file.append', payload, 'c1');
    expect(emit).toHaveBeenCalledWith('aionrs.selected.file.append', payload, 'c1');
  });
});

describe('ExplorerContainer A-paste import', () => {
  it('copies dropped files to the pe-targeted dir via /api/fs/copy', async () => {
    copyFiles.mockResolvedValue({ copied_files: ['/ws/sub/a.txt', '/ws/sub/b.txt'], failed_files: [] });
    renderIt();
    fireEvent.click(await screen.findByTestId('do-import'));
    await waitFor(() =>
      expect(copyFiles).toHaveBeenCalledWith({
        file_paths: ['/os/a.txt', '/os/b.txt'],
        target: { pe_id: 'peA', relative_path: 'sub' },
      })
    );
    await waitFor(() => expect(Message.success).toHaveBeenCalled());
  });

  it('warns (does not silently drop) when some files fail — name conflicts or unsupported', async () => {
    copyFiles.mockResolvedValue({
      copied_files: ['/ws/sub/a.txt'],
      failed_files: [{ path: '/os/b.txt', reason: 'exists' }],
    });
    renderIt();
    fireEvent.click(await screen.findByTestId('do-import'));
    await waitFor(() => expect(Message.warning).toHaveBeenCalledWith('conversation.explorer.importPartialFailed'));
    expect(Message.success).not.toHaveBeenCalled();
  });

  it('errors (not warns) when every file fails — nothing was imported', async () => {
    copyFiles.mockResolvedValue({
      copied_files: [],
      failed_files: [
        { path: '/os/a.txt', reason: 'exists' },
        { path: '/os/b.txt', reason: 'directories not supported yet' },
      ],
    });
    renderIt();
    fireEvent.click(await screen.findByTestId('do-import'));
    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('conversation.explorer.importFailed'));
    expect(Message.warning).not.toHaveBeenCalled();
    expect(Message.success).not.toHaveBeenCalled();
  });

  it('surfaces an error toast when the copy request throws', async () => {
    copyFiles.mockRejectedValue(new Error('network'));
    renderIt();
    fireEvent.click(await screen.findByTestId('do-import'));
    await waitFor(() => expect(Message.error).toHaveBeenCalledWith('conversation.explorer.importFailed'));
  });
});
