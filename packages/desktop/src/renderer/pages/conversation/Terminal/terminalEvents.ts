/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { dispatchWorkspaceEnsureOpenEvent } from '@/renderer/utils/workspace/workspaceEvents';

export const TERMINAL_EXEC_EVENT = 'aionui-terminal-exec';

export type TerminalExecDetail = {
  command: string;
  projectId?: string;
};

export function dispatchTerminalExecEvent(command: string, projectId?: string): void {
  if (typeof window === 'undefined') return;
  dispatchWorkspaceEnsureOpenEvent();
  window.dispatchEvent(
    new CustomEvent<TerminalExecDetail>(TERMINAL_EXEC_EVENT, {
      detail: { command, projectId },
    })
  );
}

export function listenTerminalExecEvent(callback: (detail: TerminalExecDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<TerminalExecDetail>).detail;
    if (detail) {
      callback(detail);
    }
  };
  window.addEventListener(TERMINAL_EXEC_EVENT, handler);
  return () => window.removeEventListener(TERMINAL_EXEC_EVENT, handler);
}
