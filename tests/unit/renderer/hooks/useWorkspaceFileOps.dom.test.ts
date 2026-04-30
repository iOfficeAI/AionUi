import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '../../../../src/common/adapter/httpBridge';
import type { IDirOrFile } from '../../../../src/common/adapter/ipcBridge';

const mockReadFile = vi.fn();
const mockGetImageBase64 = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      readFile: { invoke: (...args: unknown[]) => mockReadFile(...args) },
      getImageBase64: { invoke: (...args: unknown[]) => mockGetImageBase64(...args) },
    },
    shell: {
      openFile: { invoke: vi.fn() },
      showItemInFolder: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

import { useWorkspaceFileOps } from '../../../../src/renderer/pages/conversation/Workspace/hooks/useWorkspaceFileOps';

const translations: Record<string, string> = {
  'conversation.workspace.preview.errors.outsideSandbox': 'Outside sandbox',
  'conversation.workspace.preview.errors.notFound': 'Missing file',
  'conversation.workspace.preview.errors.timeout': 'Timed out',
  'conversation.workspace.contextMenu.previewFailed': 'Preview failed',
};

function makeNode(path: string): IDirOrFile {
  return {
    name: path.split('/').pop() ?? path,
    fullPath: path,
    relativePath: path.split('/').pop() ?? path,
    isDir: false,
    isFile: true,
  };
}

function buildOptions() {
  return {
    workspace: '/custom-workspace',
    eventPrefix: 'acp' as const,
    messageApi: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    t: (key: string) => translations[key] ?? key,
    setFiles: vi.fn(),
    setSelected: vi.fn(),
    setExpandedKeys: vi.fn(),
    selectedKeysRef: { current: [] as string[] },
    selectedNodeRef: { current: null as { relativePath: string; fullPath: string } | null },
    ensureNodeSelected: vi.fn(),
    refreshWorkspace: vi.fn(),
    renameModal: { visible: false, value: '', target: null },
    deleteModal: { visible: false, target: null, loading: false },
    renameLoading: false,
    setRenameLoading: vi.fn(),
    closeRenameModal: vi.fn(),
    closeDeleteModal: vi.fn(),
    closeContextMenu: vi.fn(),
    setRenameModal: vi.fn(),
    setDeleteModal: vi.fn(),
    openPreview: vi.fn(),
  };
}

describe('useWorkspaceFileOps.handlePreviewFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes workspace to readFile for markdown previews', async () => {
    mockReadFile.mockResolvedValue('# hello');
    const options = buildOptions();
    const { result } = renderHook(() => useWorkspaceFileOps(options));

    await act(async () => {
      await result.current.handlePreviewFile(makeNode('/custom-workspace/a.md'));
    });

    expect(mockReadFile).toHaveBeenCalledWith({
      path: '/custom-workspace/a.md',
      workspace: '/custom-workspace',
    });
    expect(options.openPreview).toHaveBeenCalledWith(
      '# hello',
      'markdown',
      expect.objectContaining({
        file_path: '/custom-workspace/a.md',
        workspace: '/custom-workspace',
      })
    );
  });

  it('passes workspace to getImageBase64 for image previews', async () => {
    mockGetImageBase64.mockResolvedValue('data:image/png;base64,abc');
    const options = buildOptions();
    const { result } = renderHook(() => useWorkspaceFileOps(options));

    await act(async () => {
      await result.current.handlePreviewFile(makeNode('/custom-workspace/a.png'));
    });

    expect(mockGetImageBase64).toHaveBeenCalledWith({
      path: '/custom-workspace/a.png',
      workspace: '/custom-workspace',
    });
  });

  it('shows outsideSandbox toast for sandbox errors', async () => {
    mockReadFile.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/fs/read',
        status: 403,
        body: { code: 'PATH_OUTSIDE_SANDBOX', error: 'outside sandbox' },
      })
    );
    const options = buildOptions();
    const { result } = renderHook(() => useWorkspaceFileOps(options));

    await act(async () => {
      await result.current.handlePreviewFile(makeNode('/custom-workspace/a.md'));
    });

    expect(options.messageApi.error).toHaveBeenCalledWith('Outside sandbox');
    expect(options.openPreview).not.toHaveBeenCalled();
  });

  it('shows notFound toast when readFile returns null', async () => {
    mockReadFile.mockResolvedValue(null);
    const options = buildOptions();
    const { result } = renderHook(() => useWorkspaceFileOps(options));

    await act(async () => {
      await result.current.handlePreviewFile(makeNode('/custom-workspace/a.md'));
    });

    expect(options.messageApi.error).toHaveBeenCalledWith('Missing file');
    expect(options.openPreview).not.toHaveBeenCalled();
  });
});
