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

// Sentry ELECTRON-31Z — a database written by a NEWER AionUi (downgrade) is
// intact and only needs an app update. It must surface the dedicated
// upgrade-required reason instead of the misleading migration-failure dialog.
describe('classifyBackendStartupFailure — database newer than app (downgrade)', () => {
  it('classifies database.newer_than_app as the dedicated downgrade reason', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'early_exit',
        backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
        backendBoundaryStage: 'database.newer_than_app',
        stderrTail:
          'BOOTSTRAP_DATA_INIT_FAILED stage=database.newer_than_app databasePath=/db/aionui-backend.db dbMigrationVersion=39 appMigrationVersion=37: failed to initialize application data',
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result).toEqual({
      reason: 'backend_database_newer_than_app',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.newer_than_app',
    });
  });

  it('keeps generic migration failures in the data-migration bucket', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'early_exit',
        backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
        backendBoundaryStage: 'database.migration',
        stderrTail:
          'BOOTSTRAP_DATA_INIT_FAILED stage=database.migration databasePath=/db/aionui-backend.db: failed to initialize application data',
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result).toEqual({
      reason: 'backend_data_migration_failed',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.migration',
    });
  });

  it('does not classify the downgrade stage under other boundary codes', () => {
    const result = classifyBackendStartupFailure({
      details: {
        backendBoundaryCode: 'BOOTSTRAP_SERVICE_INIT_FAILED',
        backendBoundaryStage: 'database.newer_than_app',
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result.reason).not.toBe('backend_database_newer_than_app');
  });
});

// Sentry 127971136 — a health-check timeout on a process that was observed
// listening and kept alive is a recoverable "slow startup", and a listening
// process that then exits is an honest failure. Neither may fall back to the
// generic bucket that renders the misleading "incomplete installation / reinstall"
// copy.
describe('classifyBackendStartupFailure — slow startup / exited', () => {
  it('AC-1: classifies a listening, kept-alive health_timeout as backend_startup_pending_slow', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'health_timeout',
        serverListeningObserved: true,
        healthTimeoutKeptAlive: true,
      },
      message: 'aioncore failed to start within timeout',
      name: 'BackendStartupError',
    });

    expect(result.reason).toBe('backend_startup_pending_slow');
    expect(result.reason).not.toBe('backend_startup_failed');
    expect(result.reason).not.toBe('backend_incomplete_installation');
  });

  it('AC-2: classifies a listening process that exits within the health window as backend_startup_exited', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'early_exit',
        serverListeningObserved: true,
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result.reason).toBe('backend_startup_exited');
    expect(result.reason).not.toBe('backend_startup_failed');
    expect(result.reason).not.toBe('backend_incomplete_installation');
  });

  it('AC-2: classifies a listening process that exits after the pending timeout as backend_startup_exited', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'early_exit',
        serverListeningObserved: true,
      },
      message: 'aioncore exited after startup health timeout',
      name: 'BackendStartupError',
    });

    expect(result.reason).toBe('backend_startup_exited');
    expect(result.reason).not.toBe('backend_startup_failed');
    expect(result.reason).not.toBe('backend_incomplete_installation');
  });

  it('AC-2b: an early_exit never observed listening does not become backend_startup_exited', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'early_exit',
        serverListeningObserved: false,
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result.reason).not.toBe('backend_startup_exited');
    expect(result.reason).not.toBe('backend_startup_pending_slow');
    expect(result.reason).toBe('backend_startup_failed');
  });

  it('AC-2b: a health_timeout without the kept-alive marker (e.g. killed) does not become pending-slow', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'health_timeout',
        serverListeningObserved: true,
        // healthTimeoutKeptAlive absent: the process was killed, not kept pending.
      },
      message: 'aioncore failed to start within timeout',
      name: 'BackendStartupError',
    });

    expect(result.reason).not.toBe('backend_startup_pending_slow');
    expect(result.reason).toBe('backend_startup_failed');
  });

  it('AC-3: a genuine missing bundled backend on a packaged app still classifies as incomplete installation', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'resolve_binary',
        isPackaged: true,
        resourcesDirEntries: ['app.asar', 'app.asar.unpacked/', 'hub/', 'pet-states/', 'pwa/'],
      },
      message: 'aioncore startup failed while resolving backend binary',
      name: 'BackendStartupError',
    });

    expect(result.reason).toBe('backend_incomplete_installation');
  });

  it('regression: a listening, kept-alive health_timeout must not fall back to backend_startup_failed', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'health_timeout',
        serverListeningObserved: true,
        healthTimeoutKeptAlive: true,
      },
      message: 'aioncore failed to start within timeout',
      name: 'BackendStartupError',
    });

    expect(result.reason).not.toBe('backend_startup_failed');
    expect(result.reason).not.toBe('backend_incomplete_installation');
  });
});

// Sentry 136646113 — stage 'listen_timeout' (spawned but never reported its
// listening port) must get its own honest reason instead of falling through to
// the generic bucket, which used to render the "incomplete installation /
// reinstall / antivirus" dialog for a pure startup timeout.
describe('classifyBackendStartupFailure — port report timeout (listen_timeout)', () => {
  it('classifies listen_timeout as backend_startup_port_report_timeout', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'listen_timeout',
        serverListeningObserved: false,
      },
      message: 'aioncore did not report its listening port before timeout',
      name: 'BackendStartupError',
    });

    expect(result).toEqual({ reason: 'backend_startup_port_report_timeout' });
  });

  it('classifies listen_timeout with a backend boundary code as backend_startup_port_report_timeout', () => {
    const result = classifyBackendStartupFailure({
      details: {
        stage: 'listen_timeout',
        serverListeningObserved: false,
        backendBoundaryCode: 'SOME_BOUNDARY_CODE',
        backendBoundaryStage: 'some.stage',
      },
      message: 'aioncore did not report its listening port before timeout',
      name: 'BackendStartupError',
    });

    expect(result.reason).toBe('backend_startup_port_report_timeout');
  });

  it('keeps an unknown future stage in the generic backend_startup_failed bucket', () => {
    const result = classifyBackendStartupFailure({
      details: { stage: 'some_future_stage' },
      message: 'aioncore failed in a new way',
      name: 'BackendStartupError',
    });

    expect(result.reason).toBe('backend_startup_failed');
  });
});
