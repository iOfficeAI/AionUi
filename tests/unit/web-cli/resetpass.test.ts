/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http, { type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

describe('resetpass development script', () => {
  let child: ChildProcessWithoutNullStreams | null = null;
  let server: Server | null = null;
  let dataDir = '';

  afterEach(async () => {
    child?.kill('SIGKILL');
    child = null;
    const activeServer = server;
    if (activeServer) {
      await new Promise<void>((resolve) => activeServer.close(() => resolve()));
      server = null;
    }
    if (dataDir) {
      await fs.rm(dataDir, { recursive: true, force: true });
      dataDir = '';
    }
  });

  it('refuses to reset through a running public WebUI', async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-resetpass-'));
    const mockServer = http.createServer((req, res) => {
      if (req.url === '/api/auth/status') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }
      res.writeHead(404).end();
    });
    server = mockServer;
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()));
    const address = mockServer.address();
    if (!address || typeof address === 'string') throw new Error('mock WebUI did not bind to a TCP port');

    const spawnedChild = spawn('bun', ['run', 'scripts/resetpass.ts', '--port', String(address.port)], {
      cwd: process.cwd(),
      env: { ...process.env, AIONUI_DATA_DIR: dataDir },
      stdio: 'pipe',
    });
    child = spawnedChild;
    let output = '';
    spawnedChild.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    spawnedChild.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('resetpass script did not exit')), 5_000);
      spawnedChild.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      spawnedChild.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    expect(exitCode).toBe(1);
    expect(output).toContain('Stop it before resetting the password.');
    expect(output).not.toContain('New password:');
  });
});
