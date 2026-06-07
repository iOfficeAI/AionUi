/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  GitCommitResult,
  GitDiffResult,
  GitFileChange,
  GitInitResult,
  GitRepoInfo,
} from '@/common/types/git/gitTypes';
import { useCallback, useEffect, useState, useRef } from 'react';

/**
 * Hard ceiling on a single git IPC round-trip. If the main-process handler
 * never responds (e.g. a stale dev server without the git bridge, or a hung
 * git invocation), we reject instead of leaving the panel spinning forever.
 */
const GIT_IPC_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${ms}ms — the git IPC handler did not respond. Fully restart the dev server (main-process change) and check the terminal log.`
        )
      );
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

type UseGitChangesResult = {
  repoInfo: GitRepoInfo | null;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  conflicted: GitFileChange[];
  changeCount: number;
  loading: boolean;
  error: string | null;
  statusVersion: number;
  refresh: () => Promise<void>;
  initRepo: () => Promise<GitInitResult | undefined>;
  stageFile: (file_path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageFile: (file_path: string) => Promise<void>;
  unstageAll: () => Promise<void>;
  discardFile: (file_path: string) => Promise<void>;
  commit: (message: string) => Promise<GitCommitResult | undefined>;
  getDiff: (file_path: string, staged?: boolean) => Promise<GitDiffResult | undefined>;
};

export const useGitChanges = (workspace: string, enabled: boolean = true): UseGitChangesResult => {
  const [repoInfo, setRepoInfo] = useState<GitRepoInfo | null>(null);
  const [staged, setStaged] = useState<GitFileChange[]>([]);
  const [unstaged, setUnstaged] = useState<GitFileChange[]>([]);
  const [conflicted, setConflicted] = useState<GitFileChange[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusVersion, setStatusVersion] = useState<number>(0);

  const fetchIdRef = useRef(0);
  const mountedRef = useRef(true);
  const repoRootRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchStatus = useCallback(
    async (isInitial = false) => {
      if (!workspace || !enabled) {
        if (mountedRef.current) setLoading(false);
        return;
      }
      if (isInitial && mountedRef.current) setLoading(true);

      const fetchId = ++fetchIdRef.current;
      try {
        console.info('[useGitChanges] getRepoInfo →', workspace);
        const infoRes = await withTimeout(
          ipcBridge.git.getRepoInfo.invoke({ workspace }),
          GIT_IPC_TIMEOUT_MS,
          'git.getRepoInfo'
        );
        console.info('[useGitChanges] getRepoInfo ←', infoRes);
        if (!mountedRef.current || fetchId !== fetchIdRef.current) return;

        if (!infoRes.success) {
          setError(infoRes.msg ?? 'Failed to get repo info');
          setRepoInfo(null);
          repoRootRef.current = null;
          setStaged([]);
          setUnstaged([]);
          setConflicted([]);
          return;
        }

        setRepoInfo(infoRes.data ?? null);
        repoRootRef.current = infoRes.data?.root ?? null;

        if (infoRes.data?.isRepo) {
          const statusRes = await withTimeout(
            ipcBridge.git.getStatus.invoke({ workspace }),
            GIT_IPC_TIMEOUT_MS,
            'git.getStatus'
          );
          console.info('[useGitChanges] getStatus ←', statusRes);
          if (!mountedRef.current || fetchId !== fetchIdRef.current) return;

          if (statusRes.success && statusRes.data) {
            setStaged(statusRes.data.staged);
            setUnstaged(statusRes.data.unstaged);
            setConflicted(statusRes.data.conflicted);
            setStatusVersion((v) => v + 1);
            setError(null);
          } else {
            setError(statusRes.msg ?? 'Failed to get status');
          }
        } else {
          setStaged([]);
          setUnstaged([]);
          setConflicted([]);
          setStatusVersion((v) => v + 1);
        }
      } catch (e: any) {
        console.error('[useGitChanges] fetchStatus failed:', e);
        if (mountedRef.current && fetchId === fetchIdRef.current) {
          setError(e?.message || 'Unknown error');
        }
      } finally {
        // Clear loading whenever THIS is the latest fetch — regardless of
        // `isInitial`. A superseding background refresh must never be able to
        // pin the spinner on (the previous bug: the initial fetch's `finally`
        // was gated on `isInitial`, so a concurrent refresh left loading=true
        // forever).
        if (mountedRef.current && fetchId === fetchIdRef.current) setLoading(false);
      }
    },
    [workspace, enabled]
  );

  useEffect(() => {
    if (!workspace || !enabled) {
      setLoading(false);
      return;
    }
    void fetchStatus(true);
  }, [workspace, enabled, fetchStatus]);

  useEffect(() => {
    if (!workspace || !enabled) return;

    let debounceTimer: NodeJS.Timeout;

    const unsubscribe = ipcBridge.git.changed.on((e) => {
      const match = e.root ? e.root === repoRootRef.current : e.workspace === workspace;
      if (match) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void fetchStatus();
        }, 500);
      }
    });

    return () => {
      clearTimeout(debounceTimer);
      unsubscribe();
      // Unwatch on workspace change and unmount
      ipcBridge.git.unwatch.invoke({ workspace }).catch(() => {});
    };
  }, [workspace, enabled, fetchStatus]);

  const refresh = useCallback(async () => {
    await fetchStatus(true);
  }, [fetchStatus]);

  const handleAction = async <T>(promise: Promise<{ success: boolean; data?: T; msg?: string }>) => {
    try {
      const res = await promise;
      if (!mountedRef.current) return undefined;

      if (!res.success) {
        setError(res.msg ?? 'Operation failed');
        return undefined;
      }
      setError(null);
      void fetchStatus();
      return res.data;
    } catch (e: any) {
      if (mountedRef.current) {
        setError(e.message || 'Operation error');
      }
      return undefined;
    }
  };

  const initRepo = useCallback(() => {
    return handleAction(ipcBridge.git.init.invoke({ workspace }));
  }, [workspace, fetchStatus]);

  const stageFile = useCallback(
    (file_path: string) => {
      return handleAction(ipcBridge.git.stageFile.invoke({ workspace, file_path })).then(() => {});
    },
    [workspace, fetchStatus]
  );

  const stageAll = useCallback(() => {
    return handleAction(ipcBridge.git.stageAll.invoke({ workspace })).then(() => {});
  }, [workspace, fetchStatus]);

  const unstageFile = useCallback(
    (file_path: string) => {
      return handleAction(ipcBridge.git.unstageFile.invoke({ workspace, file_path })).then(() => {});
    },
    [workspace, fetchStatus]
  );

  const unstageAll = useCallback(() => {
    return handleAction(ipcBridge.git.unstageAll.invoke({ workspace })).then(() => {});
  }, [workspace, fetchStatus]);

  const discardFile = useCallback(
    (file_path: string) => {
      return handleAction(ipcBridge.git.discardFile.invoke({ workspace, file_path })).then(() => {});
    },
    [workspace, fetchStatus]
  );

  const commit = useCallback(
    (message: string) => {
      return handleAction(ipcBridge.git.commit.invoke({ workspace, message }));
    },
    [workspace, fetchStatus]
  );

  const getDiff = useCallback(
    async (file_path: string, isStaged?: boolean) => {
      try {
        const res = await ipcBridge.git.getDiff.invoke({ workspace, file_path, staged: isStaged });
        if (!mountedRef.current) return undefined;

        if (!res.success) {
          setError(res.msg ?? 'Failed to get diff');
          return undefined;
        }
        return res.data;
      } catch (e: any) {
        if (mountedRef.current) {
          setError(e.message || 'Failed to get diff');
        }
        return undefined;
      }
    },
    [workspace]
  );

  return {
    repoInfo,
    staged,
    unstaged,
    conflicted,
    changeCount: staged.length + unstaged.length + conflicted.length,
    loading,
    error,
    statusVersion,
    refresh,
    initRepo,
    stageFile,
    stageAll,
    unstageFile,
    unstageAll,
    discardFile,
    commit,
    getDiff,
  };
};
