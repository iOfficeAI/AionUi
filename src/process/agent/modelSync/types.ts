/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DefaultModelIntent, TProviderWithModel } from '@/common/config/storage';
import type { AgentBackend } from '@/common/types/acpTypes';

export type BackendModelPreference = {
  backend: AgentBackend;
  currentModelId?: string;
  providerModel?: TProviderWithModel;
  source: 'default-model-intent' | 'legacy-backend-config' | 'fallback';
};

export type BackendModelSyncResult = {
  backend: AgentBackend;
  supported: boolean;
  state?: 'prepared' | 'degraded' | 'unsupported';
  reason?: string;
  appliedModelId?: string;
};

export type BackendModelSyncAdapter = {
  backend: AgentBackend;
  supports(intent: DefaultModelIntent): Promise<boolean> | boolean;
  sync(intent: DefaultModelIntent): Promise<BackendModelSyncResult>;
};
