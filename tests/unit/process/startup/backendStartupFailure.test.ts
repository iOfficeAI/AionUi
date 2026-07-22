/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { classifyBackendStartupFailure } from '@/process/startup/backendStartupFailure';

// T-L3a — transient concurrent-startup classification (Sentry 135525166).
// A brief two-instance bootstrap race over the same data directory is
// self-recoverable and must NOT be reported as local data corruption.
describe('classifyBackendStartupFailure — transient concurrent startup', () => {
  it('classifies the benign peer-yield boundary code as a transient concurrent startup', () => {
    const result = classifyBackendStartupFailure({
      details: {
        backendBoundaryCode: 'BOOTSTRAP_PEER_ALREADY_RUNNING',
        backendBoundaryStage: 'instance_guard.acquire',
        causeMessage: 'another aioncore already owns this data directory',
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result).toEqual({
      reason: 'backend_transient_concurrent_startup',
      backendBoundaryCode: 'BOOTSTRAP_PEER_ALREADY_RUNNING',
      backendBoundaryStage: 'instance_guard.acquire',
    });
  });

  it('classifies assistant bootstrap contention stage as a transient concurrent startup', () => {
    const result = classifyBackendStartupFailure({
      details: {
        backendBoundaryCode: 'BOOTSTRAP_SERVER_FAILED',
        backendBoundaryStage: 'router.assistant.bootstrap.concurrency_contended',
        causeMessage: 'assistant storage bootstrap contended under concurrent startup',
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result).toEqual({
      reason: 'backend_transient_concurrent_startup',
      backendBoundaryCode: 'BOOTSTRAP_SERVER_FAILED',
      backendBoundaryStage: 'router.assistant.bootstrap.concurrency_contended',
    });
  });

  // Regression guard: the old code unconditionally mapped
  // BOOTSTRAP_SERVER_FAILED + router.assistant.bootstrap to
  // backend_local_data_repair_failed. A plain (non-contended) bootstrap failure
  // must now fall through to the generic bucket, never the panic-inducing
  // "local data repair" copy.
  it('does not misclassify a plain assistant bootstrap failure as local data repair', () => {
    const result = classifyBackendStartupFailure({
      details: {
        backendBoundaryCode: 'BOOTSTRAP_SERVER_FAILED',
        backendBoundaryStage: 'router.assistant.bootstrap',
        causeMessage: 'failed to bootstrap assistant storage',
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result).toEqual({
      reason: 'backend_startup_failed',
      backendBoundaryCode: 'BOOTSTRAP_SERVER_FAILED',
      backendBoundaryStage: 'router.assistant.bootstrap',
    });
    expect(result.reason).not.toBe('backend_local_data_repair_failed');
  });
});

// C2 — genuine data corruption paths must keep their severe classification.
describe('classifyBackendStartupFailure — genuine data damage still severe', () => {
  it('still classifies the 4-signal agent metadata corruption as local data repair', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'early_exit',
        backendBoundaryCode: 'BOOTSTRAP_SERVICE_INIT_FAILED',
        backendBoundaryStage: 'services.init',
        stderrTail:
          'Failed to hydrate agent registry: Internal error: load agent_metadata: Database query failed: error occurred while decoding column "config_options": invalid utf-8 sequence of 1 bytes from index 793',
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result).toEqual({
      reason: 'backend_local_data_repair_failed',
      backendBoundaryCode: 'BOOTSTRAP_SERVICE_INIT_FAILED',
      backendBoundaryStage: 'services.init',
      localDataIssueKind: 'agent_metadata_invalid_utf8',
    });
  });

  it('still classifies recoverable database corruption separately', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'early_exit',
        backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
        backendBoundaryStage: 'database.recoverable_corruption',
        stderrTail:
          'BOOTSTRAP_DATA_INIT_FAILED stage=database.recoverable_corruption databasePath=/db/aionui-backend.db: failed to initialize application data',
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result).toEqual({
      reason: 'backend_recoverable_database_corruption',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
    });
  });
});
