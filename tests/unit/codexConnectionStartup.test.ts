import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Create a factory for mock child processes
function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
  });
  return child;
}

let lastChild: ReturnType<typeof createMockChild>;

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    lastChild = createMockChild();
    return lastChild;
  }),
  execSync: vi.fn(() => 'codex version 0.40.0'),
}));

vi.mock('fs', () => ({
  accessSync: vi.fn(() => {
    throw new Error('ENOENT');
  }),
}));

vi.mock('@process/utils/shellEnv', () => ({
  loadFullShellEnvironment: vi.fn(() => ({ PATH: '/usr/bin' })),
  mergePaths: vi.fn((a?: string, b?: string) => `${a || ''}:${b || ''}`),
}));

vi.mock('@process/agent/codex/connection/codexLaunchConfig', () => ({
  applyCodexLaunchOptions: vi.fn((_args: string[]) => ['mcp-server']),
  readUserApprovalPolicyConfig: vi.fn(() => undefined),
}));

vi.mock('@process/agent/codex/core/ErrorService', () => ({
  globalErrorService: {
    handleError: vi.fn((e: unknown) => e),
    shouldRetry: vi.fn(() => false),
  },
  fromNetworkError: vi.fn((msg: string) => ({ code: 'UNKNOWN', message: msg, userMessage: msg })),
}));

vi.mock('@/common/types/acpTypes', () => ({
  JSONRPC_VERSION: '2.0',
}));

import { CodexConnection } from '@process/agent/codex/connection/CodexConnection';

describe('CodexConnection.start', () => {
  let conn: CodexConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    conn = new CodexConnection();
  });

  it('rejects immediately with exit code when process exits during startup', async () => {
    const startPromise = conn.start('codex', '/tmp');

    // Simulate process exiting with code 1 during startup (before 5s timeout)
    lastChild.emit('exit', 1, null);

    await expect(startPromise).rejects.toThrow('Codex process exited during startup (code: 1, signal: none)');
  });

  it('rejects with specific message when spawn emits error event', async () => {
    const startPromise = conn.start('codex', '/tmp');

    lastChild.emit('error', new Error('spawn ENOENT'));

    await expect(startPromise).rejects.toThrow('Failed to start codex process: spawn ENOENT');
  });

  it('resolves when process stays alive past startup timeout', async () => {
    vi.useFakeTimers();

    const startPromise = conn.start('codex', '/tmp');

    // Advance past the 5-second startup timeout
    vi.advanceTimersByTime(5000);

    await expect(startPromise).resolves.toBeUndefined();

    vi.useRealTimers();
  });
});
