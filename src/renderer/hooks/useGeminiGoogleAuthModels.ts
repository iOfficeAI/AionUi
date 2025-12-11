/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { getGeminiModeList } from './useModeModeList';
import useSWR from 'swr';
import { useMemo } from 'react';

export interface GeminiGoogleAuthModelResult {
  geminiModeOptions: { label: string; value: string }[];
  isGoogleAuth: boolean;
  subscriptionStatus?: {
    isSubscriber: boolean;
    tier?: string;
    lastChecked: number;
    message?: string;
  };
}

export const useGeminiGoogleAuthModels = (): GeminiGoogleAuthModelResult => {
  const { data: geminiConfig } = useSWR('gemini.config', () => ConfigStorage.get('gemini.config'));
  const proxyKey = geminiConfig?.proxy || '';

  // 先通过 Google Auth 状态判断是否可用原生 Gemini。Check whether Google Auth CLI is ready.
  const { data: isGoogleAuth } = useSWR('google.auth.status' + proxyKey, async () => {
    const data = await ipcBridge.googleAuth.status.invoke({ proxy: geminiConfig?.proxy });
    return data.success;
  });

  const shouldCheckSubscription = Boolean(isGoogleAuth);

  // 仅在通过认证后才触发订阅状态查询。Only hit CLI subscription API when authenticated.
  const subscriptionKey = shouldCheckSubscription ? 'gemini.subscription.status' + proxyKey : null;
  const { data: subscriptionResponse } = useSWR(subscriptionKey, () => {
    return ipcBridge.gemini.subscriptionStatus.invoke({ proxy: geminiConfig?.proxy });
  });

  const includeProPreview = Boolean(subscriptionResponse?.data?.isSubscriber);
  // 订阅用户添加 gemini-3-pro-preview，非订阅保留默认列表。Subscribers see Pro Preview first.
  const geminiModeOptions = useMemo(() => getGeminiModeList({ includeProPreview }), [includeProPreview]);

  return {
    geminiModeOptions,
    isGoogleAuth: Boolean(isGoogleAuth),
    subscriptionStatus: subscriptionResponse?.data,
  };
};
