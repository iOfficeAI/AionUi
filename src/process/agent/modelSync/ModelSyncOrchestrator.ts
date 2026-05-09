/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DefaultModelIntent } from '@/common/config/storage';
import type { AgentBackend } from '@/common/types/acpTypes';
import { getDefaultModelIntent, resolveBackendModelPreference } from './defaultModelIntent';
import { claudeModelSyncAdapter } from './claudeModelSync';
import { hermesModelSyncAdapter } from './hermesModelSync';
import { openClawModelSyncAdapter } from './openclawModelSync';
import { opencodeModelSyncAdapter } from './opencodeModelSync';
import type { BackendModelSyncAdapter, BackendModelSyncResult } from './types';

const DEFAULT_MODEL_SYNC_ADAPTERS: BackendModelSyncAdapter[] = [
  openClawModelSyncAdapter,
  claudeModelSyncAdapter,
  hermesModelSyncAdapter,
  opencodeModelSyncAdapter,
];

export class ModelSyncOrchestrator {
  constructor(private readonly adapters: BackendModelSyncAdapter[] = DEFAULT_MODEL_SYNC_ADAPTERS) {}

  async getIntent(): Promise<DefaultModelIntent | null> {
    return getDefaultModelIntent();
  }

  async resolvePreference(backend: AgentBackend) {
    return resolveBackendModelPreference(backend);
  }

  async syncBackends(intent: DefaultModelIntent, backends: AgentBackend[]): Promise<BackendModelSyncResult[]> {
    const adapterMap = new Map(this.adapters.map((adapter) => [adapter.backend, adapter]));
    const results: BackendModelSyncResult[] = [];

    for (const backend of backends) {
      const adapter = adapterMap.get(backend);
      if (!adapter) {
        results.push({
          backend,
          supported: false,
          state: 'unsupported',
          reason: 'No sync adapter registered',
        });
        continue;
      }

      const supported = await adapter.supports(intent);
      if (!supported) {
        results.push({
          backend,
          supported: false,
          state: 'unsupported',
          reason: 'Backend adapter rejected this model intent',
        });
        continue;
      }

      try {
        results.push(await adapter.sync(intent));
      } catch (error) {
        results.push({
          backend,
          supported: false,
          state: 'degraded',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}

export const modelSyncOrchestrator = new ModelSyncOrchestrator();
