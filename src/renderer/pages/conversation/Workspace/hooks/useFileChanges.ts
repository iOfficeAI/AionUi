/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FileChangeInfo, SnapshotInfo } from '@/common/types/fileSnapshot';
import { useCallback, useEffect, useRef, useState } from 'react';

type UseFileChangesParams = {
  workspace: string;
  conversationId: string;
};

type UseFileChangesReturn = {
  changes: FileChangeInfo[];
  changeCount: number;
  loading: boolean;
  snapshotInfo: SnapshotInfo | null;
  refreshChanges: () => Promise<void>;
};

export function useFileChanges({ workspace, conversationId }: UseFileChangesParams): UseFileChangesReturn {
  const [changes, setChanges] = useState<FileChangeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState<SnapshotInfo | null>(null);
  const initializedRef = useRef(false);

  // Initialize snapshot when workspace is set or conversation changes
  useEffect(() => {
    if (!workspace) return;

    initializedRef.current = false;
    setChanges([]);
    setSnapshotInfo(null);

    ipcBridge.fileSnapshot.init
      .invoke({ workspace })
      .then((info) => {
        setSnapshotInfo(info);
        initializedRef.current = true;
      })
      .catch((err) => {
        console.error('[useFileChanges] Failed to init snapshot:', err);
      });

    return () => {
      ipcBridge.fileSnapshot.dispose.invoke({ workspace }).catch(() => {});
    };
  }, [workspace, conversationId]);

  // Fetch changes on demand
  const refreshChanges = useCallback(async () => {
    if (!workspace || !initializedRef.current) return;
    setLoading(true);
    try {
      const result = await ipcBridge.fileSnapshot.compare.invoke({ workspace });
      setChanges(result);
    } catch (err) {
      console.error('[useFileChanges] Failed to compare:', err);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  return {
    changes,
    changeCount: changes.length,
    loading,
    snapshotInfo,
    refreshChanges,
  };
}
