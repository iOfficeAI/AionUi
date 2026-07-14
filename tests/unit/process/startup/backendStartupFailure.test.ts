import { describe, expect, it } from 'vitest';
import { classifyBackendStartupFailure } from '@/process/startup/backendStartupFailure';

describe('classifyBackendStartupFailure', () => {
  it('classifies assistant bootstrap boundary failures as local data repair failures', () => {
    const result = classifyBackendStartupFailure({
      details: {
        backendBoundaryCode: 'BOOTSTRAP_SERVER_FAILED',
        backendBoundaryStage: 'router.assistant.bootstrap',
        causeMessage: 'failed to bootstrap assistant storage',
      },
      message: 'aioncore exited before health check passed',
      name: 'BackendStartupError',
    });

    expect(result).toMatchObject({
      backendBoundaryCode: 'BOOTSTRAP_SERVER_FAILED',
      backendBoundaryStage: 'router.assistant.bootstrap',
      localDataIssueKind: 'assistant_storage_bootstrap_failed',
      reason: 'backend_local_data_repair_failed',
    });
  });
});
