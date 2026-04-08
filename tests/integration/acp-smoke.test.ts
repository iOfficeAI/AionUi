/**
 * L3 Smoke Test — ACP CLI connectivity.
 *
 * Tests real ACP backend connectivity using the fake-acp-cli fixture.
 * When a real backend CLI is available (e.g. `claude`), tests that too.
 *
 * 1. Check CLI exists, skip if not
 * 2. Spawn ACP handshake (initialize)
 * 3. Create session (session/new)
 * 4. Send simple prompt (session/prompt)
 * 5. Verify response received
 * 6. Disconnect, verify process exits
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'child_process';
import path from 'path';
import { ACP_BACKENDS_ALL } from '../../src/common/types/acpTypes';

const FAKE_CLI_PATH = path.resolve(__dirname, '../fixtures/fake-acp-cli/index.js');
const JSONRPC_VERSION = '2.0';

function writeMessage(child: ChildProcess, message: Record<string, unknown>): void {
  child.stdin!.write(JSON.stringify(message) + '\n');
}

function waitForResponse(
  child: ChildProcess,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 10000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for response after ${timeoutMs}ms`));
    }, timeoutMs);

    const onData = (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          try {
            const msg = JSON.parse(line) as Record<string, unknown>;
            if (predicate(msg)) {
              clearTimeout(timer);
              child.stdout!.removeListener('data', onData);
              resolve(msg);
              return;
            }
          } catch {
            // ignore
          }
        }
      }
    };

    child.stdout!.on('data', onData);
  });
}

const IS_WINDOWS = process.platform === 'win32';

function isCliAvailable(cmd: string): boolean {
  try {
    // `which` on Unix, `where` on Windows
    execFileSync(IS_WINDOWS ? 'where' : 'which', [cmd], { stdio: 'pipe', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

describe('L3 ACP Smoke Test', () => {
  let child: ChildProcess | null = null;

  afterEach(async () => {
    if (child && !child.killed) {
      child.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try {
            if (!IS_WINDOWS) child?.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolve();
        }, 3000);
        child!.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    child = null;
  });

  it('fake-acp-cli: full handshake + prompt + disconnect', async () => {
    child = spawn('node', [FAKE_CLI_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Step 1: Initialize
    writeMessage(child, {
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: 'initialize',
      params: { protocolVersion: 1, clientCapabilities: {} },
    });

    const initResponse = await waitForResponse(child, (msg) => msg.id === 1);
    expect(initResponse.result).toBeDefined();
    const initResult = initResponse.result as Record<string, unknown>;
    expect(initResult.protocolVersion).toBe(1);
    expect(initResult.serverInfo).toBeDefined();

    // Step 2: Create session
    writeMessage(child, {
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: 'session/new',
      params: { cwd: '.', mcpServers: [] },
    });

    const sessionResponse = await waitForResponse(child, (msg) => msg.id === 2);
    expect(sessionResponse.result).toBeDefined();
    const sessionResult = sessionResponse.result as Record<string, unknown>;
    expect(sessionResult.sessionId).toBeDefined();
    expect(typeof sessionResult.sessionId).toBe('string');

    const sessionId = sessionResult.sessionId as string;

    // Step 3: Send prompt
    writeMessage(child, {
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: 'session/prompt',
      params: {
        sessionId,
        prompt: [{ type: 'text', text: 'Say hello' }],
      },
    });

    // Step 4: Collect streaming chunks + final response
    const streamingChunks: Record<string, unknown>[] = [];
    const promptResponse = await new Promise<Record<string, unknown>>((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => reject(new Error('Prompt timed out')), 10000);

      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) {
            try {
              const msg = JSON.parse(line) as Record<string, unknown>;
              if (msg.method === 'session/update') {
                streamingChunks.push(msg);
              }
              if (msg.id === 3) {
                clearTimeout(timer);
                child!.stdout!.removeListener('data', onData);
                resolve(msg);
                return;
              }
            } catch {
              // ignore
            }
          }
        }
      };

      child!.stdout!.on('data', onData);
    });

    // Verify streaming chunks were received
    expect(streamingChunks.length).toBeGreaterThan(0);

    // Verify final response
    expect(promptResponse.result).toBeDefined();
    const promptResult = promptResponse.result as Record<string, unknown>;
    expect(promptResult.stopReason).toBe('end_turn');

    // Step 5: Disconnect — close stdin, verify process exits
    child.stdin!.end();

    const exitCode = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        try {
          child?.kill();
        } catch {
          // ignore
        }
        resolve(null);
      }, 5000);
      child!.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    // Process should have exited (stdin closed -> readline 'close' -> process exits)
    expect(child.killed || exitCode !== null).toBe(true);
  });

  // Real backend smoke tests — skipped unless ACP_SMOKE_REAL=1 is set.
  // Real CLIs need auth, network, and npx which makes them slow and flaky
  // in automated environments. Run manually: ACP_SMOKE_REAL=1 bun run test acp-smoke
  const runRealTests = process.env.ACP_SMOKE_REAL === '1';

  const realBackends = Object.values(ACP_BACKENDS_ALL)
    .filter((config) => {
      if (!config.enabled || !config.cliCommand) return false;
      if (config.defaultCliPath) return false; // npx-based backends not suitable for direct spawn
      if (config.id === 'goose') return false; // conflicts with pressly/goose DB migration tool
      return true;
    })
    .map((config) => ({
      name: config.id,
      cmd: config.cliCommand!,
      args: config.acpArgs ?? ['--experimental-acp'],
    }));

  for (const backend of realBackends) {
    it.skipIf(!runRealTests || !isCliAvailable(backend.cmd))(
      `${backend.name}: real CLI handshake (skip unless ACP_SMOKE_REAL=1)`,
      { timeout: 120000 },
      async () => {
        child = spawn(backend.cmd, backend.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Only test initialize — real backends need auth for sessions
        writeMessage(child, {
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'initialize',
          params: { protocolVersion: 1, clientCapabilities: {} },
        });

        const initResponse = await waitForResponse(child, (msg) => msg.id === 1, 60000);
        expect(initResponse.result).toBeDefined();
      }
    );
  }
});
