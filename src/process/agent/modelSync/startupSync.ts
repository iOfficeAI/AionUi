/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DefaultModelIntent, IConfigStorageRefer } from '@/common/config/storage';
import type { AgentBackend } from '@/common/types/acpTypes';
import { resolveProcessUnifiedIntentForMigration } from './defaultModelIntent';
import { modelSyncOrchestrator } from './ModelSyncOrchestrator';
import type { BackendModelSyncResult } from './types';

const DEFAULT_MODEL_INTENT_BACKFILL_KEY = 'migration.defaultModelIntentBackfilled';
const STARTUP_MODEL_SYNC_RESULTS_KEY = 'agent.startupModelSyncResults';

export const STARTUP_DEFAULT_MODEL_SYNC_BACKENDS = ['claude', 'openclaw-gateway', 'hermes', 'opencode'] as const satisfies readonly AgentBackend[];

type ConfigStore = {
  get<K extends keyof IConfigStorageRefer>(key: K): Promise<IConfigStorageRefer[K]>;
  set<K extends keyof IConfigStorageRefer>(key: K, value: IConfigStorageRefer[K]): Promise<IConfigStorageRefer[K]>;
};

type SyncBackends = (
  intent: DefaultModelIntent,
  backends: AgentBackend[]
) => Promise<BackendModelSyncResult[]>;

const EMPTY_SYNC_RESULTS: BackendModelSyncResult[] = [];

export type StartupModelSyncOutcome = {
  intent: DefaultModelIntent | null;
  backfilled: boolean;
  migrationMarked: boolean;
  syncResults: BackendModelSyncResult[];
  syncError?: string;
};

function isDefaultModelIntent(value: unknown): value is DefaultModelIntent {
  return typeof value === 'object' && value !== null && 'providerId' in value && 'modelId' in value;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readStoredIntent(configStore: ConfigStore): Promise<DefaultModelIntent | null> {
  const intent = await configStore.get('agent.defaultModelIntent').catch((): undefined => undefined);
  return isDefaultModelIntent(intent) ? intent : null;
}

export async function prepareDefaultModelSyncOnStartup(
  configStore: ConfigStore,
  syncBackends: SyncBackends = (intent, backends) => modelSyncOrchestrator.syncBackends(intent, backends)
): Promise<StartupModelSyncOutcome> {
  const migrationDone = await configStore.get(DEFAULT_MODEL_INTENT_BACKFILL_KEY).catch(() => false);

  let intent = await readStoredIntent(configStore);
  let backfilled = false;
  let migrationMarked = false;

  if (!migrationDone) {
    const resolvedIntent = await resolveProcessUnifiedIntentForMigration(configStore);
    if (!intent && resolvedIntent) {
      await configStore.set('agent.defaultModelIntent', resolvedIntent);
      intent = resolvedIntent;
      backfilled = true;
    }
    await configStore.set(DEFAULT_MODEL_INTENT_BACKFILL_KEY, true);
    migrationMarked = true;
  }

  if (!intent) {
    await configStore
      .set(
        STARTUP_MODEL_SYNC_RESULTS_KEY as keyof IConfigStorageRefer,
        EMPTY_SYNC_RESULTS as IConfigStorageRefer[keyof IConfigStorageRefer]
      )
      .catch((): BackendModelSyncResult[] => EMPTY_SYNC_RESULTS);
    return {
      intent: null,
      backfilled,
      migrationMarked,
      syncResults: [],
    };
  }

  try {
    const syncResults = await syncBackends(intent, [...STARTUP_DEFAULT_MODEL_SYNC_BACKENDS]);
    await configStore
      .set(
        STARTUP_MODEL_SYNC_RESULTS_KEY as keyof IConfigStorageRefer,
        syncResults as IConfigStorageRefer[keyof IConfigStorageRefer]
      )
      .catch((): BackendModelSyncResult[] => EMPTY_SYNC_RESULTS);
    return {
      intent,
      backfilled,
      migrationMarked,
      syncResults,
    };
  } catch (error) {
    await configStore
      .set(
        STARTUP_MODEL_SYNC_RESULTS_KEY as keyof IConfigStorageRefer,
        EMPTY_SYNC_RESULTS as IConfigStorageRefer[keyof IConfigStorageRefer]
      )
      .catch((): BackendModelSyncResult[] => EMPTY_SYNC_RESULTS);
    return {
      intent,
      backfilled,
      migrationMarked,
      syncResults: [],
      syncError: toErrorMessage(error),
    };
  }
}

export async function getStartupBackendSyncState(
  configStore: Pick<ConfigStore, 'get'>,
  backend: AgentBackend
): Promise<BackendModelSyncResult['state'] | null> {
  const results = await configStore
    .get(STARTUP_MODEL_SYNC_RESULTS_KEY as keyof IConfigStorageRefer)
    .catch((): undefined => undefined);
  if (!Array.isArray(results)) {
    return null;
  }
  const result = results.find(
    (item): item is BackendModelSyncResult =>
      typeof item === 'object' && item !== null && 'backend' in item && item.backend === backend
  );
  return result?.state ?? (result ? (result.supported ? 'prepared' : 'unsupported') : null);
}
