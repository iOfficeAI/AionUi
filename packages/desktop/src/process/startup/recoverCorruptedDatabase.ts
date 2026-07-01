import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';

export type RecoverCorruptedDatabaseDeps = {
  getFailure: () => BackendStartupFailureInfo | null;
  stopBackend: () => Promise<void>;
  startBackendWithRecovery: () => Promise<number>;
  markReady: (port: number, source: string) => void;
  reloadMainWindow: () => void;
  logInfo: (message: string) => void;
  logWarn: (message: string) => void;
};

export async function recoverCorruptedDatabaseAfterUserConfirmation(deps: RecoverCorruptedDatabaseDeps): Promise<void> {
  const failure = deps.getFailure();
  if (failure?.reason !== 'backend_recoverable_database_corruption') {
    deps.logWarn('[AionUi] Ignoring corrupted database recovery request outside recoverable failure state.');
    throw new Error('backend_corrupted_database_recovery_not_available');
  }

  deps.logInfo('[AionUi] User confirmed corrupted database backup and rebuild.');
  await deps.stopBackend();
  const port = await deps.startBackendWithRecovery();
  deps.markReady(port, 'backendManager.recoverCorruptedDatabase');
  deps.reloadMainWindow();
}
