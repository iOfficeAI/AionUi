/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DefaultModelIntent } from '@/common/config/storage';
import { setOpenClawManagedProviderModel } from '@process/agent/openclaw/openclawConfig';
import { resolveProcessProviderModelFromIntent } from './defaultModelIntent';
import { buildProviderSyncProfile, resolveOpenClawApiProtocol } from './providerSyncProfile';
import type { BackendModelSyncAdapter, BackendModelSyncResult } from './types';

export const openClawModelSyncAdapter: BackendModelSyncAdapter = {
  backend: 'openclaw-gateway',
  async supports(intent): Promise<boolean> {
    const providerModel = await resolveProcessProviderModelFromIntent(intent);
    return providerModel ? buildProviderSyncProfile(providerModel) !== null : false;
  },
  async sync(intent): Promise<BackendModelSyncResult> {
    const providerModel = await resolveProcessProviderModelFromIntent(intent);
    const profile = providerModel ? buildProviderSyncProfile(providerModel) : null;

    if (!providerModel || !profile) {
      return {
        backend: 'openclaw-gateway',
        supported: false,
        state: 'unsupported',
        reason: 'OpenClaw native sync requires a provider with baseUrl, apiKey, and a concrete model id',
      };
    }

    const modelRef = `${profile.managedProviderId}/${profile.normalizedModelId}`;
    const api = resolveOpenClawApiProtocol(profile);
    setOpenClawManagedProviderModel({
      providerId: profile.managedProviderId,
      baseUrl: profile.normalizedBaseUrl,
      apiKey: profile.provider.apiKey,
      api,
      modelId: profile.normalizedModelId,
      modelName: profile.normalizedModelId,
      authHeader: api === 'openai-completions',
    });

    return {
      backend: 'openclaw-gateway',
      supported: true,
      state: 'prepared',
      appliedModelId: modelRef,
    };
  },
};
