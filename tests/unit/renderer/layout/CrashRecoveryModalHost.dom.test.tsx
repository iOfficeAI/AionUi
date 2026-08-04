import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { Message } from '@arco-design/web-react';

const bridgeMocks = vi.hoisted(() => ({
  dismiss: vi.fn(),
  getState: vi.fn(),
  openReports: vi.fn(),
  restartSafeMode: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      dismissCrashRecovery: { invoke: bridgeMocks.dismiss },
      getCrashRecoveryState: { invoke: bridgeMocks.getState },
      openCrashReports: { invoke: bridgeMocks.openReports },
      restartInSafeMode: { invoke: bridgeMocks.restartSafeMode },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/services/feedback/submitFeedbackReport', () => ({
  submitFeedbackReport: vi.fn(),
}));

import { CrashRecoveryModalHost } from '@renderer/components/layout/InstallationIntegrityDialog';

const detectedState = {
  detected: true,
  reportId: 'native-crash',
  safeMode: false,
};

describe('CrashRecoveryModalHost', () => {
  beforeEach(() => {
    bridgeMocks.getState.mockResolvedValue(detectedState);
    bridgeMocks.dismiss.mockResolvedValue(undefined);
    bridgeMocks.openReports.mockResolvedValue(undefined);
    bridgeMocks.restartSafeMode.mockResolvedValue({ restarted: true, manualRestartRequired: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('continues normally and dismisses the report', async () => {
    render(<CrashRecoveryModalHost />);
    fireEvent.click(await screen.findByTestId('crash-recovery-continue'));

    await waitFor(() => expect(bridgeMocks.dismiss).toHaveBeenCalledWith({ reportId: 'native-crash' }));
    expect(screen.queryByTestId('crash-recovery-continue')).toBeNull();
  });

  it('opens reports without dismissing the prompt', async () => {
    render(<CrashRecoveryModalHost />);
    fireEvent.click(await screen.findByTestId('crash-recovery-open-reports'));

    await waitFor(() => expect(bridgeMocks.openReports).toHaveBeenCalledOnce());
    expect(bridgeMocks.dismiss).not.toHaveBeenCalled();
    expect(screen.getByTestId('crash-recovery-continue')).toBeTruthy();
  });

  it('dismisses the report and restarts once in safe mode', async () => {
    render(<CrashRecoveryModalHost />);
    fireEvent.click(await screen.findByTestId('crash-recovery-safe-mode'));

    await waitFor(() => expect(bridgeMocks.restartSafeMode).toHaveBeenCalledOnce());
    expect(bridgeMocks.dismiss).toHaveBeenCalledWith({ reportId: 'native-crash' });
  });

  it('falls back silently when the recovery bridge is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    bridgeMocks.getState.mockRejectedValue(new Error('bridge unavailable'));

    render(<CrashRecoveryModalHost />);

    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.queryByTestId('crash-recovery-continue')).toBeNull();
  });

  it('shows a localized error when opening the reports folder fails', async () => {
    const error = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    bridgeMocks.openReports.mockRejectedValue(new Error('shell unavailable'));

    render(<CrashRecoveryModalHost />);
    fireEvent.click(await screen.findByTestId('crash-recovery-open-reports'));

    await waitFor(() => expect(error).toHaveBeenCalledWith('common.crashRecovery.openReportsFailed'));
  });
});
