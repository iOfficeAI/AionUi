import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── IPC bridge mock ──────────────────────────────────────────────────────────

const initInvoke = vi.fn().mockResolvedValue({ mode: 'snapshot', branch: null });
const disposeInvoke = vi.fn().mockResolvedValue(undefined);
const compareInvoke = vi.fn().mockResolvedValue({ staged: [], unstaged: [] });
const getBranchesInvoke = vi.fn().mockResolvedValue([]);
const stageFileInvoke = vi.fn().mockResolvedValue(undefined);
const stageAllInvoke = vi.fn().mockResolvedValue(undefined);
const unstageFileInvoke = vi.fn().mockResolvedValue(undefined);
const unstageAllInvoke = vi.fn().mockResolvedValue(undefined);
const discardFileInvoke = vi.fn().mockResolvedValue(undefined);
const resetFileInvoke = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/common', () => ({
  ipcBridge: {
    fileSnapshot: {
      init: { invoke: (...args: unknown[]) => initInvoke(...args) },
      dispose: { invoke: (...args: unknown[]) => disposeInvoke(...args) },
      compare: { invoke: (...args: unknown[]) => compareInvoke(...args) },
      getBranches: { invoke: (...args: unknown[]) => getBranchesInvoke(...args) },
      stageFile: { invoke: (...args: unknown[]) => stageFileInvoke(...args) },
      stageAll: { invoke: (...args: unknown[]) => stageAllInvoke(...args) },
      unstageFile: { invoke: (...args: unknown[]) => unstageFileInvoke(...args) },
      unstageAll: { invoke: (...args: unknown[]) => unstageAllInvoke(...args) },
      discardFile: { invoke: (...args: unknown[]) => discardFileInvoke(...args) },
      resetFile: { invoke: (...args: unknown[]) => resetFileInvoke(...args) },
    },
  },
}));

import { useFileChanges } from '../../src/renderer/pages/conversation/Workspace/hooks/useFileChanges';

describe('useFileChanges (#2159)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls init once when workspace is provided', async () => {
    renderHook(() => useFileChanges({ workspace: '/path/to/workspace' }));

    // Wait for async init to be called
    await vi.waitFor(() => {
      expect(initInvoke).toHaveBeenCalledTimes(1);
    });
    expect(initInvoke).toHaveBeenCalledWith({ workspace: '/path/to/workspace' });
  });

  it('does not call init when workspace is empty', () => {
    renderHook(() => useFileChanges({ workspace: '' }));
    expect(initInvoke).not.toHaveBeenCalled();
  });

  it('does not re-init when re-rendered with same workspace', async () => {
    const { rerender } = renderHook(({ workspace }) => useFileChanges({ workspace }), {
      initialProps: { workspace: '/path/to/workspace' },
    });

    await vi.waitFor(() => {
      expect(initInvoke).toHaveBeenCalledTimes(1);
    });

    // Re-render with the same workspace — should NOT trigger a new init
    rerender({ workspace: '/path/to/workspace' });

    // Give time for any potential async calls
    await new Promise((r) => setTimeout(r, 50));
    expect(initInvoke).toHaveBeenCalledTimes(1);
  });

  it('re-inits when workspace changes', async () => {
    const { rerender } = renderHook(({ workspace }) => useFileChanges({ workspace }), {
      initialProps: { workspace: '/path/workspace-A' },
    });

    await vi.waitFor(() => {
      expect(initInvoke).toHaveBeenCalledTimes(1);
    });

    rerender({ workspace: '/path/workspace-B' });

    await vi.waitFor(() => {
      expect(initInvoke).toHaveBeenCalledTimes(2);
    });
    expect(initInvoke).toHaveBeenLastCalledWith({ workspace: '/path/workspace-B' });
  });

  it('calls dispose on unmount', async () => {
    const { unmount } = renderHook(() => useFileChanges({ workspace: '/path/to/workspace' }));

    await vi.waitFor(() => {
      expect(initInvoke).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(disposeInvoke).toHaveBeenCalledWith({ workspace: '/path/to/workspace' });
  });
});
