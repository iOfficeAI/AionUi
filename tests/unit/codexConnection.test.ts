/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChildProcess } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { execFileMock, spawnMock, execSyncMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
  execSyncMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock,
  execSync: execSyncMock,
}));

describe('CodexConnection stop cleanup', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.restoreAllMocks();
    execFileMock.mockReset();
    spawnMock.mockReset();
    execSyncMock.mockReset();
  });

  it('uses taskkill tree termination on Windows', async () => {
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(((
      pid: number,
      signal?: number | NodeJS.Signals
    ) => {
      if (signal === 0) {
        throw new Error(`Process ${pid} already exited`);
      }

      return true;
    }) as typeof process.kill);

    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null);
    });

    const { terminateCodexChildProcess } = await import('../../src/process/agent/codex/connection/CodexConnection');

    const child = {
      pid: 4321,
      kill: vi.fn(),
    } as unknown as ChildProcess;

    await terminateCodexChildProcess(child, 'win32');

    expect(execFileMock).toHaveBeenCalledWith(
      'taskkill',
      ['/PID', '4321', '/T', '/F'],
      expect.objectContaining({
        windowsHide: true,
        timeout: 5000,
      }),
      expect.any(Function)
    );
    expect(child.kill).not.toHaveBeenCalled();
    expect(processKillSpy).toHaveBeenCalledWith(4321, 0);
  });

  it('clears pending runtime state when stop is called', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(((
      pid: number,
      signal?: number | NodeJS.Signals
    ) => {
      if (signal === 0) {
        throw new Error(`Process ${pid} already exited`);
      }

      return true;
    }) as typeof process.kill);

    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null);
    });

    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const { CodexConnection } = await import('../../src/process/agent/codex/connection/CodexConnection');

    const connection = new CodexConnection();
    const pendingReject = vi.fn();
    const pausedReject = vi.fn();
    const resolverReject = vi.fn();
    const pendingTimeout = setTimeout(() => undefined, 10000);
    const pausedTimeout = setTimeout(() => undefined, 10000);
    const managedTimeout = setTimeout(() => undefined, 10000);

    const child = {
      pid: 8765,
      kill: vi.fn(),
      removeAllListeners: vi.fn(),
      stdout: {
        removeAllListeners: vi.fn(),
      },
      stderr: {
        removeAllListeners: vi.fn(),
      },
      stdin: {
        removeAllListeners: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      },
    } as unknown as ChildProcess;

    const connectionState = connection as unknown as {
      child: ChildProcess | null;
      pending: Map<
        number,
        { resolve: (value: unknown) => void; reject: (error: unknown) => void; timeout?: NodeJS.Timeout }
      >;
      elicitationMap: Map<string, number>;
      pendingAutoApprovals: Map<string, string>;
      pausedRequests: Array<{
        method: string;
        params: unknown;
        resolve: (value: unknown) => void;
        reject: (error: unknown) => void;
        timeout: NodeJS.Timeout;
      }>;
      permissionResolvers: Map<string, { resolve: (approved: boolean) => void; reject: (error: Error) => void }>;
      isPaused: boolean;
      retryCount: number;
      isNetworkError: boolean;
      managedTimeouts: Set<NodeJS.Timeout>;
    };

    connectionState.child = child;
    connectionState.pending.set(1, {
      resolve: vi.fn(),
      reject: pendingReject,
      timeout: pendingTimeout,
    });
    connectionState.elicitationMap.set('call-1', 1);
    connectionState.pendingAutoApprovals.set('call-1', 'approved');
    connectionState.pausedRequests = [
      {
        method: 'ping',
        params: {},
        resolve: vi.fn(),
        reject: pausedReject,
        timeout: pausedTimeout,
      },
    ];
    connectionState.permissionResolvers.set('call-2', {
      resolve: vi.fn(),
      reject: resolverReject,
    });
    connectionState.isPaused = true;
    connectionState.retryCount = 3;
    connectionState.isNetworkError = true;
    connectionState.managedTimeouts.add(managedTimeout);

    await connection.stop();

    expect(connection.getDiagnostics()).toEqual({
      isConnected: false,
      childProcess: false,
      pendingRequests: 0,
      elicitationCount: 0,
      isPaused: false,
      retryCount: 0,
      hasNetworkError: false,
    });
    expect(pendingReject).toHaveBeenCalledWith(expect.any(Error));
    expect(pausedReject).toHaveBeenCalledWith(expect.any(Error));
    expect(resolverReject).toHaveBeenCalledWith(expect.any(Error));
    expect(clearTimeoutSpy).toHaveBeenCalledWith(pendingTimeout);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(pausedTimeout);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(managedTimeout);
    expect(execFileMock).toHaveBeenCalledWith(
      'taskkill',
      ['/PID', '8765', '/T', '/F'],
      expect.objectContaining({
        windowsHide: true,
        timeout: 5000,
      }),
      expect.any(Function)
    );
    expect(processKillSpy).toHaveBeenCalledWith(8765, 0);
  });
});
