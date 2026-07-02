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
  const { data: isGoogleAuth } = useSWR('google.auth.status' + proxyKey, async () => {
    const data = await ipcBridge.googleAuth.status.invoke({ proxy: googleConfig?.proxy });
    return data.success;
  });

  const shouldCheckSubscription = Boolean(isGoogleAuth);

  // Only hit subscription API when authenticated.
  const subscriptionKey = shouldCheckSubscription ? 'google.subscription.status' + proxyKey : null;
  const { data: subscriptionResponse } = useSWR(subscriptionKey, () => {
    return ipcBridge.google.subscriptionStatus.invoke({ proxy: googleConfig?.proxy });
  });

  return {
    isGoogleAuth: Boolean(isGoogleAuth),
    subscriptionStatus: subscriptionResponse ?? undefined,
  };
};
