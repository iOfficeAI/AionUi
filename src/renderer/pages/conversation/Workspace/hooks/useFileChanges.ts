/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CompareResult, FileChangeInfo, SnapshotInfo } from '@/common/types/fileSnapshot';
import { useCallback, useEffect, useRef, useState } from 'react';

type UseFileChangesParams = {
  workspace: string;
  conversationId: string;
};

type UseFileChangesReturn = {
  staged: FileChangeInfo[];
  unstaged: FileChangeInfo[];
  changeCount: number;
  loading: boolean;
  snapshotInfo: SnapshotInfo | null;
  branches: string[];
  refreshChanges: () => Promise<void>;
  stageFile: (filePath: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageFile: (filePath: string) => Promise<void>;
  unstageAll: () => Promise<void>;
  discardFile: (filePath: string, operation: FileChangeInfo['operation']) => Promise<void>;
  resetFile: (filePath: string, operation: FileChangeInfo['operation']) => Promise<void>;
};

export function useFileChanges({ workspace, conversationId }: UseFileChangesParams): UseFileChangesReturn {
  const [result, setResult] = useState<CompareResult>({ staged: [], unstaged: [] });
  const [loading, setLoading] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState<SnapshotInfo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!workspace) return;

    initializedRef.current = false;
    setResult({ staged: [], unstaged: [] });
    setSnapshotInfo(null);
    setBranches([]);

    ipcBridge.fileSnapshot.init
      .invoke({ workspace })
      .then((info) => {
        setSnapshotInfo(info);
        initializedRef.current = true;
        if (info.mode === 'git-repo') {
          ipcBridge.fileSnapshot.getBranches
            .invoke({ workspace })
            .then(setBranches)
            .catch(() => {});
        }
      })
      .catch((err) => {
        console.error('[useFileChanges] Failed to init snapshot:', err);
      });

    return () => {
      ipcBridge.fileSnapshot.dispose.invoke({ workspace }).catch(() => {});
    };
  }, [workspace, conversationId]);

  // Silent refresh: update data without showing loading spinner (used after git operations)
  const silentRefresh = useCallback(async () => {
    if (!workspace || !initializedRef.current) return;
    try {
      const res = await ipcBridge.fileSnapshot.compare.invoke({ workspace });
      setResult(res);
    } catch (err) {
      console.error('[useFileChanges] Failed to compare:', err);
    }
  }, [workspace]);

  // Full refresh with loading indicator (used for manual refresh button)
  const refreshChanges = useCallback(async () => {
    if (!workspace || !initializedRef.current) return;
    setLoading(true);
    try {
      const res = await ipcBridge.fileSnapshot.compare.invoke({ workspace });
      setResult(res);
    } catch (err) {
      console.error('[useFileChanges] Failed to compare:', err);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  const stageFile = useCallback(
    async (filePath: string) => {
      if (!workspace) return;
      await ipcBridge.fileSnapshot.stageFile.invoke({ workspace, filePath });
      await silentRefresh();
    },
    [workspace, silentRefresh]
  );

  const stageAll = useCallback(async () => {
    if (!workspace) return;
    await ipcBridge.fileSnapshot.stageAll.invoke({ workspace });
    await silentRefresh();
  }, [workspace, silentRefresh]);

  const unstageFile = useCallback(
    async (filePath: string) => {
      if (!workspace) return;
      await ipcBridge.fileSnapshot.unstageFile.invoke({ workspace, filePath });
      await silentRefresh();
    },
    [workspace, silentRefresh]
  );

  const unstageAll = useCallback(async () => {
    if (!workspace) return;
    await ipcBridge.fileSnapshot.unstageAll.invoke({ workspace });
    await silentRefresh();
  }, [workspace, silentRefresh]);

  const discardFile = useCallback(
    async (filePath: string, operation: FileChangeInfo['operation']) => {
      if (!workspace) return;
      await ipcBridge.fileSnapshot.discardFile.invoke({ workspace, filePath, operation });
      await silentRefresh();
    },
    [workspace, silentRefresh]
  );

  const resetFile = useCallback(
    async (filePath: string, operation: FileChangeInfo['operation']) => {
      if (!workspace) return;
      await ipcBridge.fileSnapshot.resetFile.invoke({ workspace, filePath, operation });
      await silentRefresh();
    },
    [workspace, silentRefresh]
  );

  return {
    staged: result.staged,
    unstaged: result.unstaged,
    changeCount: result.staged.length + result.unstaged.length,
    loading,
    snapshotInfo,
    branches,
    refreshChanges,
    stageFile,
    stageAll,
    unstageFile,
    unstageAll,
    discardFile,
    resetFile,
  };
}
