/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';

/**
 * Deep link event payload from main process
 */
export type DeepLinkPayload = {
  action: string;
  params: Record<string, string>;
};

export type DeepLinkAddProviderDetail = {
  baseUrl?: string;
  apiKey?: string;
  name?: string;
  platform?: string;
};

/** Pending deep link data for the add-provider action. Read-once: consumed by ModelModalContent on mount. */
let pendingDeepLinkData: DeepLinkAddProviderDetail | null = null;

/**
 * Consume (read and clear) pending deep link data.
 * Returns the data if present, or null. Subsequent calls return null until new data arrives.
 */
export const consumePendingDeepLink = (): DeepLinkAddProviderDetail | null => {
  const data = pendingDeepLinkData;
  pendingDeepLinkData = null;
  return data;
};

/**
 * Hook to listen for aionui:// deep link events from main process.
 * Routes 'add-provider' action to the model settings page.
 * The pre-fill data is stored in a module-level variable and consumed
 * by ModelModalContent on mount via consumePendingDeepLink().
 */
export const useDeepLink = () => {
  const navigate = useNavigate();

  const handler = useCallback(
    (payload: DeepLinkPayload) => {
      // Support both formats: "add-provider" and "provider/add" (one-api style)
      if (payload.action === 'add-provider' || payload.action === 'provider/add') {
        pendingDeepLinkData = {
          baseUrl: payload.params.baseUrl || payload.params.base_url,
          apiKey: payload.params.apiKey || payload.params.api_key || payload.params.key,
          name: payload.params.name,
          platform: payload.params.platform,
        };

        // Navigate to model settings page; ModelModalContent will pick up the pending data
        void navigate('/settings/model');
      }
    },
    [navigate]
  );

  useEffect(() => {
    return ipcBridge.deepLink.received.on(handler);
  }, [handler]);
};
