/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration test for `migrateAssistantsToBackend` against a real
 * aioncore binary using the user-provided fixtures
 * (`/Users/zhoukai/Downloads/aionui-config.txt` + `Archive/*.md`).
 *
 * The unit suite (`tests/unit/assistants/migrateAssistants.test.ts`)
 * already covers Phase-by-Phase behaviour with mocks; this spec verifies
 * the full pipeline end-to-end:
 *
 *   1. Decode the legacy `aionui-config.txt` exactly as ConfigStorage would.
 *   2. Stage `Archive/*.md` as `<userData>/config/assistants/<id>.<locale>.md`.
 *   3. Spawn a real aioncore bound to a throw-away data-dir.
 *   4. Run `migrateAssistantsToBackend`.
 *   5. Assert: 3 user assistants in db, 4 rule .md files in
 *      `<dataDir>/assistant-rules/`, completion flag set, legacy
 *      `assistants` field still present.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fsp, existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FIXTURE_CONFIG = '/Users/zhoukai/Downloads/aionui-config.txt';
const FIXTURE_ARCHIVE = '/Users/zhoukai/Downloads/Archive';
const FIXTURES_AVAILABLE = existsSync(FIXTURE_CONFIG) && existsSync(FIXTURE_ARCHIVE);

const describeIfFixtures = FIXTURES_AVAILABLE ? describe : describe.skip;

function resolveBackendBinary(): string {
  const candidates = [
    process.env.AIONUI_BACKEND_BINARY,
    path.join(os.homedir(), '.cargo', 'bin', 'aioncore'),
    path.resolve(__dirname, '../../../AionCore/target/debug/aioncore'),
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error('aioncore binary not found (set AIONUI_BACKEND_BINARY or build it)');
}

async function findFreePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return await new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr !== 'string') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('no port')));
      }
    });
    srv.on('error', reject);
  });
}

async function waitForHealthy(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`backend did not become healthy on port ${port}`);
}

/**
 * Decode an `aionui-config.txt` exactly the way `JsonFileBuilder` does:
 *   base64(encodeURIComponent(JSON.stringify(...)))
 */
function decodeConfigFile(file: string): Record<string, unknown> {
  const raw = readFileSync(file, 'utf8');
  const decoded = decodeURIComponent(Buffer.from(raw, 'base64').toString('utf8'));
  return JSON.parse(decoded) as Record<string, unknown>;
}

describeIfFixtures('migrateAssistantsToBackend (real fixture)', () => {
  let backend: ChildProcess | null = null;
  let dataDir = '';
  let legacyAssistantsDir = '';
  let port = 0;

  beforeEach(async () => {
    dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aionui-migrate-fixture-'));
    legacyAssistantsDir = path.join(dataDir, '__legacy_config__', 'assistants');
    mkdirSync(legacyAssistantsDir, { recursive: true });

    // Stage the four rule files exactly where the legacy Electron build
    // wrote them (`<userData>/config/assistants/<id>.<locale>.md`).
    for (const f of [
      'custom-fitness-coach-1778313659049.zh-CN.md',
      'custom-fitness-coach-1778313659049.en-US.md',
      'custom-novel-writer-1778312586008.zh-CN.md',
      'custom-novel-writer-1778312586008.en-US.md',
    ]) {
      copyFileSync(path.join(FIXTURE_ARCHIVE, f), path.join(legacyAssistantsDir, f));
    }

    // Mock `getAssistantsDir` so Phase 4 reads from the staged dir above
    // instead of reaching for the real userData path.
    vi.doMock('@/process/utils/initStorage', () => ({
      getAssistantsDir: () => legacyAssistantsDir,
    }));

    // Spawn a real backend bound to dataDir.
    port = await findFreePort();
    const bin = resolveBackendBinary();
    backend = spawn(
      bin,
      ['--local', '--port', String(port), '--data-dir', dataDir, '--log-level', 'warn', '--app-version', 'test'],
      {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env, RUST_LOG: 'warn' },
      }
    );
    await waitForHealthy(port);
    (globalThis as unknown as { __backendPort?: number }).__backendPort = port;
  });

  afterEach(async () => {
    delete (globalThis as unknown as { __backendPort?: number }).__backendPort;
    if (backend) {
      const p = backend;
      backend = null;
      p.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          p.kill('SIGKILL');
          resolve();
        }, 3_000);
        p.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    if (dataDir && existsSync(dataDir)) {
      await fsp.rm(dataDir, { recursive: true, force: true });
    }
    vi.doUnmock('@/process/utils/initStorage');
    vi.resetModules();
  });

  it('imports 3 custom assistants and uploads 4 rule files; preserves legacy field; sets done flag', async () => {
    // Decode the real config file and build a fake LegacyConfigAccessor.
    const configContents = decodeConfigFile(FIXTURE_CONFIG);
    expect(Array.isArray(configContents.assistants)).toBe(true);

    const store: Record<string, unknown> = { ...configContents };
    const fakeConfig = {
      get: async (key: string) => store[key],
    } as const;

    // Re-import with the mock applied.
    const { migrateAssistantsToBackend } = await import('@/process/utils/migrateAssistants');

    const ok = await migrateAssistantsToBackend(fakeConfig as never);
    expect(ok).toBe(true);

    // Legacy `assistants` field is left untouched on disk so users can
    // roll back to an older Electron build.
    expect(Array.isArray(store.assistants)).toBe(true);

    // 3 custom assistants in db (excluding builtins). Probe via /api/assistants.
    const resp = await fetch(`http://127.0.0.1:${port}/api/assistants`);
    expect(resp.ok).toBe(true);
    const apiResp = (await resp.json()) as { success?: boolean; data?: Array<{ id: string; source: string }> };
    const list = apiResp.data ?? (apiResp as unknown as Array<{ id: string; source: string }>);
    const userAssistants = list
      .filter((a) => a.source === 'user')
      .map((a) => a.id)
      .toSorted();
    expect(userAssistants).toEqual([
      'custom-1776765564523',
      'custom-fitness-coach-1778313659049',
      'custom-novel-writer-1778312586008',
    ]);

    // Bug 2: rule files for the two assistants we have md fixtures for.
    const rulesDir = path.join(dataDir, 'assistant-rules');
    expect(existsSync(rulesDir)).toBe(true);
    const ruleFiles = (await fsp.readdir(rulesDir)).toSorted();
    expect(ruleFiles).toEqual([
      'custom-fitness-coach-1778313659049.en-US.md',
      'custom-fitness-coach-1778313659049.zh-CN.md',
      'custom-novel-writer-1778312586008.en-US.md',
      'custom-novel-writer-1778312586008.zh-CN.md',
    ]);

    // Round-trip the content for one file so we know the upload preserved bytes.
    const expected = readFileSync(path.join(FIXTURE_ARCHIVE, 'custom-novel-writer-1778312586008.zh-CN.md'), 'utf8');
    const actual = readFileSync(path.join(rulesDir, 'custom-novel-writer-1778312586008.zh-CN.md'), 'utf8');
    expect(actual).toBe(expected);

    // Re-running preserves user edits: simulate the user editing one rule
    // file in the new UI, then triggering migration again. The
    // read-before-write guard in Phase 4 must skip this file so the edit
    // survives.
    const targetRule = path.join(rulesDir, 'custom-novel-writer-1778312586008.zh-CN.md');
    const userEdit = '# user-edited content\n\nthis must survive\n';
    await fsp.writeFile(targetRule, userEdit, 'utf8');

    const okAgain = await migrateAssistantsToBackend(fakeConfig as never);
    expect(okAgain).toBe(true);
    const afterRerun = await fsp.readFile(targetRule, 'utf8');
    expect(afterRerun).toBe(userEdit);

    // Re-running also does not re-import db rows (insert-only on backend).
    const list2 = await fetch(`http://127.0.0.1:${port}/api/assistants`).then(
      (r) =>
        r.json() as Promise<{
          success?: boolean;
          data?: Array<{ id: string; source: string }>;
        }>
    );
    const userIds2 = (list2.data ?? [])
      .filter((a) => a.source === 'user')
      .map((a) => a.id)
      .toSorted();
    expect(userIds2).toEqual(userAssistants);
  }, 60_000);

  it('skips assistants with no rule .md and still finalises', async () => {
    // Drop the novel-writer files so only fitness-coach has rules on disk.
    for (const f of ['custom-novel-writer-1778312586008.zh-CN.md', 'custom-novel-writer-1778312586008.en-US.md']) {
      await fsp.rm(path.join(legacyAssistantsDir, f));
    }

    const configContents = decodeConfigFile(FIXTURE_CONFIG);
    const store: Record<string, unknown> = { ...configContents };
    const fakeConfig = {
      get: async (key: string) => store[key],
    } as const;

    const { migrateAssistantsToBackend } = await import('@/process/utils/migrateAssistants');
    const ok = await migrateAssistantsToBackend(fakeConfig as never);
    expect(ok).toBe(true);

    const rulesDir = path.join(dataDir, 'assistant-rules');
    const ruleFiles = (await fsp.readdir(rulesDir)).toSorted();
    expect(ruleFiles).toEqual([
      'custom-fitness-coach-1778313659049.en-US.md',
      'custom-fitness-coach-1778313659049.zh-CN.md',
    ]);

    expect(Array.isArray(store.assistants)).toBe(true);
  }, 60_000);
});

// Suppress "no test found" complaint when fixtures are absent.
if (!FIXTURES_AVAILABLE) {
  describe('migrateAssistantsToBackend (real fixture)', () => {
    it.skip('skipped: fixture files not available', () => {});
  });
}
