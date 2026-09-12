/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type TerminalCreateOptions = {
  id: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  shell?: string;
};

export type TerminalSessionInfo = {
  id: string;
  shell: string;
  cwd: string;
};

export type TerminalWriteOptions = {
  id: string;
  data: string;
};

export type TerminalResizeOptions = {
  id: string;
  cols: number;
  rows: number;
};

export type TerminalKillOptions = {
  id: string;
};

export type TerminalDataEvent = {
  id: string;
  data: string;
};

export type TerminalExitEvent = {
  id: string;
  exitCode: number;
  signal?: number;
};

export type TerminalProcessInstance = {
  write: (data: string) => void;
  resize?: (cols: number, rows: number) => void;
  kill: () => void;
  cwd: string;
  shell: string;
};
