/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the pure helpers exported from `packages/desktop/src/sentry.ts`:
 * `selectRecentLogFiles`, `packAndCap`. Electron and Sentry are mocked so this
 * suite runs under the `node` Vitest project.
 */

import { describe, it, expect, vi } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test', getPath: () => '/tmp', isPackaged: false },
}));

let sentryInitOptions: { beforeSend?: (event: unknown) => unknown } | undefined;
const scopeSetContext = vi.fn();
const scopeSetExtra = vi.fn();
const scopeSetTag = vi.fn();

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn((options: { beforeSend?: (event: unknown) => unknown }) => {
    sentryInitOptions = options;
  }),
  setTag: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn((callback: (scope: unknown) => void) => {
    callback({
      setTag: scopeSetTag,
      setExtra: scopeSetExtra,
      setContext: scopeSetContext,
    });
  }),
  captureException: vi.fn(),
  captureEvent: vi.fn(),
  flush: vi.fn(async () => true),
}));

vi.mock('@/process/utils/analyticsId', () => ({
  getOrCreateAnalyticsId: () => 'test-device-id',
}));

const autoUpdateDiagnosticsMock = vi.hoisted(() => ({
  readAutoUpdateDiagnostics: vi.fn(),
}));

vi.mock('@/process/services/autoUpdateDiagnostics', () => ({
  readAutoUpdateDiagnostics: autoUpdateDiagnosticsMock.readAutoUpdateDiagnostics,
}));

import * as Sentry from '@sentry/electron/main';
import { listLogFilesSync, selectRecentLogFiles, packAndCap, captureBackendStartupFailure, initSentry } from '@/sentry';

describe('selectRecentLogFiles', () => {
  it('returns every file from the N most recent non-empty days', () => {
    const files = [
      { path: '/a/2026-05-22.log', mtime: Date.UTC(2026, 4, 22, 10), size: 100 },
      { path: '/a/2026-05-22.aioncore.log', mtime: Date.UTC(2026, 4, 22, 11), size: 200 },
      { path: '/a/2026-05-21.log', mtime: Date.UTC(2026, 4, 21, 10), size: 50 },
      { path: '/a/2026-05-20.log', mtime: Date.UTC(2026, 4, 20, 10), size: 0 },
      { path: '/a/2026-05-19.log', mtime: Date.UTC(2026, 4, 19, 10), size: 80 },
    ];
    const picked = selectRecentLogFiles(files, 2);
    const days = new Set(picked.map((f) => /\d{4}-\d{2}-\d{2}/.exec(f.path)![0]));
    expect(days).toEqual(new Set(['2026-05-22', '2026-05-21']));
    expect(picked).toHaveLength(3);
  });

  it('skips empty files', () => {
    const files = [{ path: '/a/x.log', mtime: 1, size: 0 }];
    expect(selectRecentLogFiles(files, 7)).toEqual([]);
  });

  it('returns fewer days when the input has fewer than N distinct days', () => {
    const files = [
      { path: '/a/2026-05-22.log', mtime: Date.UTC(2026, 4, 22, 10), size: 1 },
      { path: '/a/2026-05-22b.log', mtime: Date.UTC(2026, 4, 22, 11), size: 1 },
    ];
    const picked = selectRecentLogFiles(files, 7);
    expect(picked).toHaveLength(2);
  });
});

describe('listLogFilesSync', () => {
  it('finds log files under dated year/month/day directories', () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-sentry-logs-'));
    try {
      const datedDir = path.join(logsDir, '2026', '07', '02');
      mkdirSync(datedDir, { recursive: true });
      writeFileSync(path.join(datedDir, '2026-07-02.aioncore.log'), 'backend\n');
      writeFileSync(path.join(datedDir, '2026-07-02.aionrs.log'), 'aionrs\n');
      writeFileSync(path.join(logsDir, '2026-07-02.log'), 'frontend\n');

      const files = listLogFilesSync(logsDir);
      const relative = files.map((file) => path.relative(logsDir, file.path).split(path.sep).join('/')).toSorted();

      expect(relative).toEqual([
        '2026-07-02.log',
        '2026/07/02/2026-07-02.aioncore.log',
        '2026/07/02/2026-07-02.aionrs.log',
      ]);
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });
});

describe('packAndCap', () => {
  it('returns a gzip buffer well under cap with truncated=false', () => {
    const segments = [{ name: 'tiny.log', mtime: 0, content: 'hello world\n' }];
    const out = packAndCap(segments, 1024);
    expect(out.gzipped.length).toBeLessThan(1024);
    expect(out.truncated).toBe(false);
    const decompressed = gunzipSync(out.gzipped).toString('utf8');
    expect(decompressed).toContain('hello world');
    expect(decompressed).toContain('tiny.log');
  });

  it('truncates from the head and preserves the tail when over cap', () => {
    // Highly-incompressible payload so gzip can't shrink past the cap on its own:
    // base64-encoded random bytes are near maximum entropy.
    const big = randomBytes(2_000_000).toString('base64');
    const segments = [{ name: 'big.log', mtime: 0, content: big + '\nMARKER_TAIL\n' }];
    const out = packAndCap(segments, 50_000);
    expect(out.gzipped.length).toBeLessThanOrEqual(50_000);
    expect(out.truncated).toBe(true);
    const decompressed = gunzipSync(out.gzipped).toString('utf8');
    expect(decompressed).toContain('MARKER_TAIL');
  });
});

describe('captureBackendStartupFailure', () => {
  it('captures and flushes a dedicated backend startup failure with diagnostics', async () => {
    autoUpdateDiagnosticsMock.readAutoUpdateDiagnostics.mockReturnValue(undefined);
    const error = new Error('aioncore failed to start within timeout') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'health_timeout',
      binaryPath: '/abs/path/aioncore',
      port: 33334,
      stderrTail: 'database is locked',
    };

    await captureBackendStartupFailure(error);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(Sentry.flush).toHaveBeenCalledWith(2000);
    expect(Sentry.withScope).toHaveBeenCalledOnce();
    expect(scopeSetContext).toHaveBeenCalledWith(
      'aioncore_install_diagnostics',
      expect.objectContaining({
        appVersion: '0.0.0-test',
        isPackaged: false,
        platform: process.platform,
      })
    );
  });

  it('sets flattened incomplete-installation tags for update-related missing directory resources', async () => {
    scopeSetTag.mockClear();
    scopeSetContext.mockClear();
    autoUpdateDiagnosticsMock.readAutoUpdateDiagnostics.mockReturnValue({
      currentAppVersion: '2.1.8',
      events: [],
      lastEvent: {
        at: '2026-06-01T22:41:03.273Z',
        status: 'quit-and-install',
      },
      lastQuitAndInstallAt: '2026-06-01T22:41:03.273Z',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T22:41:49.273Z'));

    try {
      const error = new Error('aioncore startup failed while resolving backend binary') as Error & {
        details?: Record<string, unknown>;
      };
      error.details = {
        stage: 'resolve_binary',
        isPackaged: true,
        runtimeKey: 'win32-x64',
        binaryName: 'aioncore.exe',
        resourcesPath: 'C:\\Users\\alice\\AppData\\Local\\Programs\\AionUi\\resources',
        bundledDirExists: false,
        runtimeDirExists: false,
        resourcesDirEntries: [
          'app-update.yml',
          'app.asar',
          'app.asar.unpacked/',
          'app.png',
          'elevate.exe',
          'manifest.webmanifest',
          'sw.js',
        ],
      };

      await captureBackendStartupFailure(error);

      expect(scopeSetTag).toHaveBeenCalledWith(
        'aionui.backend_startup.incomplete_installation_kind',
        'missing_directory_resources'
      );
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.missing_bundled_dir', 'true');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.missing_runtime_dir', 'true');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.missing_binary', 'true');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.missing_hub_dir', 'true');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.last_update_status', 'quit-and-install');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.seconds_since_quit_and_install', '46');
      expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.install_path_kind', 'user_local_programs');
      expect(scopeSetContext).toHaveBeenCalledWith(
        'aioncore_startup_classification',
        expect.objectContaining({
          incompleteInstallationKind: 'missing_directory_resources',
          missingBundledAioncoreDir: true,
          missingRuntimeDir: true,
          missingBackendBinary: true,
        })
      );
    } finally {
      vi.useRealTimers();
      autoUpdateDiagnosticsMock.readAutoUpdateDiagnostics.mockReturnValue(undefined);
    }
  });

  it('sets bucketed health polling tags for backend startup timeouts', async () => {
    scopeSetTag.mockClear();
    autoUpdateDiagnosticsMock.readAutoUpdateDiagnostics.mockReturnValue(undefined);
    const error = new Error('aioncore failed to start within timeout') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'health_timeout',
      binaryPath: '/abs/path/aioncore',
      port: 33334,
      healthCheckAttempts: 1,
      healthCheckExpectedAttempts: 150,
      healthCheckAttemptDeficit: 149,
      healthCheckPollingDelayed: true,
      healthCheckTimeoutOverrunMs: 515_417,
      healthCheckMaxAttemptGapMs: 0,
    };

    await captureBackendStartupFailure(error);

    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.health_polling_delayed', 'true');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.health_attempts_bucket', '1');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.health_attempt_deficit_bucket', '76-150');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.health_timeout_overrun_bucket', 'over_60s');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.health_max_attempt_gap_bucket', '0ms');
  });

  it('sets backend data migration reason and boundary tags', async () => {
    scopeSetTag.mockClear();
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.migration',
      stderrTail:
        'BOOTSTRAP_DATA_INIT_FAILED stage=database.migration databasePath=/db/aionui-backend.db: failed to initialize application data',
    };

    await captureBackendStartupFailure(error);

    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.reason', 'backend_data_migration_failed');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.boundary_code', 'BOOTSTRAP_DATA_INIT_FAILED');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.boundary_stage', 'database.migration');
  });

  it('sets local data repair reason and issue-kind tags', async () => {
    scopeSetTag.mockClear();
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      backendBoundaryCode: 'BOOTSTRAP_SERVICE_INIT_FAILED',
      backendBoundaryStage: 'services.init',
      stderrTail:
        'Failed to hydrate agent registry: Internal error: load agent_metadata: Database query failed: error occurred while decoding column "config_options": invalid utf-8 sequence of 1 bytes from index 793',
    };

    await captureBackendStartupFailure(error);

    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.reason', 'backend_local_data_repair_failed');
    expect(scopeSetTag).toHaveBeenCalledWith(
      'aionui.backend_startup.local_data_issue_kind',
      'agent_metadata_invalid_utf8'
    );
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.boundary_code', 'BOOTSTRAP_SERVICE_INIT_FAILED');
    expect(scopeSetTag).toHaveBeenCalledWith('aionui.backend_startup.boundary_stage', 'services.init');
  });
});

describe('initSentry beforeSend', () => {
  it('drops native GPU unusable crashes reported only through crashpad context', () => {
    initSentry();

    const event = {
      contexts: {
        electron: {
          'crashpad.LOG_FATAL': "gpu_data_manager_impl_private.cc:415: GPU process isn't usable. Goodbye.\n",
        },
      },
    };

    expect(sentryInitOptions?.beforeSend?.(event)).toBeNull();
  });

  it('keeps native shutdown fatal crashes while filtering GPU crashpad noise', () => {
    initSentry();

    const event = {
      contexts: {
        electron: {
          'crashpad.LOG_FATAL': 'electron_browser_main_parts.cc:501: Failed to shutdown.\n',
        },
      },
    };

    expect(sentryInitOptions?.beforeSend?.(event)).toBe(event);
  });

  it('drops backend-port secondary errors after backend startup already failed', () => {
    initSentry();
    (globalThis as { __backendStartupFailed?: boolean }).__backendStartupFailed = true;

    const event = {
      exception: {
        values: [
          {
            value: '[WebUI] Cannot start: aioncore is not running (globalThis.__backendPort unset)',
          },
        ],
      },
    };

    expect(sentryInitOptions?.beforeSend?.(event)).toBeNull();

    delete (globalThis as { __backendStartupFailed?: boolean }).__backendStartupFailed;
  });

  it('keeps the primary backend startup failure even when its details contain secondary text', () => {
    initSentry();
    (globalThis as { __backendStartupFailed?: boolean }).__backendStartupFailed = true;

    const event = {
      tags: {
        'aionui.failure': 'backend_startup',
      },
      exception: {
        values: [
          {
            value: 'BackendStartupError: connect ECONNREFUSED 127.0.0.1:33334',
          },
        ],
      },
    };

    expect(sentryInitOptions?.beforeSend?.(event)).toBe(event);

    delete (globalThis as { __backendStartupFailed?: boolean }).__backendStartupFailed;
  });

  it('keeps user feedback reports even when diagnostics contain backend secondary text', () => {
    initSentry();
    (globalThis as { __backendStartupFailed?: boolean }).__backendStartupFailed = true;

    const event = {
      tags: {
        type: 'user-feedback',
        'aionui.installation_integrity.user_report': 'true',
      },
      extra: {
        installation_integrity: {
          backendStartupFailure: {
            message: 'BackendStartupError: connect ECONNREFUSED 127.0.0.1:33334',
          },
        },
      },
    };

    expect(sentryInitOptions?.beforeSend?.(event)).toBe(event);

    delete (globalThis as { __backendStartupFailed?: boolean }).__backendStartupFailed;
  });
});
