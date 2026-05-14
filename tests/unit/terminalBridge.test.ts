/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const registeredProviders: Record<string, Function> = {};
const terminalDataEmit = vi.fn();
const terminalExitEmit = vi.fn();

const ptyState = {
  onDataHandler: undefined as ((data: string) => void) | undefined,
  onExitHandler: undefined as ((event: { exitCode: number; signal?: string | null }) => void) | undefined,
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};

const ptyMock = {
  onData: vi.fn((handler: (data: string) => void) => {
    ptyState.onDataHandler = handler;
  }),
  onExit: vi.fn((handler: (event: { exitCode: number; signal?: string | null }) => void) => {
    ptyState.onExitHandler = handler;
  }),
  write: ptyState.write,
  resize: ptyState.resize,
  kill: ptyState.kill,
};

const spawnMock = vi.fn(() => ptyMock);

vi.mock('@/common', () => ({
  ipcBridge: {
    terminal: {
      createSession: {
        provider: vi.fn((fn: Function) => {
          registeredProviders.createSession = fn;
        }),
      },
      write: {
        provider: vi.fn((fn: Function) => {
          registeredProviders.write = fn;
        }),
      },
      resize: {
        provider: vi.fn((fn: Function) => {
          registeredProviders.resize = fn;
        }),
      },
      dispose: {
        provider: vi.fn((fn: Function) => {
          registeredProviders.dispose = fn;
        }),
      },
      data: {
        emit: (...args: unknown[]) => terminalDataEmit(...args),
      },
      exit: {
        emit: (...args: unknown[]) => terminalExitEmit(...args),
      },
    },
  },
}));

vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

let initTerminalBridge: typeof import('../../src/process/bridge/terminalBridge').initTerminalBridge;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  Object.keys(registeredProviders).forEach((key) => delete registeredProviders[key]);
  ptyState.onDataHandler = undefined;
  ptyState.onExitHandler = undefined;

  const mod = await import('../../src/process/bridge/terminalBridge');
  initTerminalBridge = mod.initTerminalBridge;
});

describe('terminalBridge', () => {
  it('registers terminal providers', () => {
    initTerminalBridge();

    expect(registeredProviders.createSession).toBeDefined();
    expect(registeredProviders.write).toBeDefined();
    expect(registeredProviders.resize).toBeDefined();
    expect(registeredProviders.dispose).toBeDefined();
  });

  it('spawns a PTY session and forwards output events', async () => {
    initTerminalBridge();

    const result = await registeredProviders.createSession({ cwd: '/Users/chixson/Documents/project', cols: 90, rows: 24 });

    expect(result.sessionId).toBeDefined();
    expect(spawnMock).toHaveBeenCalledWith(expect.any(String), [], expect.objectContaining({ cwd: '/Users/chixson/Documents/project', cols: 90, rows: 24 }));

    ptyState.onDataHandler?.('hello');

    expect(terminalDataEmit).toHaveBeenCalledWith({
      sessionId: result.sessionId,
      data: 'hello',
    });
  });

  it('writes, resizes, and disposes the session', async () => {
    initTerminalBridge();

    const result = await registeredProviders.createSession({ cwd: '/Users/chixson/Documents/project' });

    await registeredProviders.write({ sessionId: result.sessionId, data: 'ls\r' });
    await registeredProviders.resize({ sessionId: result.sessionId, cols: 100, rows: 40 });
    await registeredProviders.dispose({ sessionId: result.sessionId });

    expect(ptyState.write).toHaveBeenCalledWith('ls\r');
    expect(ptyState.resize).toHaveBeenCalledWith(100, 40);
    expect(ptyState.kill).toHaveBeenCalled();
  });

  it('emits exit events when the PTY exits', async () => {
    initTerminalBridge();

    const result = await registeredProviders.createSession({ cwd: '/Users/chixson/Documents/project' });

    ptyState.onExitHandler?.({ exitCode: 0, signal: null });

    expect(terminalExitEmit).toHaveBeenCalledWith({
      sessionId: result.sessionId,
      code: 0,
      signal: null,
    });
  });
});
