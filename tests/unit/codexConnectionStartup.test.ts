import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';

// Mock child_process.spawn to return a controllable fake process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(() => 'codex version 0.40.0'),
}));

// Mock fs.accessSync
vi.mock('fs', () => ({
  accessSync: vi.fn(() => {
    throw new Error('ENOENT');
  }),
}));

// Mock shellEnv utilities
vi.mock('@process/utils/shellEnv', () => ({
  loadFullShellEnvironment: vi.fn(() => ({ PATH: '/usr/bin' })),
  mergePaths: vi.fn((a: string, b: string) => `${a || ''}:${b || ''}`),
}));

// Mock codexLaunchConfig
vi.mock('@process/agent/codex/connection/codexLaunchConfig', () => ({
  applyCodexLaunchOptions: vi.fn((_args: string[]) => ['mcp-server']),
  readUserApprovalPolicyConfig: vi.fn(() => undefined),
}));

// Mock ErrorService
vi.mock('@process/agent/codex/core/ErrorService', () => ({
  globalErrorService: {
    handleError: vi.fn((e: unknown) => e),
    shouldRetry: vi.fn(() => false),
  },
  fromNetworkError: vi.fn((msg: string) => ({ code: 'UNKNOWN', message: msg })),
}));

function createFakeChildProcess(): ChildProcess & EventEmitter {
  const child = new EventEmitter() as ChildProcess & EventEmitter;
  const stdinEmitter = new EventEmitter();
  Object.assign(stdinEmitter, { write: vi.fn(), flushSync: vi.fn() });
  child.stdin = stdinEmitter as unknown as ChildProcess['stdin'];

  const stdoutEmitter = new EventEmitter();
  child.stdout = stdoutEmitter as unknown as ChildProcess['stdout'];

  const stderrEmitter = new EventEmitter();
  child.stderr = stderrEmitter as unknown as ChildProcess['stderr'];

  child.kill = vi.fn(() => true);
  child.killed = false;
  child.pid = 12345;
  return child;
}

describe('CodexConnection.start — startup exit handling', () => {
  let fakeChild: ReturnType<typeof createFakeChildProcess>;

  beforeEach(() => {
    vi.useFakeTimers();
    fakeChild = createFakeChildProcess();
    vi.mocked(spawn).mockReturnValue(fakeChild as unknown as ReturnType<typeof spawn>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects with descriptive error when process is killed by signal (code=null)', async () => {
    const { CodexConnection } = await import('@process/agent/codex/connection/CodexConnection');
    const conn = new CodexConnection();

    const startPromise = conn.start('codex', '/tmp');

    // Attach catch handler before emitting to avoid unhandled rejection warnings
    let caughtError: Error | null = null;
    const handled = startPromise.catch((e: Error) => {
      caughtError = e;
    });

    // Simulate process killed by SIGTERM (code=null, signal=SIGTERM)
    fakeChild.emit('exit', null, 'SIGTERM');

    await vi.advanceTimersByTimeAsync(6000);
    await handled;

    expect(caughtError).toBeTruthy();
    expect(caughtError!.message).toContain('Codex process exited during startup');
    expect(caughtError!.message).toContain('signal: SIGTERM');
  });

  it('rejects with descriptive error when process exits with non-zero code', async () => {
    const { CodexConnection } = await import('@process/agent/codex/connection/CodexConnection');
    const conn = new CodexConnection();

    const startPromise = conn.start('codex', '/tmp');

    let caughtError: Error | null = null;
    const handled = startPromise.catch((e: Error) => {
      caughtError = e;
    });

    // Simulate process crash (code=1)
    fakeChild.emit('exit', 1, null);

    await vi.advanceTimersByTimeAsync(6000);
    await handled;

    expect(caughtError).toBeTruthy();
    expect(caughtError!.message).toContain('Codex process exited during startup');
    expect(caughtError!.message).toContain('code: 1');
  });

  it('resolves when process is still alive after 5 seconds', async () => {
    const { CodexConnection } = await import('@process/agent/codex/connection/CodexConnection');
    const conn = new CodexConnection();

    const startPromise = conn.start('codex', '/tmp');

    // Don't emit exit — process stays alive
    await vi.advanceTimersByTimeAsync(6000);

    await expect(startPromise).resolves.toBeUndefined();
  });
});
