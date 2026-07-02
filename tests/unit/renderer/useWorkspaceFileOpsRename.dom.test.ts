import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { useWorkspaceFileOps } from '@/renderer/pages/conversation/Workspace/hooks/useWorkspaceFileOps';

const renameWorkspaceEntry = vi.fn();

vi.mock('@/renderer/utils/file/workspaceFs', () => ({
  removeWorkspaceEntry: vi.fn(),
  renameWorkspaceEntry: (...args: unknown[]) => renameWorkspaceEntry(...args),
}));

vi.mock('@/renderer/utils/file/download', () => ({
  downloadFileFromPath: vi.fn(),
}));

describe('useWorkspaceFileOps rename', () => {
  beforeEach(() => {
    renameWorkspaceEntry.mockReset();
    renameWorkspaceEntry.mockResolvedValue({ new_path: '\\\\?\\D:\\CODE\\CLAUDE.md1' });
  });

  it('refreshes workspace after rename instead of patching local tree paths', async () => {
    const target: IDirOrFile = {
      name: 'CLAUDE.md',
      fullPath: 'D:\\CODE\\CLAUDE.md',
      relativePath: 'CLAUDE.md',
      isDir: false,
      isFile: true,
    };
    const refreshWorkspace = vi.fn();
    const setSelected = vi.fn();
    const selectedKeysRef = { current: ['CLAUDE.md'] };
    const selectedNodeRef: { current: { relativePath: string; fullPath: string } | null } = {
      current: { relativePath: 'CLAUDE.md', fullPath: 'D:\\CODE\\CLAUDE.md' },
    };

    const { result } = renderHook(() =>
      useWorkspaceFileOps({
        workspace: 'D:\\CODE',
        eventPrefix: 'acp',
        messageApi: {
          success: vi.fn(),
          error: vi.fn(),
          warning: vi.fn(),
        },
        t: (key) => key,
        setSelected,
        selectedKeysRef,
        selectedNodeRef,
        ensureNodeSelected: vi.fn(),
        refreshWorkspace,
        renameModal: {
          visible: true,
          value: 'CLAUDE.md1',
          target,
        },
        deleteModal: { visible: false, target: null, loading: false },
        renameLoading: false,
        setRenameLoading: vi.fn(),
        closeRenameModal: vi.fn(),
        closeDeleteModal: vi.fn(),
        closeContextMenu: vi.fn(),
        setRenameModal: vi.fn(),
        setDeleteModal: vi.fn(),
        openPreview: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.handleRenameConfirm();
    });

    expect(renameWorkspaceEntry).toHaveBeenCalledWith('D:\\CODE\\CLAUDE.md', 'CLAUDE.md1', 'D:\\CODE');
    expect(refreshWorkspace).toHaveBeenCalledTimes(1);
    expect(setSelected).toHaveBeenCalledWith([]);
    expect(selectedKeysRef.current).toEqual([]);
    expect(selectedNodeRef.current).toBeNull();
  });
});
