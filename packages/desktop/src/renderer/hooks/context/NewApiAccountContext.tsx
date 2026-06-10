/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import type {
  ManagedRuntimeCliTarget,
  NewApiAccountStatus,
  NewApiManagedCliPrepStatus,
} from '@/common/types/newApiAccount';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { mutate as mutateSWR } from 'swr';
import { DETECTED_AGENTS_SWR_KEY } from '@/renderer/utils/model/agentTypes';
import { Message } from '@arco-design/web-react';

type LoginParams = {
  username: string;
  password: string;
};

type NewApiAccountContextValue = {
  ready: boolean;
  status: NewApiAccountStatus;
  isLoggedIn: boolean;
  prepStatus: NewApiManagedCliPrepStatus;
  login: (params: LoginParams) => Promise<{ success: boolean; msg?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  retryPrep: () => Promise<void>;
};

const DEFAULT_STATUS: NewApiAccountStatus = {
  loggedIn: false,
  baseUrl: 'https://api.mxou.cn',
  models: [],
  updatedAt: 0,
};

const NewApiAccountContext = createContext<NewApiAccountContextValue | undefined>(undefined);

const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.electronAPI);

function refreshProviderCaches(): void {
  void mutateSWR('providers');
  void mutateSWR('model.config');
  void mutateSWR('model.config.shared');
  void mutateSWR('model.config.welcome');
}

const AUTO_INSTALL_TARGETS: ManagedRuntimeCliTarget[] = ['hermes', 'openclaw', 'claude', 'codex', 'opencode'];

const DEFAULT_PREP_STATUS: NewApiManagedCliPrepStatus = {
  inProgress: false,
  completed: false,
  stage: 'idle',
  completedTargets: [],
  percent: 0,
};

function buildPrepStatus(input?: Partial<NewApiManagedCliPrepStatus>): NewApiManagedCliPrepStatus {
  return {
    ...DEFAULT_PREP_STATUS,
    ...input,
    completedTargets: input?.completedTargets ?? [],
  };
}

function getStagePercent(
  stage: NewApiManagedCliPrepStatus['stage'],
  completedTargets: ManagedRuntimeCliTarget[]
): number {
  switch (stage) {
    case 'preparing_environment':
      return 10;
    case 'installing_hermes':
      return completedTargets.includes('hermes') ? 55 : 35;
    case 'installing_openclaw':
      return completedTargets.includes('hermes') ? 75 : 60;
    case 'completed':
      return 100;
    case 'failed':
      return completedTargets.length > 0 ? 75 : 20;
    default:
      return 0;
  }
}

export const NewApiAccountProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [ready, setReady] = useState(!isDesktopRuntime);
  const [prepStatus, setPrepStatus] = useState<NewApiManagedCliPrepStatus>(DEFAULT_PREP_STATUS);
  const autoInstallInFlightRef = useRef(false);
  const { data, mutate } = useSWR(
    isDesktopRuntime ? 'newapi.desktop.account' : null,
    async () => {
      const result = await ipcBridge.newApiAccount.getStatus.invoke();
      if (!result.success || !result.data) {
        return DEFAULT_STATUS;
      }
      return result.data;
    },
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!isDesktopRuntime) return;
    if (data) {
      configService.setLocal('newApi.desktop.account', data);
      setReady(true);
    }
  }, [data]);

  const refresh = useCallback(async () => {
    if (!isDesktopRuntime) return;
    setReady(false);
    const result = await ipcBridge.newApiAccount.refreshStatus.invoke();
    if (result.success && result.data) {
      await mutate(result.data, false);
    }
    setReady(true);
  }, [mutate]);

  const runAutoInstall = useCallback(async () => {
    if (autoInstallInFlightRef.current) return;
    autoInstallInFlightRef.current = true;
    setPrepStatus(buildPrepStatus({ inProgress: true, stage: 'preparing_environment', percent: 10 }));
    const completedTargets: ManagedRuntimeCliTarget[] = [];
    try {
      for (const target of AUTO_INSTALL_TARGETS) {
        // Check if already installed (from bundle preinstall)
        if (isDesktopRuntime) {
          try {
            const alreadyInstalled = await ipcBridge.managedCliInstaller.isInstalled.invoke({ target });
            if (alreadyInstalled) {
              completedTargets.push(target);
              continue;
            }
          } catch {
            // IPC call failed (bridge may not be ready), fall through to install
          }
        }
        const stage = target === 'hermes' ? 'installing_hermes' : 'installing_openclaw';
        setPrepStatus(
          buildPrepStatus({
            inProgress: true,
            stage,
            currentTarget: target,
            completedTargets: [...completedTargets],
            percent: getStagePercent(stage, completedTargets),
          })
        );
        const result = await ipcBridge.managedCliInstaller.install.invoke({ target });
        if (!result.success) {
          throw new Error(result.message || `Failed to install ${target}`);
        }
        completedTargets.push(target);
      }
      setPrepStatus(
        buildPrepStatus({
          completed: true,
          stage: 'completed',
          percent: 100,
          completedTargets: [...completedTargets],
        })
      );
      // Refresh agent list so newly installed CLIs appear immediately
      void mutateSWR(DETECTED_AGENTS_SWR_KEY);
    } catch (error) {
      console.error('Auto install managed CLI failed:', error);
      setPrepStatus(
        buildPrepStatus({
          stage: 'failed',
          currentTarget:
            completedTargets.length < AUTO_INSTALL_TARGETS.length
              ? AUTO_INSTALL_TARGETS[completedTargets.length]
              : undefined,
          completedTargets: [...completedTargets],
          percent: getStagePercent('failed', completedTargets),
          error: error instanceof Error ? error.message : String(error),
        })
      );
      console.warn('Auto-install partially failed; will retry on next launch.');
    } finally {
      autoInstallInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime) return;
    if (!data?.loggedIn) return;
    void runAutoInstall();
  }, [data?.loggedIn, runAutoInstall]);

  const login = useCallback(
    async ({ username, password }: LoginParams) => {
      const result = await ipcBridge.newApiAccount.login.invoke({ username, password });
      if (result.success && result.data?.status) {
        await mutate(result.data.status, false);
        refreshProviderCaches();
        void runAutoInstall();
        setReady(true);
        return { success: true };
      }
      return { success: false, msg: result.msg };
    },
    [mutate, runAutoInstall]
  );

  const logout = useCallback(async () => {
    await ipcBridge.newApiAccount.logout.invoke();
    await mutate(DEFAULT_STATUS, false);
    refreshProviderCaches();
    setPrepStatus(DEFAULT_PREP_STATUS);
    setReady(true);
  }, [mutate]);

  const value = useMemo<NewApiAccountContextValue>(
    () => ({
      ready,
      status: data ?? DEFAULT_STATUS,
      isLoggedIn: Boolean(data?.loggedIn),
      prepStatus,
      login,
      logout,
      refresh,
      retryPrep: runAutoInstall,
    }),
    [data, login, logout, prepStatus, ready, refresh, runAutoInstall]
  );

  return <NewApiAccountContext.Provider value={value}>{children}</NewApiAccountContext.Provider>;
};

export function useNewApiAccount(): NewApiAccountContextValue {
  const context = useContext(NewApiAccountContext);
  if (!context) {
    throw new Error('useNewApiAccount must be used within a NewApiAccountProvider');
  }
  return context;
}
