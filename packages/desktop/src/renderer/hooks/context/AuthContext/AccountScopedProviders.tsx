/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { type PropsWithChildren, useLayoutEffect } from 'react';
import { SWRConfig, useSWRConfig } from 'swr';
import { PreviewProvider } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import { bindAccountCacheMutator, clearDefaultSWRCache } from './accountSWR';
import { useAuth } from '.';

const createAccountCache = (): Map<string, unknown> => new Map();
const SWR_DEFAULTS = {
  provider: createAccountCache,
  revalidateOnFocus: false,
} as const;

const AccountCacheBinding: React.FC<PropsWithChildren> = ({ children }) => {
  const { mutate } = useSWRConfig();

  useLayoutEffect(() => {
    clearDefaultSWRCache();
    return bindAccountCacheMutator(mutate);
  }, [mutate]);

  return children;
};

/**
 * Own all in-memory state that must not survive an account transition.
 * Changing the key remounts both SWR's cache provider and PreviewProvider.
 */
export const AccountScopedProviders: React.FC<PropsWithChildren> = ({ children }) => {
  const { status, user } = useAuth();
  const accountScope = user?.id ?? (status === 'authenticated' ? 'desktop-local' : 'signed-out');

  return (
    <SWRConfig key={accountScope} value={SWR_DEFAULTS}>
      <AccountCacheBinding>
        <PreviewProvider>{children}</PreviewProvider>
      </AccountCacheBinding>
    </SWRConfig>
  );
};
