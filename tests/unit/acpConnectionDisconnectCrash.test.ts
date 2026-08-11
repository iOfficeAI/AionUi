import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

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

// Mock killChild to simulate process exit synchronously
const mockKillChild = vi.fn();
vi.mock('@process/agent/acp/utils', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/process/agent/acp/utils')>();
  return { ...orig, killChild: (...args: unknown[]) => mockKillChild(...args) };
});

vi.mock('@process/agent/acp/acpConnectors', () => ({
  ACP_PERF_LOG: false,
  spawnGenericBackend: vi.fn(),
  connectClaude: vi.fn(),
  connectCodebuddy: vi.fn(),
  connectCodex: vi.fn(),
  prepareCleanEnv: vi.fn(async () => ({})),
}));

import { AcpConnection } from '../../src/process/agent/acp/AcpConnection';

/** Create a minimal fake ChildProcess with an EventEmitter for 'exit' events */
function createFakeChild(): ChildProcess & EventEmitter {
  const emitter = new EventEmitter();
  const child = emitter as unknown as ChildProcess & EventEmitter;

  Object.defineProperty(child, 'stdout', { value: new EventEmitter(), writable: true });
  Object.defineProperty(child, 'stderr', { value: new EventEmitter(), writable: true });
  Object.defineProperty(child, 'stdin', { value: null, writable: true });
  Object.defineProperty(child, 'pid', { value: 99999, writable: true });
  Object.defineProperty(child, 'killed', { value: false, writable: true });
  child.kill = vi.fn(() => true);

  return child;
}

type AcpConnectionInternal = {
  child: ChildProcess | null;
  isSetupComplete: boolean;
  isDetached: boolean;
  handleProcessExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  onDisconnect: (error: { code: number | null; signal: NodeJS.Signals | null }) => void;
};

/**
 * Attach a runtime exit handler to the child process, mirroring the behavior
 * of setupChildProcessHandlers() for the runtime phase. This lets us test
 * whether disconnect() prevents the runtime crash path.
 */
function attachRuntimeExitHandler(child: ChildProcess & EventEmitter, internal: AcpConnectionInternal): void {
  child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    if (internal.isSetupComplete) {
      // Runtime exit path — handleProcessExit → onDisconnect (agentCrash)
      internal.handleProcessExit(code, signal);
    }
    // Startup path — no-op (processExitReject already nulled after initial setup)
  });
}

describe('AcpConnection.disconnect() — controlled shutdown vs crash', () => {
  let conn: AcpConnection;
  let internal: AcpConnectionInternal;

  beforeEach(() => {
    vi.clearAllMocks();
    conn = new AcpConnection();
    internal = conn as unknown as AcpConnectionInternal;
  });

  it('does not trigger onDisconnect (agentCrash) during controlled disconnect', async () => {
    const child = createFakeChild();
    internal.child = child;
    internal.isSetupComplete = true;
    internal.isDetached = false;

    const onDisconnect = vi.fn();
    internal.onDisconnect = onDisconnect;

    // Attach exit handler that mirrors setupChildProcessHandlers runtime behavior
    attachRuntimeExitHandler(child, internal);

    // Mock killChild: simulate process exiting during kill (exit event fires
    // while killChild is still executing, before terminateChild returns)
    mockKillChild.mockImplementation(async () => {
      child.emit('exit', null, 'SIGTERM');
    });

    await conn.disconnect();

    // The fix: disconnect() sets isSetupComplete = false BEFORE terminateChild(),
    // so the exit handler sees isSetupComplete === false and skips handleProcessExit.
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('onDisconnect IS called when process exits unexpectedly at runtime', async () => {
    const child = createFakeChild();
    internal.child = child;
    internal.isSetupComplete = true;
    internal.isDetached = false;

    const onDisconnect = vi.fn();
    internal.onDisconnect = onDisconnect;

    // Attach exit handler
    attachRuntimeExitHandler(child, internal);

    // Simulate the child process exiting unexpectedly (no disconnect() call)
    child.emit('exit', null, 'SIGTERM');

    // Runtime exit should trigger onDisconnect → agentCrash
    expect(onDisconnect).toHaveBeenCalledWith({ code: null, signal: 'SIGTERM' });
  });
});
