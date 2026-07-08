import { describe, expect, it, vi } from 'vitest';
import { classifyBackendStartupFailure } from '@/process/startup/backendStartupFailure';
import { detectStartupArchitectureMismatch } from '@/process/startup/architectureCompatibility';
import { getInstallationIntegrityModalActions } from '@/renderer/components/layout/InstallationIntegrityDialog';

describe('classifyBackendStartupFailure', () => {
  it('classifies missing GLIBC symbols as an incompatible backend runtime', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      stderrTail:
        "/opt/AionUi/resources/bundled-aioncore/linux-x64/aioncore.bin: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.34' not found\n" +
        "/opt/AionUi/resources/bundled-aioncore/linux-x64/aioncore.bin: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.32' not found",
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_incompatible_runtime',
      runtime: 'glibc',
      requiredVersions: ['2.32', '2.34'],
    });
  });

  it('keeps unrelated startup failures in the generic bucket', () => {
    const error = new Error('aioncore failed to start within timeout') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'health_timeout',
      stderrTail: 'database is locked',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_failed',
    });
  });

  it('classifies missing startup directory preparation as a startup directory failure', () => {
    const error = new Error('aioncore startup directory preparation failed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'spawn',
      workDir: 'D:\\ai\\AionUI\\工作目录',
      causeMessage: 'ENOENT: no such file or directory, mkdir D:\\ai\\AionUI\\工作目录',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_directory_unavailable',
      startupDirectoryIssueKind: 'missing_or_unavailable_directory',
    });
  });

  it('classifies startup directory permission failures separately from incomplete installs', () => {
    const error = new Error('aioncore startup directory preparation failed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'spawn',
      workDir: 'D:\\ai\\AionUI\\工作目录',
      causeMessage: 'EPERM: operation not permitted, mkdir D:\\ai\\AionUI\\工作目录',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_directory_unavailable',
      startupDirectoryIssueKind: 'permission_denied',
    });
  });

  it('does not classify post-resolution binary spawn ENOENT as a startup directory failure', () => {
    const error = new Error('aioncore process emitted an error before startup') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'spawn_error',
      binaryPath: 'D:\\apps\\AionUi\\resources\\bundled-aioncore\\win32-x64\\aioncore.exe',
      causeMessage: 'spawn D:\\apps\\AionUi\\resources\\bundled-aioncore\\win32-x64\\aioncore.exe ENOENT',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_failed',
      backendBoundaryCode: undefined,
      backendBoundaryStage: undefined,
    });
  });

  it('preserves backend bootstrap code and stage for generic startup failures', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      stderrTail: 'BOOTSTRAP_DATA_INIT_FAILED stage=database.open: failed to initialize application data',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.open',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_failed',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.open',
    });
  });

  it('classifies database migration boundary failures as local data migration failures', () => {
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

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_data_migration_failed',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.migration',
    });
  });

  it('classifies recoverable database corruption boundary failures separately from data migration failures', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
      stderrTail:
        'BOOTSTRAP_DATA_INIT_FAILED stage=database.recoverable_corruption databasePath=/db/aionui-backend.db: failed to initialize application data',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_recoverable_database_corruption',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
    });
  });

  it('classifies database schema repair boundary failures as local data migration failures', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.schema_repair',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_data_migration_failed',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.schema_repair',
    });
  });

  it('classifies agent metadata invalid utf8 during services init as local data repair failure', () => {
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

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_local_data_repair_failed',
      backendBoundaryCode: 'BOOTSTRAP_SERVICE_INIT_FAILED',
      backendBoundaryStage: 'services.init',
      localDataIssueKind: 'agent_metadata_invalid_utf8',
    });
  });

  it('keeps unrelated services init failures in the generic bucket', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      backendBoundaryCode: 'BOOTSTRAP_SERVICE_INIT_FAILED',
      backendBoundaryStage: 'services.init',
      stderrTail: 'Failed to initialize provider registry: database is locked',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_failed',
      backendBoundaryCode: 'BOOTSTRAP_SERVICE_INIT_FAILED',
      backendBoundaryStage: 'services.init',
    });
  });

  it('does not classify vague invalid utf8 text without the agent metadata database-query signature', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      backendBoundaryCode: 'BOOTSTRAP_SERVICE_INIT_FAILED',
      backendBoundaryStage: 'services.init',
      stderrTail: 'agent_metadata config_options invalid utf-8 while validating an unrelated diagnostic payload',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_failed',
      backendBoundaryCode: 'BOOTSTRAP_SERVICE_INIT_FAILED',
      backendBoundaryStage: 'services.init',
    });
  });

  it('classifies packaged app resources missing from installation as incomplete installation', () => {
    const error = new Error('aioncore startup failed while resolving backend binary') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'resolve_binary',
      isPackaged: true,
      runtimeKey: 'win32-x64',
      binaryName: 'aioncore.exe',
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

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_incomplete_installation',
      incompleteInstallationKind: 'missing_directory_resources',
      missingBackendBinary: true,
      missingBundledAioncoreDir: true,
      missingHubDir: true,
      missingPetStatesDir: true,
      missingPwaDir: true,
      missingResources: ['bundled-aioncore/', 'bundled-aioncore/win32-x64/'],
      missingRuntimeDir: true,
    });
  });

  it('classifies packaged runtime directories without the backend binary as incomplete installation', () => {
    const error = new Error('aioncore startup failed while resolving backend binary') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'resolve_binary',
      isPackaged: true,
      runtimeKey: 'win32-x64',
      binaryName: 'aioncore.exe',
      bundledDirExists: true,
      runtimeDirExists: true,
      resourcesDirEntries: [
        'app-update.yml',
        'app.asar',
        'app.asar.unpacked/',
        'app.png',
        'bundled-aioncore/',
        'elevate.exe',
        'hub/',
        'manifest.webmanifest',
        'pet-states/',
        'pwa/',
        'sw.js',
      ],
      runtimeDirEntries: ['manifest.json'],
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_incomplete_installation',
      incompleteInstallationKind: 'missing_directory_resources',
      missingBackendBinary: true,
      missingBundledAioncoreDir: false,
      missingHubDir: false,
      missingPetStatesDir: false,
      missingPwaDir: false,
      missingResources: ['bundled-aioncore/win32-x64/managed-resources/', 'bundled-aioncore/win32-x64/aioncore.exe'],
      missingRuntimeDir: false,
    });
  });

  it('classifies packaged macOS architecture mismatches separately from generic startup failures', () => {
    const error = new Error('AionUi package architecture does not match this Mac') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'startup_architecture_check',
      platform: 'darwin',
      isPackaged: true,
      packageArch: 'x64',
      deviceArch: 'arm64',
      expectedDownloadArch: 'arm64',
      isRosettaTranslated: true,
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_package_architecture_mismatch',
      packageArch: 'x64',
      deviceArch: 'arm64',
      expectedDownloadArch: 'arm64',
      isRosettaTranslated: true,
    });
  });
});

describe('detectStartupArchitectureMismatch', () => {
  it('detects packaged macOS x64 builds running on Apple Silicon', () => {
    const mismatch = detectStartupArchitectureMismatch({
      arch: 'x64',
      isPackaged: true,
      platform: 'darwin',
      execFileSync: (command, args) => {
        expect(command).toBe('sysctl');
        if (args.join(' ') === '-in sysctl.proc_translated') return '1\n';
        if (args.join(' ') === '-in hw.optional.arm64') return '1\n';
        throw new Error(`unexpected args: ${args.join(' ')}`);
      },
    });

    expect(mismatch).toEqual({
      deviceArch: 'arm64',
      expectedDownloadArch: 'arm64',
      isPackaged: true,
      isRosettaTranslated: true,
      packageArch: 'x64',
      platform: 'darwin',
      stage: 'startup_architecture_check',
    });
  });

  it('allows packaged macOS x64 builds on Intel Macs', () => {
    const mismatch = detectStartupArchitectureMismatch({
      arch: 'x64',
      isPackaged: true,
      platform: 'darwin',
      execFileSync: (_command, args) => {
        if (args.join(' ') === '-in sysctl.proc_translated') return '0\n';
        if (args.join(' ') === '-in hw.optional.arm64') return '0\n';
        throw new Error(`unexpected args: ${args.join(' ')}`);
      },
    });

    expect(mismatch).toBeNull();
  });

  it('skips checks outside packaged macOS', () => {
    const mismatch = detectStartupArchitectureMismatch({
      arch: 'x64',
      isPackaged: false,
      platform: 'darwin',
      execFileSync: () => {
        throw new Error('sysctl should not be called');
      },
    });

    expect(mismatch).toBeNull();
  });
});

describe('getInstallationIntegrityModalActions', () => {
  it('exposes diagnostics reporting next to download-latest for blocking dialogs', () => {
    const t = (key: string) => key;
    const onReportDiagnostics = vi.fn();

    const actions = getInstallationIntegrityModalActions(t, { onReportDiagnostics });

    expect(actions.downloadText).toBe('common.backendStartup.incompleteInstallation.downloadLatest');
    expect(actions.reportText).toBe('common.backendStartup.incompleteInstallation.sendDiagnostics');

    actions.onReportDiagnostics();
    expect(onReportDiagnostics).toHaveBeenCalledOnce();
  });

  it('uses data migration copy and diagnostics-only actions for local data migration failures', () => {
    const t = vi.fn((key: string) => key) as any;
    const failure = {
      reason: 'backend_data_migration_failed',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.migration',
    };

    const actions = getInstallationIntegrityModalActions(t, {
      diagnosticsKind: 'data_migration',
    } as any);

    expect(actions.reportText).toBe('common.backendStartup.dataMigration.sendDiagnostics');
    expect(actions.downloadText).toBeUndefined();
    expect(failure.backendBoundaryStage).toBe('database.migration');
  });

  it('uses local data repair copy and diagnostics-only actions for local cache corruption', () => {
    const t = vi.fn((key: string) => key) as any;

    const actions = getInstallationIntegrityModalActions(t, {
      diagnosticsKind: 'local_data_repair',
    } as any);

    expect(actions.reportText).toBe('common.backendStartup.localDataRepair.sendDiagnostics');
    expect(actions.downloadText).toBeUndefined();
  });

  it('uses startup directory copy and diagnostics-only actions for directory failures', () => {
    const t = vi.fn((key: string) => key) as any;

    const actions = getInstallationIntegrityModalActions(t, {
      diagnosticsKind: 'startup_directory',
    } as any);

    expect(actions.reportText).toBe('common.backendStartup.startupDirectory.sendDiagnostics');
    expect(actions.downloadText).toBeUndefined();
  });

  it('uses recoverable database corruption copy and rebuild action', () => {
    const t = vi.fn((key: string) => key) as any;
    const onRecoverCorruptedDatabase = vi.fn();

    const actions = getInstallationIntegrityModalActions(t, {
      diagnosticsKind: 'recoverable_database_corruption',
      onRecoverCorruptedDatabase,
    } as any);

    expect(actions.reportText).toBe('common.backendStartup.recoverableDatabaseCorruption.sendDiagnostics');
    expect(actions.downloadText).toBeUndefined();
    expect((actions as any).recoverText).toBe('common.backendStartup.recoverableDatabaseCorruption.confirmRebuild');
    (actions as any).onRecoverCorruptedDatabase();
    expect(onRecoverCorruptedDatabase).toHaveBeenCalledOnce();
  });

  it('does not invoke recover corrupted database action from diagnostics reporting', async () => {
    const t = vi.fn((key: string) => key) as any;
    const onReportDiagnostics = vi.fn();
    const onRecoverCorruptedDatabase = vi.fn();

    const actions = getInstallationIntegrityModalActions(t, {
      diagnosticsKind: 'recoverable_database_corruption',
      onRecoverCorruptedDatabase,
      onReportDiagnostics,
    } as any);

    await actions.onReportDiagnostics();

    expect(onReportDiagnostics).toHaveBeenCalledOnce();
    expect(onRecoverCorruptedDatabase).not.toHaveBeenCalled();
  });
});
