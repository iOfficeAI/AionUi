/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Verifies the Workspace Changes remote diff source adapter:
 *   - local mode is the default and exposes no remote changes;
 *   - activating the remote source maps `conversation.remoteSessionDiff`
 *     entries into the Workspace Changes (FileChangeInfo) shape, carrying the
 *     server-provided patch text through without any local baseline/current
 *     content fetch;
 *   - switching back to local clears the remote result.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRemoteSessionChanges } from '@/renderer/pages/conversation/Workspace/hooks/useRemoteSessionChanges';

const remoteSessionDiffInvoke = vi.fn();
const getBaselineContentInvoke = vi.fn();
const readFileInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      remoteSessionDiff: {
        invoke: (...args: unknown[]) => remoteSessionDiffInvoke(...args),
      },
    },
    fileSnapshot: {
      getBaselineContent: {
        invoke: (...args: unknown[]) => getBaselineContentInvoke(...args),
      },
    },
    fs: {
      readFile: {
        invoke: (...args: unknown[]) => readFileInvoke(...args),
      },
    },
  },
}));

describe('useRemoteSessionChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to local source with no remote changes', () => {
    const { result } = renderHook(() => useRemoteSessionChanges({ conversation_id: 'conv-1', workspace: '/ws' }));

    expect(result.current.source).toBe('local');
    expect(result.current.staged).toEqual([]);
    expect(result.current.unstaged).toEqual([]);
    expect(result.current.changeCount).toBe(0);
    expect(remoteSessionDiffInvoke).not.toHaveBeenCalled();
  });

  it('maps remote diff entries into the Workspace Changes shape with server patch text', async () => {
    remoteSessionDiffInvoke.mockResolvedValue([
      {
        path: 'src/a.ts',
        status: 'modified',
        additions: 2,
        deletions: 1,
        diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new',
      },
    ]);

    const { result } = renderHook(() => useRemoteSessionChanges({ conversation_id: 'conv-1', workspace: '/ws' }));

    await act(async () => {
      await result.current.activateRemote();
    });

    await waitFor(() => {
      expect(result.current.source).toBe('remote');
      expect(result.current.unstaged).toHaveLength(1);
    });

    expect(remoteSessionDiffInvoke).toHaveBeenCalledWith({ conversation_id: 'conv-1' });
    expect(result.current.staged).toEqual([]);
    expect(result.current.unstaged[0]).toEqual({
      file_path: '/ws/src/a.ts',
      relativePath: 'src/a.ts',
      operation: 'modify',
      patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new',
      additions: 2,
      deletions: 1,
    });
    expect(result.current.changeCount).toBe(1);

    // Server patches must NOT trigger local baseline/current content reads.
    expect(getBaselineContentInvoke).not.toHaveBeenCalled();
    expect(readFileInvoke).not.toHaveBeenCalled();
  });

  it('clears remote result when switching back to local', async () => {
    remoteSessionDiffInvoke.mockResolvedValue([{ path: 'x.ts', status: 'added', additions: 1, deletions: 0 }]);

    const { result } = renderHook(() => useRemoteSessionChanges({ conversation_id: 'conv-1', workspace: '/ws' }));

    await act(async () => {
      await result.current.activateRemote();
    });
    await waitFor(() => expect(result.current.unstaged).toHaveLength(1));

    act(() => {
      result.current.activateLocal();
    });

    expect(result.current.source).toBe('local');
    expect(result.current.unstaged).toEqual([]);
    expect(result.current.changeCount).toBe(0);
  });

  it('surfaces an empty result when the remote diff call fails', async () => {
    remoteSessionDiffInvoke.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useRemoteSessionChanges({ conversation_id: 'conv-1', workspace: '/ws' }));

    await act(async () => {
      await result.current.activateRemote();
    });

    expect(result.current.source).toBe('remote');
    expect(result.current.unstaged).toEqual([]);
    expect(result.current.changeCount).toBe(0);
  });
});
