/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { showBackendStartupFailureDialog, startBackendOrExit } from '@/process/startup/backendStartup';

describe('startBackendOrExit', () => {
  it('registers the backend port when startup succeeds', async () => {
    const onStarted = vi.fn();
    const captureFailure = vi.fn();
    const exitApp = vi.fn();

    const result = await startBackendOrExit({
      startBackend: async () => 42123,
      onStarted,
      captureFailure,
      exitApp,
      logError: vi.fn(),
    });

    expect(result).toEqual({ ok: true, port: 42123 });
    expect(onStarted).toHaveBeenCalledWith(42123);
    expect(captureFailure).not.toHaveBeenCalled();
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('captures startup failure and exits without registering a backend port', async () => {
    const error = new Error('aioncore failed to start within timeout');
    const calls: string[] = [];
    const onStarted = vi.fn();
    const captureFailure = vi.fn(async () => {
      calls.push('capture-start');
      await Promise.resolve();
      calls.push('capture-end');
    });
    const exitApp = vi.fn(() => {
      calls.push('exit');
    });
    const showFailureDialog = vi.fn(async () => {
      calls.push('dialog');
    });
    const logError = vi.fn();

    const result = await startBackendOrExit({
      startBackend: async () => {
        throw error;
      },
      onStarted,
      captureFailure,
      showFailureDialog,
      exitApp,
      logError,
    });

    expect(result).toEqual({ ok: false });
    expect(logError).toHaveBeenCalledWith('[AionUi] Failed to start aioncore:', error);
    expect(captureFailure).toHaveBeenCalledWith(error);
    expect(showFailureDialog).toHaveBeenCalledWith(error);
    expect(exitApp).toHaveBeenCalledWith(1);
    expect(calls).toEqual(['capture-start', 'capture-end', 'dialog', 'exit']);
    expect(onStarted).not.toHaveBeenCalled();
  });
});

describe('showBackendStartupFailureDialog', () => {
  const messages = {
    title: 'AionUi Startup Failed',
    message: "AionUi couldn't start the local core service, so the app can't continue.",
    detail: 'Restart the app and try again. If the problem continues, send a diagnostic report with recent logs.',
    sendReport: 'Send Diagnostic Report',
    exit: 'Exit',
    reportSentTitle: 'Diagnostic Report Sent',
    reportSentMessage: 'Thanks. The report includes startup diagnostics and recent logs.',
    reportFailedTitle: 'Report Failed',
    reportFailedMessage: "The diagnostic report couldn't be sent. Please restart AionUi and try again.",
  };

  it('sends a diagnostic report when the user chooses the report button', async () => {
    const error = new Error('aioncore failed to start');
    const showMessageBox = vi.fn().mockResolvedValueOnce({ response: 0 }).mockResolvedValueOnce({ response: 0 });
    const captureDiagnosticReport = vi.fn(async () => {});

    await showBackendStartupFailureDialog(error, messages, {
      showMessageBox,
      captureDiagnosticReport,
    });

    expect(showMessageBox).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'error',
        title: messages.title,
        message: messages.message,
        detail: messages.detail,
        buttons: [messages.sendReport, messages.exit],
        defaultId: 0,
        cancelId: 1,
      })
    );
    expect(captureDiagnosticReport).toHaveBeenCalledWith(error);
    expect(showMessageBox).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'info',
        title: messages.reportSentTitle,
        message: messages.reportSentMessage,
        buttons: [messages.exit],
      })
    );
  });

  it('exits without sending a diagnostic report when the user chooses exit', async () => {
    const showMessageBox = vi.fn().mockResolvedValueOnce({ response: 1 });
    const captureDiagnosticReport = vi.fn();

    await showBackendStartupFailureDialog(new Error('aioncore failed to start'), messages, {
      showMessageBox,
      captureDiagnosticReport,
    });

    expect(captureDiagnosticReport).not.toHaveBeenCalled();
    expect(showMessageBox).toHaveBeenCalledOnce();
  });
});
