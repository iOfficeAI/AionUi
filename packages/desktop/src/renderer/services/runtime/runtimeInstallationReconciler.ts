/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { IRuntimeStatusEvent, RuntimeFailureKind } from '@/common/adapter/ipcBridge';

/** ~15s: slightly larger than the ~10.7s self-heal observed in the issue logs. */
export const RUNTIME_RECONCILE_WINDOW_MS = 15000;

const INSTALLATION_INTEGRITY_FAILURES = new Set<RuntimeFailureKind>([
  'bundled_resource_missing',
  'bundled_resource_invalid',
  'validation_failed',
]);

function isInstallationIntegrityFailure(kind: RuntimeFailureKind | undefined): boolean {
  return INSTALLATION_INTEGRITY_FAILURES.has(kind ?? 'unknown');
}

export type ReconcilerDialogHandle = { close: () => void };

export type RuntimeInstallationReconcilerCallbacks = {
  showDialog: (event: IRuntimeStatusEvent) => ReconcilerDialogHandle;
  report: (event: IRuntimeStatusEvent) => void;
};

export type RuntimeInstallationReconciler = {
  handleStatus: (event: IRuntimeStatusEvent) => void;
  flushPending: () => void;
  dispose: () => void;
};

type PendingEntry = {
  event: IRuntimeStatusEvent;
  dialog: ReconcilerDialogHandle;
  timer: ReturnType<typeof setTimeout>;
};

// Reconcile at the resource level, ignoring scope (spec 13.4): node is a global
// singleton, so a ready from any scope proves node is healthy. Key by resource.
function resourceKey(event: IRuntimeStatusEvent): string {
  return event.resource;
}

export function createRuntimeInstallationReconciler(
  callbacks: RuntimeInstallationReconcilerCallbacks
): RuntimeInstallationReconciler {
  const pending = new Map<string, PendingEntry>();

  const settle = (entry: PendingEntry): void => {
    entry.dialog.close();
    clearTimeout(entry.timer);
  };

  const handleFailed = (event: IRuntimeStatusEvent): void => {
    if (!isInstallationIntegrityFailure(event.failure_kind)) return;
    const key = resourceKey(event);
    if (pending.has(key)) return; // one reconciliation per resource at a time
    const dialog = callbacks.showDialog(event); // show immediately
    const timer = setTimeout(() => {
      // window end: real persistent failure — send the deferred report, keep the dialog.
      pending.delete(key);
      clearTimeout(timer);
      callbacks.report(event);
    }, RUNTIME_RECONCILE_WINDOW_MS);
    pending.set(key, { event, dialog, timer });
  };

  const handleReady = (event: IRuntimeStatusEvent): void => {
    const key = resourceKey(event);
    const entry = pending.get(key);
    if (!entry) return;
    // self-healed within the window — retract dialog, suppress deferred report.
    pending.delete(key);
    settle(entry);
  };

  return {
    handleStatus(event: IRuntimeStatusEvent): void {
      if (event.phase === 'failed') {
        handleFailed(event);
      } else if (event.phase === 'ready') {
        handleReady(event);
      }
    },
    flushPending(): void {
      // Exit/unmount: emit not-yet-due reports so a real persistent failure that
      // occurred <window before exit is not lost.
      for (const [key, entry] of pending) {
        clearTimeout(entry.timer);
        pending.delete(key);
        callbacks.report(entry.event);
      }
    },
    dispose(): void {
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
      }
      pending.clear();
    },
  };
}
