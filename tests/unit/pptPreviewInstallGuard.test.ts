/**
 * Tests for pptPreviewBridge install failure guard.
 *
 * When officecli is not installed, startWatch tries to auto-install it.
 * After a failed install, subsequent startWatch calls should NOT retry
 * the installation (preventing repeated failures when multiple office
 * files trigger preview simultaneously).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock helpers ────────────────────────────────────────────────────────────

let startHandler: (args: { filePath: string }) => Promise<{ url: string; error?: string }>;
let statusEmits: Array<{ state: string }>;
let execSyncSpy: ReturnType<typeof vi.fn>;

function setupMocks() {
  statusEmits = [];
  execSyncSpy = vi.fn();

  // ipcBridge mock — capture the provider handler so we can call it directly
  vi.doMock('@/common', () => ({
    ipcBridge: {
      pptPreview: {
        status: {
          emit: (evt: { state: string }) => {
            statusEmits.push(evt);
          },
        },
        start: {
          provider: (handler: typeof startHandler) => {
            startHandler = handler;
          },
        },
        stop: { provider: vi.fn() },
      },
    },
  }));

  vi.doMock('@/common/platform', () => ({
    getPlatformServices: () => ({
      paths: { getDataDir: () => '/tmp/test-ppt-data' },
    }),
  }));

  vi.doMock('@process/utils/shellEnv', () => ({
    getEnhancedEnv: () => ({}),
  }));

  // Mock node:fs — statSync throws so checkForUpdate is a no-op
  vi.doMock('node:fs', () => ({
    default: {
      statSync: () => {
        throw new Error('no marker file');
      },
      writeFileSync: vi.fn(),
      realpathSync: (p: string) => p,
      watch: vi.fn(() => ({ close: vi.fn() })),
    },
    statSync: () => {
      throw new Error('no marker file');
    },
    writeFileSync: vi.fn(),
    realpathSync: (p: string) => p,
    watch: vi.fn(() => ({ close: vi.fn() })),
  }));

  // Mock node:net — findFreePort needs createServer().listen() to resolve a port
  vi.doMock('node:net', () => {
    const { EventEmitter } = require('node:events');

    function createServer() {
      const server = new EventEmitter();
      server.listen = (_port: number, _host: string, cb: () => void) => {
        // Simulate binding to a free port
        server.address = () => ({ port: 9999 });
        cb();
      };
      server.close = (cb?: () => void) => cb?.();
      server.address = () => ({ port: 9999 });
      return server;
    }

    return {
      default: { createServer, connect: vi.fn() },
      createServer,
      connect: vi.fn(),
    };
  });

  // Mock child_process — spawn emits ENOENT, execSync tracks install calls
  vi.doMock('node:child_process', () => {
    const { EventEmitter } = require('node:events');

    return {
      spawn: (_cmd: string) => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.exitCode = null;
        child.kill = vi.fn();

        // Emit ENOENT error asynchronously (officecli not found)
        process.nextTick(() => {
          const err = new Error('spawn officecli ENOENT') as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          child.emit('error', err);
        });

        return child;
      },
      execSync: (...args: unknown[]) => {
        execSyncSpy(...args);
        // Fail installation by throwing
        throw new Error('install failed');
      },
    };
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('pptPreviewBridge install guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function loadAndInit() {
    const mod = await import('../../src/process/bridge/pptPreviewBridge');
    mod.initPptPreviewBridge();
    // Advance past the setTimeout(() => checkForUpdate(), 5000) in initPptPreviewBridge
    vi.advanceTimersByTime(6000);
    return mod;
  }

  it('should attempt install on first ENOENT spawn error', async () => {
    await loadAndInit();

    // Trigger a startWatch call via the captured handler
    const result = await startHandler({ filePath: '/workspace/test.pptx' });

    // Install was attempted (execSync was called for the install script)
    expect(execSyncSpy).toHaveBeenCalled();
    // Should have emitted 'installing' status
    expect(statusEmits.some((e) => e.state === 'installing')).toBe(true);
    // Result should indicate failure
    expect(result.error).toBeTruthy();
  });

  it('should NOT retry install after first failure', async () => {
    await loadAndInit();

    // First call — install attempted and fails
    await startHandler({ filePath: '/workspace/file1.pptx' });
    const firstCallCount = execSyncSpy.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(0);

    // Reset status tracking
    statusEmits.length = 0;

    // Second call — install should be skipped
    await startHandler({ filePath: '/workspace/file2.pptx' });

    // execSync call count should NOT increase (no new install attempt)
    expect(execSyncSpy.mock.calls.length).toBe(firstCallCount);
    // Should NOT have emitted 'installing' status on second call
    expect(statusEmits.some((e) => e.state === 'installing')).toBe(false);
  });

  it('should skip install for third concurrent file as well', async () => {
    await loadAndInit();

    // First call — triggers install
    await startHandler({ filePath: '/workspace/a.pptx' });
    const callsAfterFirst = execSyncSpy.mock.calls.length;

    // Second and third calls — no new install
    await startHandler({ filePath: '/workspace/b.pptx' });
    await startHandler({ filePath: '/workspace/c.pptx' });

    expect(execSyncSpy.mock.calls.length).toBe(callsAfterFirst);
  });
});
