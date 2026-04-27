/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { getGeminiModeList, type GeminiModeOption } from './useModeModeList';

export interface GoogleAuthModelResult {
  modeOptions: GeminiModeOption[];
  isGoogleAuth: boolean;
  subscriptionStatus?: {
    isSubscriber: boolean;
    tier?: string;
    lastChecked: number;
    message?: string;
  };
}

export const useGoogleAuthModels = (): GoogleAuthModelResult => {
  const { t } = useTranslation();
  const { data: googleConfig } = useSWR('google.config', () => configService.get('google.config'));
  const proxyKey = googleConfig?.proxy || '';

  // 先通过 Google Auth 状态判断是否可用原生 Gemini。Check whether Google Auth CLI is ready.
  const { data: isGoogleAuth } = useSWR('google.auth.status' + proxyKey, async () => {
    const data = await ipcBridge.googleAuth.status.invoke({ proxy: googleConfig?.proxy });
    return data.success;
  });

  const shouldCheckSubscription = Boolean(isGoogleAuth);

  // 仅在通过认证后才触发订阅状态查询。Only hit subscription API when authenticated.
  const subscriptionKey = shouldCheckSubscription ? 'google.subscription.status' + proxyKey : null;
  const { data: subscriptionResponse } = useSWR(subscriptionKey, () => {
    return ipcBridge.google.subscriptionStatus.invoke({ proxy: googleConfig?.proxy });
  });

  // 生成与终端 CLI 一致的模型列表 / Generate model list matching terminal CLI
  const descriptions = useMemo(
    () => ({
      autoGemini3: t(
        'google:mode.autoGemini3Desc',
        'Let Gemini CLI decide the best model for the task: gemini-3.1-pro-preview, gemini-3-flash'
      ),
      autoGemini25: t(
        'google:mode.autoGemini25Desc',
        'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash'
      ),
      manual: t('google:mode.manualDesc', 'Manually select a model'),
    }),
    [t]
  );
  const modeOptions = useMemo(() => getGeminiModeList({ descriptions }), [descriptions]);

  return {
    modeOptions,
    isGoogleAuth: Boolean(isGoogleAuth),
    subscriptionStatus: subscriptionResponse ?? undefined,
  };
};
