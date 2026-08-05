/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';
import type { ReactNode } from 'react';
import React, { useEffect, useState } from 'react';

// Fatal reasons that render the blocking failure dialog (instead of the App).
// backend_startup_pending_slow is handled separately (benign "starting" view),
// and backend_startup_directory_unavailable intentionally stays out of this set
// to preserve existing behavior.
export function shouldShowBackendStartupFailureDialog(
  reason: BackendStartupFailureInfo['reason'] | undefined
): boolean {
  return (
    reason === 'backend_incompatible_runtime' ||
    reason === 'backend_incomplete_installation' ||
    reason === 'backend_package_architecture_mismatch' ||
    reason === 'backend_data_migration_failed' ||
    reason === 'backend_local_data_repair_failed' ||
    reason === 'backend_recoverable_database_corruption' ||
    reason === 'backend_transient_concurrent_startup' ||
    reason === 'backend_startup_exited' ||
    reason === 'backend_startup_port_report_timeout' ||
    reason === 'backend_startup_failed'
  );
}

export type BackendStartupGateProps = {
  /** Benign "backend is still starting" view (reason `backend_startup_pending_slow`). */
  renderStarting: () => ReactNode;
  /** Blocking failure dialog for a fatal startup reason. */
  renderFailure: (failure: BackendStartupFailureInfo) => ReactNode;
  /** The normal application, shown once the backend is ready. */
  renderApp: () => ReactNode;
};

/**
 * Top-level gate driven by the backend startup lifecycle. It starts from the
 * one-shot preload snapshot, re-reads once on mount to resolve a READY that
 * landed before subscription, then follows backend-startup-state pushes:
 * pending-slow → benign "starting" view; ready (null) → App; exit → honest
 * failure view. This is what makes the "starting" view disappear automatically
 * on readiness without a manual restart.
 *
 * The concrete views are injected as render props so this control-flow logic
 * stays free of the heavy App/dialog import graph and remains unit-testable.
 */
const BackendStartupGate: React.FC<BackendStartupGateProps> = ({ renderStarting, renderFailure, renderApp }) => {
  const [state, setState] = useState<BackendStartupFailureInfo | null>(
    () => window.__backendStartupBridge?.getState() ?? window.__backendStartupFailure ?? null
  );

  useEffect(() => {
    const bridge = window.__backendStartupBridge;
    if (!bridge) return;
    setState(bridge.getState());
    return bridge.subscribe((next) => setState(next));
  }, []);

  if (state?.reason === 'backend_startup_pending_slow') {
    return <>{renderStarting()}</>;
  }

  if (state && shouldShowBackendStartupFailureDialog(state.reason)) {
    return <>{renderFailure(state)}</>;
  }

  return <>{renderApp()}</>;
};

export default BackendStartupGate;
