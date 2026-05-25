/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type BackendStartupResult = { ok: true; port: number } | { ok: false };

type StartBackendOrExitOptions = {
  startBackend: () => Promise<number>;
  onStarted: (port: number) => void;
  captureFailure: (error: unknown) => Promise<void> | void;
  showFailureDialog?: (error: unknown) => Promise<void> | void;
  exitApp: (code: number) => void;
  logError?: (message: string, error: unknown) => void;
};

type MessageBoxOptions = {
  type: 'error' | 'info';
  title: string;
  message: string;
  detail?: string;
  buttons: string[];
  defaultId?: number;
  cancelId?: number;
  noLink?: boolean;
};

type MessageBoxResult = {
  response: number;
};

export type BackendStartupFailureDialogMessages = {
  title: string;
  message: string;
  detail: string;
  sendReport: string;
  exit: string;
  reportSentTitle: string;
  reportSentMessage: string;
  reportFailedTitle: string;
  reportFailedMessage: string;
};

type BackendStartupFailureDialogDeps = {
  showMessageBox: (options: MessageBoxOptions) => Promise<MessageBoxResult>;
  captureDiagnosticReport: (error: unknown) => Promise<void>;
  logError?: (message: string, error: unknown) => void;
};

export async function startBackendOrExit(options: StartBackendOrExitOptions): Promise<BackendStartupResult> {
  try {
    const port = await options.startBackend();
    options.onStarted(port);
    return { ok: true, port };
  } catch (error) {
    options.logError?.('[AionUi] Failed to start aioncore:', error);
    await options.captureFailure(error);
    await options.showFailureDialog?.(error);
    options.exitApp(1);
    return { ok: false };
  }
}

export async function showBackendStartupFailureDialog(
  error: unknown,
  messages: BackendStartupFailureDialogMessages,
  deps: BackendStartupFailureDialogDeps
): Promise<void> {
  const result = await deps.showMessageBox({
    type: 'error',
    title: messages.title,
    message: messages.message,
    detail: messages.detail,
    buttons: [messages.sendReport, messages.exit],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (result.response !== 0) {
    return;
  }

  try {
    await deps.captureDiagnosticReport(error);
    await deps.showMessageBox({
      type: 'info',
      title: messages.reportSentTitle,
      message: messages.reportSentMessage,
      buttons: [messages.exit],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  } catch (reportError) {
    deps.logError?.('[AionUi] Failed to send backend startup diagnostic report:', reportError);
    await deps.showMessageBox({
      type: 'error',
      title: messages.reportFailedTitle,
      message: messages.reportFailedMessage,
      buttons: [messages.exit],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  }
}
