/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { getGeminiModeList, type GeminiModeOption } from './useModeModeList';
import useSWR from 'swr';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface GeminiGoogleAuthModelResult {
  geminiModeOptions: GeminiModeOption[];
  isGoogleAuth: boolean;
  subscriptionStatus?: {
    isSubscriber: boolean;
    tier?: string;
    lastChecked: number;
    message?: string;
  };
}

export const useGeminiGoogleAuthModels = (): GeminiGoogleAuthModelResult => {
  const { t } = useTranslation();
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

  // 生成与终端 CLI 一致的模型列表 / Generate model list matching terminal CLI
  const descriptions = useMemo(
    () => ({
      autoGemini3: t('gemini.mode.autoGemini3Desc', 'Let Gemini CLI decide the best model for the task: gemini-3-pro, gemini-3-flash'),
      autoGemini25: t('gemini.mode.autoGemini25Desc', 'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash'),
      manual: t('gemini.mode.manualDesc', 'Manually select a model'),
    }),
    [t]
  );
  const geminiModeOptions = useMemo(() => getGeminiModeList({ descriptions }), [descriptions]);

  return {
    geminiModeOptions,
    isGoogleAuth: Boolean(isGoogleAuth),
    subscriptionStatus: subscriptionResponse?.data,
  };
};
