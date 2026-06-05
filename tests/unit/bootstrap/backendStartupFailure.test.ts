import { describe, expect, it } from 'vitest';
import { classifyBackendStartupFailure } from '@/process/startup/backendStartupFailure';

describe('classifyBackendStartupFailure', () => {
  it('classifies missing GLIBC symbols as an incompatible backend runtime', () => {
    const error = new Error('poundingcore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      stderrTail:
        "/opt/AionUi/resources/bundled-poundingcore/linux-x64/poundingcore.bin: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.34' not found\n" +
        "/opt/AionUi/resources/bundled-poundingcore/linux-x64/poundingcore.bin: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.32' not found",
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_incompatible_runtime',
      runtime: 'glibc',
      requiredVersions: ['2.32', '2.34'],
    });
  });

  it('keeps unrelated startup failures in the generic bucket', () => {
    const error = new Error('poundingcore failed to start within timeout') as Error & {
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

  it('classifies packaged app resources missing from installation as incomplete installation', () => {
    const error = new Error('poundingcore startup failed while resolving backend binary') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'resolve_binary',
      isPackaged: true,
      runtimeKey: 'win32-x64',
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
      missingResources: ['bundled-poundingcore/', 'bundled-poundingcore/win32-x64/'],
    });
  });

  it('classifies packaged runtime directories without the backend binary as incomplete installation', () => {
    const error = new Error('poundingcore startup failed while resolving backend binary') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'resolve_binary',
      isPackaged: true,
      runtimeKey: 'win32-x64',
      binaryName: 'poundingcore.exe',
      bundledDirExists: true,
      runtimeDirExists: true,
      resourcesDirEntries: [
        'app-update.yml',
        'app.asar',
        'app.asar.unpacked/',
        'app.png',
        'bundled-poundingcore/',
        'elevate.exe',
        'manifest.webmanifest',
        'sw.js',
      ],
      runtimeDirEntries: ['manifest.json'],
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_incomplete_installation',
      missingResources: ['bundled-poundingcore/win32-x64/poundingcore.exe'],
    });
  });
});
