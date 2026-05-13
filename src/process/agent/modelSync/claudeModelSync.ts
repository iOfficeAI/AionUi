/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DefaultModelIntent } from '@/common/config/storage';
import { writeClaudeSettingsForProviderSync } from '@process/services/ccSwitchModelSource';
import { resolveProcessProviderModelFromIntent } from './defaultModelIntent';
import { buildProviderSyncProfile, isClaudeSyncSupportedProfile } from './providerSyncProfile';
import type { BackendModelSyncAdapter, BackendModelSyncResult } from './types';

export const claudeModelSyncAdapter: BackendModelSyncAdapter = {
  backend: 'claude',
  async supports(intent: DefaultModelIntent): Promise<boolean> {
    const provider = await resolveProcessProviderModelFromIntent(intent);
    const profile = provider ? buildProviderSyncProfile(provider) : null;
    return !!profile && isClaudeSyncSupportedProfile(profile);
  },
  async sync(intent: DefaultModelIntent): Promise<BackendModelSyncResult> {
    const provider = await resolveProcessProviderModelFromIntent(intent);
    const profile = provider ? buildProviderSyncProfile(provider) : null;

    if (!provider || !profile || !isClaudeSyncSupportedProfile(profile)) {
      return {
        backend: 'claude',
        supported: false,
        state: 'unsupported',
        reason: 'Claude native sync requires a provider with baseUrl, apiKey, and a concrete model id',
      };
    }

    writeClaudeSettingsForProviderSync(provider, profile);

    return {
      backend: 'claude',
      supported: true,
      state: 'prepared',
      appliedModelId: `default:${profile.normalizedModelId}`,
    };
  },
};
