/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import BackendStartupGate from '@/renderer/components/layout/BackendStartupGate';

type Bridge = NonNullable<Window['__backendStartupBridge']>;

// Install a controllable backend-startup bridge so the test can drive the exact
// ready/exit pushes the main process would send over `backend-startup-state`.
function installBridge(initial: BackendStartupFailureInfo | null): {
  push: (next: BackendStartupFailureInfo | null) => void;
} {
  let listener: ((state: BackendStartupFailureInfo | null) => void) | undefined;
  const bridge: Bridge = {
    getState: () => initial,
    subscribe: (callback) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    },
  };
  window.__backendStartupBridge = bridge;
  return {
    push: (next) =>
      act(() => {
        listener?.(next);
      }),
  };
}

const gateProps = {
  renderStarting: () => <div data-testid='view-starting' />,
  renderFailure: (failure: BackendStartupFailureInfo) => <div data-testid='view-failure'>{failure.reason}</div>,
  renderApp: () => <div data-testid='view-app' />,
};

afterEach(() => {
  cleanup();
  delete window.__backendStartupBridge;
  delete window.__backendStartupFailure;
});

describe('BackendStartupGate — lifecycle-driven view switching (AC-4 / AC-11)', () => {
  it('AC-4: shows the starting view while pending-slow, then auto-switches to the App on a ready (null) push', () => {
    const { push } = installBridge({ reason: 'backend_startup_pending_slow' });

    render(<BackendStartupGate {...gateProps} />);

    // Process alive but not ready → benign starting view, App not mounted.
    expect(screen.getByTestId('view-starting')).toBeTruthy();
    expect(screen.queryByTestId('view-app')).toBeNull();

    // Backend became ready: main process pushes null → gate switches to App
    // automatically, with no manual restart, and stops rendering the starting view.
    push(null);

    expect(screen.getByTestId('view-app')).toBeTruthy();
    expect(screen.queryByTestId('view-starting')).toBeNull();
  });

  it('switches the starting view to the honest-failure view when the process later exits', () => {
    const { push } = installBridge({ reason: 'backend_startup_pending_slow' });

    render(<BackendStartupGate {...gateProps} />);
    expect(screen.getByTestId('view-starting')).toBeTruthy();

    // pending-slow → exited: gate must move to the failure view, not the App.
    push({ reason: 'backend_startup_exited' });

    const failure = screen.getByTestId('view-failure');
    expect(failure.textContent).toBe('backend_startup_exited');
    expect(screen.queryByTestId('view-starting')).toBeNull();
    expect(screen.queryByTestId('view-app')).toBeNull();
  });

  it('renders the App when there is no startup failure state', () => {
    installBridge(null);

    render(<BackendStartupGate {...gateProps} />);

    expect(screen.getByTestId('view-app')).toBeTruthy();
    expect(screen.queryByTestId('view-starting')).toBeNull();
    expect(screen.queryByTestId('view-failure')).toBeNull();
  });
});

describe('BackendStartupGate — port report timeout is fatal (Sentry 136646113)', () => {
  it('shows the failure view for backend_startup_port_report_timeout', () => {
    installBridge({ reason: 'backend_startup_port_report_timeout' });

    render(<BackendStartupGate {...gateProps} />);

    expect(screen.getByTestId('view-failure').textContent).toBe('backend_startup_port_report_timeout');
    expect(screen.queryByTestId('view-app')).toBeNull();
    expect(screen.queryByTestId('view-starting')).toBeNull();
  });
});
