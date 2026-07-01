import { describe, expect, it, vi } from 'vitest';
import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';
import { recoverCorruptedDatabaseAfterUserConfirmation } from '@/process/startup/recoverCorruptedDatabase';

function makeDeps(failure: BackendStartupFailureInfo | null) {
  return {
    getFailure: vi.fn(() => failure),
    stopBackend: vi.fn().mockResolvedValue(undefined),
    startBackendWithRecovery: vi.fn().mockResolvedValue(25808),
    markReady: vi.fn(),
    reloadMainWindow: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
  };
}

describe('recoverCorruptedDatabaseAfterUserConfirmation', () => {
  it('rejects when no recoverable startup failure is active', async () => {
    const deps = makeDeps(null);

    await expect(recoverCorruptedDatabaseAfterUserConfirmation(deps)).rejects.toThrow(
      'backend_corrupted_database_recovery_not_available'
    );

    expect(deps.stopBackend).not.toHaveBeenCalled();
    expect(deps.startBackendWithRecovery).not.toHaveBeenCalled();
    expect(deps.logWarn).toHaveBeenCalledOnce();
  });

  it('rejects data migration failures that are not recoverable corruption', async () => {
    const deps = makeDeps({
      reason: 'backend_data_migration_failed',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.migration',
    });

    await expect(recoverCorruptedDatabaseAfterUserConfirmation(deps)).rejects.toThrow(
      'backend_corrupted_database_recovery_not_available'
    );

    expect(deps.stopBackend).not.toHaveBeenCalled();
    expect(deps.startBackendWithRecovery).not.toHaveBeenCalled();
  });

  it('restarts the backend with recovery and reloads the main window after confirmation', async () => {
    const deps = makeDeps({
      reason: 'backend_recoverable_database_corruption',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
    });

    await recoverCorruptedDatabaseAfterUserConfirmation(deps);

    expect(deps.stopBackend).toHaveBeenCalledOnce();
    expect(deps.startBackendWithRecovery).toHaveBeenCalledOnce();
    expect(deps.markReady).toHaveBeenCalledWith(25808, 'backendManager.recoverCorruptedDatabase');
    expect(deps.reloadMainWindow).toHaveBeenCalledOnce();
    expect(deps.logInfo).toHaveBeenCalledOnce();
  });

  it('does not mark ready or reload when restart fails', async () => {
    const failure: BackendStartupFailureInfo = {
      reason: 'backend_recoverable_database_corruption',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
    };
    const deps = makeDeps(failure);
    deps.startBackendWithRecovery.mockRejectedValue(new Error('restart failed'));

    await expect(recoverCorruptedDatabaseAfterUserConfirmation(deps)).rejects.toThrow('restart failed');

    expect(deps.markReady).not.toHaveBeenCalled();
    expect(deps.reloadMainWindow).not.toHaveBeenCalled();
    expect(deps.getFailure()).toBe(failure);
  });
});
