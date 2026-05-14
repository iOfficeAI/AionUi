/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { spawn, type IPty } from 'node-pty';
import { randomUUID } from 'node:crypto';

type TerminalSession = {
  pty: IPty;
  cwd: string;
};

const sessions = new Map<string, TerminalSession>();

const getDefaultShell = (): string => {
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/zsh';
};

const disposeSession = (sessionId: string): void => {
  const session = sessions.get(sessionId);
  if (!session) return;

  sessions.delete(sessionId);
  try {
    session.pty.kill();
  } catch (error) {
    console.warn(`[terminalBridge] Failed to kill terminal session ${sessionId}:`, error);
  }
};

export function disposeAllTerminalSessions(): void {
  for (const sessionId of sessions.keys()) {
    disposeSession(sessionId);
  }
}

export function initTerminalBridge(): void {
  ipcBridge.terminal.createSession.provider(async ({ cwd, cols = 120, rows = 30 }) => {
    const sessionId = randomUUID();
    const shellPath = getDefaultShell();

    const ptyProcess = spawn(shellPath, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    });

    const session: TerminalSession = { pty: ptyProcess, cwd };
    sessions.set(sessionId, session);

    ptyProcess.onData((data) => {
      ipcBridge.terminal.data.emit({ sessionId, data });
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      sessions.delete(sessionId);
      ipcBridge.terminal.exit.emit({
        sessionId,
        code: exitCode,
        signal: signal ?? null,
      });
    });

    return { sessionId };
  });

  ipcBridge.terminal.write.provider(async ({ sessionId, data }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.pty.write(data);
  });

  ipcBridge.terminal.resize.provider(async ({ sessionId, cols, rows }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.pty.resize(cols, rows);
  });

  ipcBridge.terminal.dispose.provider(async ({ sessionId }) => {
    disposeSession(sessionId);
  });
}
