/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DefaultModelIntent, IProvider, TProviderWithModel } from '@/common/config/storage';

export function isDefaultModelIntent(value: unknown): value is DefaultModelIntent {
  return typeof value === 'object' && value !== null && 'providerId' in value && 'modelId' in value;
}

export function resolveModelFromIntent(
  modelList: IProvider[],
  intent: DefaultModelIntent
): { provider: IProvider; useModel: string } | null {
  const provider = modelList.find((item) => item.id === intent.providerId && item.model.includes(intent.modelId));
  if (!provider) return null;

  return {
    provider,
    useModel: intent.modelId,
  };
}

export function toDefaultModelIntent(modelInfo: TProviderWithModel): DefaultModelIntent {
  return {
    providerId: modelInfo.id,
    modelId: modelInfo.useModel,
    providerPlatform: modelInfo.platform,
    providerName: modelInfo.name,
    source: 'guid',
    updatedAt: Date.now(),
  };
}
