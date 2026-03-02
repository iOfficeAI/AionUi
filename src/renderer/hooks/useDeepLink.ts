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

/** Custom event name for deep-link add-provider action */
export const DEEP_LINK_ADD_PROVIDER_EVENT = 'aionui-deep-link-add-provider';

export type DeepLinkAddProviderDetail = {
  baseUrl?: string;
  apiKey?: string;
  name?: string;
  platform?: string;
};

/**
 * Hook to listen for aionui:// deep link events from main process.
 * Routes 'add-provider' action to the model settings page and dispatches
 * a CustomEvent for ModelModalContent to pick up.
 */
export const useDeepLink = () => {
  const navigate = useNavigate();

  const handler = useCallback(
    (payload: DeepLinkPayload) => {
      // Support both formats: "add-provider" and "provider/add" (one-api style)
      if (payload.action === 'add-provider' || payload.action === 'provider/add') {
        const detail: DeepLinkAddProviderDetail = {
          baseUrl: payload.params.baseUrl || payload.params.base_url,
          apiKey: payload.params.apiKey || payload.params.api_key || payload.params.key,
          name: payload.params.name,
          platform: payload.params.platform,
        };

        // Navigate to model settings page
        void navigate('/settings/model');

        // Dispatch event after a tick to allow the page to mount
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent(DEEP_LINK_ADD_PROVIDER_EVENT, { detail }));
        }, 300);
      }
    },
    [navigate]
  );

  useEffect(() => {
    return ipcBridge.deepLink.received.on(handler);
  }, [handler]);
};
