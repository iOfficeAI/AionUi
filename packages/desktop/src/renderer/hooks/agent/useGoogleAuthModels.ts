/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { getClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';
import useSWR from 'swr';

export interface GoogleAuthModelResult {
  isGoogleAuth: boolean;
  subscriptionStatus?: {
    isSubscriber: boolean;
    tier?: string;
    lastChecked: number;
    message?: string;
  };
}

export const useGoogleAuthModels = (): GoogleAuthModelResult => {
  const { data: googleConfig } = useSWR('settings.client.google.config', () =>
    getClientBusinessSetting('google.config')
  );
  const proxyKey = googleConfig?.proxy || '';

  // Check whether Google Auth CLI is ready.
  // Opt back into focus revalidation (the global SWR default disables it): auth
  // completes in an external browser, so returning to this window is the signal
  // to re-check — there is no in-app mutate or WS event for it.
  const { data: isGoogleAuth } = useSWR(
    'google.auth.status' + proxyKey,
    async () => {
      const data = await ipcBridge.googleAuth.status.invoke({ proxy: googleConfig?.proxy });
      return data.success;
    },
    { revalidateOnFocus: true }
  );

  const shouldCheckSubscription = Boolean(isGoogleAuth);

  // Only hit subscription API when authenticated.
  // Opt back into focus revalidation: subscription state changes externally
  // (billing/upgrade in a browser), so a focus re-check keeps it current.
  const subscriptionKey = shouldCheckSubscription ? 'google.subscription.status' + proxyKey : null;
  const { data: subscriptionResponse } = useSWR(
    subscriptionKey,
    () => {
      return ipcBridge.google.subscriptionStatus.invoke({ proxy: googleConfig?.proxy });
    },
    { revalidateOnFocus: true }
  );

  return {
    isGoogleAuth: Boolean(isGoogleAuth),
    subscriptionStatus: subscriptionResponse ?? undefined,
  };
};
