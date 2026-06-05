/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { fromRemoteSessionDiff } from '@/common/adapter/remoteSessionDiffMapper';
import type { CompareResult } from '@/common/types/platform/fileSnapshot';
import { useCallback, useState } from 'react';

export type WorkspaceChangesSource = 'local' | 'remote';

type UseRemoteSessionChangesParams = {
  conversation_id: string;
  workspace: string;
};

type UseRemoteSessionChangesReturn = {
  source: WorkspaceChangesSource;
  staged: CompareResult['staged'];
  unstaged: CompareResult['unstaged'];
  changeCount: number;
  loading: boolean;
  refreshChanges: () => Promise<void>;
  activateRemote: () => Promise<void>;
  activateLocal: () => void;
};

export function useRemoteSessionChanges({
  conversation_id,
  workspace,
}: UseRemoteSessionChangesParams): UseRemoteSessionChangesReturn {
  const [source, setSource] = useState<WorkspaceChangesSource>('local');
  const [result, setResult] = useState<CompareResult>({ staged: [], unstaged: [] });
  const [loading, setLoading] = useState(false);

  const refreshRemote = useCallback(async () => {
    if (!conversation_id) return;
    setLoading(true);
    try {
      const raw = await ipcBridge.conversation.remoteSessionDiff.invoke({ conversation_id });
      const entries = Array.isArray(raw) ? raw : [];
      setResult(fromRemoteSessionDiff(entries, workspace));
    } catch (err) {
      console.error('[useRemoteSessionChanges] Failed to load remote diff:', err);
      setResult({ staged: [], unstaged: [] });
    } finally {
      setLoading(false);
    }
  }, [conversation_id, workspace]);

  const activateRemote = useCallback(async () => {
    setSource('remote');
    await refreshRemote();
  }, [refreshRemote]);

  const activateLocal = useCallback(() => {
    setSource('local');
    setResult({ staged: [], unstaged: [] });
  }, []);

  const refreshChanges = useCallback(async () => {
    if (source === 'remote') {
      await refreshRemote();
    }
  }, [source, refreshRemote]);

  return {
    source,
    staged: source === 'remote' ? result.staged : [],
    unstaged: source === 'remote' ? result.unstaged : [],
    changeCount: source === 'remote' ? result.staged.length + result.unstaged.length : 0,
    loading: source === 'remote' ? loading : false,
    refreshChanges,
    activateRemote,
    activateLocal,
  };
}
