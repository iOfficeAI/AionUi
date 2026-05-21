/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import type { NewApiAccountStatus } from '@/common/types/newApiAccount';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import useSWR, { mutate as mutateSWR } from 'swr';

type LoginParams = {
  username: string;
  password: string;
};

type NewApiAccountContextValue = {
  ready: boolean;
  status: NewApiAccountStatus;
  isLoggedIn: boolean;
  login: (params: LoginParams) => Promise<{ success: boolean; msg?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
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

export const NewApiAccountProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [ready, setReady] = useState(!isDesktopRuntime);
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
    await mutate();
    setReady(true);
  }, [mutate]);

  const login = useCallback(
    async ({ username, password }: LoginParams) => {
      const result = await ipcBridge.newApiAccount.login.invoke({ username, password });
      if (result.success && result.data?.status) {
        await mutate(result.data.status, false);
        refreshProviderCaches();
        setReady(true);
        return { success: true };
      }
      return { success: false, msg: result.msg };
    },
    [mutate]
  );

  const logout = useCallback(async () => {
    await ipcBridge.newApiAccount.logout.invoke();
    await mutate(DEFAULT_STATUS, false);
    refreshProviderCaches();
    setReady(true);
  }, [mutate]);

  const value = useMemo<NewApiAccountContextValue>(
    () => ({
      ready,
      status: data ?? DEFAULT_STATUS,
      isLoggedIn: Boolean(data?.loggedIn),
      login,
      logout,
      refresh,
    }),
    [data, login, logout, ready, refresh]
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
