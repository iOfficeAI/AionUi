/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ChildProcess } from 'child_process';
import { spawn, spawnSync } from 'child_process';
import { once } from 'events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AcpConnection } from '../../src/agent/acp/AcpConnection';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPidFile(pidFile: string, timeoutMs: number): Promise<number> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const pid = Number(readFileSync(pidFile, 'utf-8').trim());
      if (Number.isInteger(pid) && pid > 0) {
        return pid;
      }
    } catch {
      // PID file not ready yet
    }

    await sleep(50);
  }

  throw new Error(`Timed out waiting for PID file: ${pidFile}`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exitPromise = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;

  await Promise.race([
    exitPromise.then(function onExit(): void {
      return;
    }),
    sleep(timeoutMs).then(() => {
      throw new Error(`Timed out waiting for shell process ${child.pid} to exit`);
    }),
  ]);
}

function forceKillTree(pid: number | undefined): void {
  if (!pid || pid <= 0) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process already exited
  }
}

describe('AcpConnection disconnect', () => {
  const itWindows = process.platform === 'win32' ? it : it.skip;

  itWindows(
    'kills shell-spawned ACP CLI process tree on Windows',
    async () => {
      const tempDir = join(tmpdir(), `acp-disconnect-${process.pid}`);
      rmSync(tempDir, { recursive: true, force: true });
      mkdirSync(tempDir, { recursive: true });
      const pidFile = join(tempDir, 'cli.pid');
      const cliScriptPath = join(tempDir, 'keepalive.js');

      const cliScript = `const fs=require('fs');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`;
      writeFileSync(cliScriptPath, cliScript, 'utf-8');

      const shellProcess = spawn(process.execPath, [cliScriptPath], {
        shell: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      });

      const connection = new AcpConnection();
      let cliPid: number | null = null;

      try {
        cliPid = await waitForPidFile(pidFile, 10000);

        (connection as unknown as { child: ChildProcess | null }).child = shellProcess;
        await connection.disconnect();

        await waitForExit(shellProcess, 8000);
        await sleep(300);

        expect(isProcessAlive(cliPid)).toBe(false);
      } finally {
        forceKillTree(cliPid ?? undefined);
        forceKillTree(shellProcess.pid);
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    20000
  );
});
