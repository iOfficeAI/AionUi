import { describe, expect, it } from 'vitest';
import { classifyBackendStartupFailure } from '@/process/startup/backendStartupFailure';

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
});
