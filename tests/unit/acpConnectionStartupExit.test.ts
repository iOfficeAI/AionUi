/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// Mock external dependencies before importing
vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getNpxCacheDir: vi.fn(() => '/tmp/npx'),
  getWindowsShellExecutionOptions: vi.fn(() => ({})),
  resolveNpxPath: vi.fn(() => 'npx'),
}));

const mockSpawnGenericBackend = vi.fn();
vi.mock('@process/agent/acp/acpConnectors', () => ({
  spawnGenericBackend: (...args: unknown[]) => mockSpawnGenericBackend(...args),
  connectClaude: vi.fn(),
  connectCodebuddy: vi.fn(),
  connectCodex: vi.fn(),
  prepareCleanEnv: vi.fn(async () => ({})),
}));

import { AcpConnection } from '../../src/process/agent/acp/AcpConnection';

/**
 * Create a fake ChildProcess backed by an EventEmitter.
 * exitCode/exitSignal are emitted after a short delay to simulate real process behavior.
 */
function createFakeChild(
  exitCode: number,
  exitSignal: NodeJS.Signals | null = null,
  stderrOutput?: string
): ChildProcess & EventEmitter {
  const emitter = new EventEmitter();
  const child = emitter as unknown as ChildProcess & EventEmitter;

  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  Object.defineProperty(child, 'stdout', { value: stdoutEmitter, writable: true });
  Object.defineProperty(child, 'stderr', { value: stderrEmitter, writable: true });
  Object.defineProperty(child, 'stdin', { value: null, writable: true });
  Object.defineProperty(child, 'pid', { value: 12345, writable: true });
  Object.defineProperty(child, 'killed', { value: false, writable: true });
  child.kill = vi.fn(() => true);

  // Schedule stderr + exit after handlers are attached
  setImmediate(() => {
    if (stderrOutput) {
      stderrEmitter.emit('data', Buffer.from(stderrOutput));
    }
    // Small delay after stderr so it's captured before exit
    setTimeout(() => {
      emitter.emit('exit', exitCode, exitSignal);
    }, 10);
  });

  return child;
}

/**
 * Create a fake ChildProcess that emits an 'error' event (e.g. ENOENT)
 * followed by an 'exit' event, simulating a missing CLI binary.
 */
function createFakeChildWithSpawnError(errCode: string): ChildProcess & EventEmitter {
  const emitter = new EventEmitter();
  const child = emitter as unknown as ChildProcess & EventEmitter;

  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  Object.defineProperty(child, 'stdout', { value: stdoutEmitter, writable: true });
  Object.defineProperty(child, 'stderr', { value: stderrEmitter, writable: true });
  Object.defineProperty(child, 'stdin', { value: null, writable: true });
  Object.defineProperty(child, 'pid', { value: undefined, writable: true });
  Object.defineProperty(child, 'killed', { value: false, writable: true });
  Object.defineProperty(child, 'exitCode', { value: null, writable: true });
  Object.defineProperty(child, 'signalCode', { value: null, writable: true });
  child.kill = vi.fn(() => true);

  // Simulate spawn failure: error fires first, then exit
  setImmediate(() => {
    const err = new Error(`spawn /usr/local/bin/codex ENOENT`) as NodeJS.ErrnoException;
    err.code = errCode;
    emitter.emit('error', err);
    emitter.emit('exit', null, null);
  });

  return child;
}

describe('AcpConnection - startup exit error messages', () => {
  let conn: AcpConnection;

  beforeEach(() => {
    conn = new AcpConnection();
    mockSpawnGenericBackend.mockReset();
  });

  it('should include ACP version hint when process exits with code 0 and no stderr', async () => {
    const child = createFakeChild(0);
    mockSpawnGenericBackend.mockResolvedValue({ child, isDetached: false });

    await expect(conn.connect('qwen', '/usr/local/bin/qwen', '/tmp/workspace')).rejects.toThrow(
      /does not support ACP mode/
    );
  });

  it('should include stderr content when process exits with code 0 and has stderr', async () => {
    const child = createFakeChild(0, null, 'some error output');
    mockSpawnGenericBackend.mockResolvedValue({ child, isDetached: false });

    await expect(conn.connect('qwen', '/usr/local/bin/qwen', '/tmp/workspace')).rejects.toThrow(
      /ACP process exited during startup \(code: 0\)/
    );
  });

  it('should show generic message when process exits with non-zero code and no stderr', async () => {
    const child = createFakeChild(1);
    mockSpawnGenericBackend.mockResolvedValue({ child, isDetached: false });

    await expect(conn.connect('qwen', '/usr/local/bin/qwen', '/tmp/workspace')).rejects.toThrow(
      /ACP process exited during startup \(code: 1, signal: null\)/
    );
  });

  it('should not cause unhandled rejection when CLI binary is missing (ENOENT)', async () => {
    // Regression test for ELECTRON-GC: when spawn emits 'error' with ENOENT,
    // the processExitPromise was rejected with no handler, causing an
    // unhandled promise rejection reported to Sentry.
    const unhandledRejections: unknown[] = [];
    const handler = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', handler);

    const child = createFakeChildWithSpawnError('ENOENT');
    mockSpawnGenericBackend.mockResolvedValue({ child, isDetached: false });

    await expect(conn.connect('qwen', '/usr/local/bin/codex', '/tmp/workspace')).rejects.toThrow(/CLI not found/);

    // Give microtasks time to flush — an unhandled rejection fires asynchronously
    await new Promise((resolve) => setTimeout(resolve, 50));

    process.off('unhandledRejection', handler);
    expect(unhandledRejections).toHaveLength(0);
  });
});
