import { chmod, mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanupRegisteredAgentProcesses, resolveAgentProcessRegistryPath } from './agent-process-registry.js';

describe('cleanupRegisteredAgentProcesses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('kills a registered process group even when the wrapper pid has already exited', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-agent-registry-'));
    const registryPath = resolveAgentProcessRegistryPath(dataDir);
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(
      registryPath,
      JSON.stringify({
        version: 1,
        processes: [
          {
            pid: 6883,
            process_group_id: 6883,
            conversation_id: 'conv-1',
            agent_type: 'acp',
            backend: 'codex',
            registered_at_ms: 1,
          },
        ],
      }),
      'utf8'
    );

    let groupAlive = true;
    const notFound = () => Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((
      target: number,
      signal?: NodeJS.Signals | number
    ) => {
      if (target === -6883 && signal === 0) {
        if (groupAlive) return true;
        throw notFound();
      }
      if (target === 6883 && signal === 0) {
        throw notFound();
      }
      if (target === -6883 && signal === 'SIGTERM') {
        groupAlive = false;
        return true;
      }
      if (target === -6883 && signal === 'SIGKILL') {
        groupAlive = false;
        return true;
      }
      throw notFound();
    }) as typeof process.kill);

    await cleanupRegisteredAgentProcesses(dataDir);

    const registry = JSON.parse(await readFile(registryPath, 'utf8')) as {
      processes: Array<{ pid: number }>;
    };

    expect(killSpy).toHaveBeenCalledWith(-6883, 'SIGTERM');
    expect(registry.processes).toEqual([]);
  });

  it('resolves and quarantines when the registry file is empty', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-agent-registry-'));
    const registryPath = resolveAgentProcessRegistryPath(dataDir);
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, '', 'utf8');

    await expect(cleanupRegisteredAgentProcesses(dataDir)).resolves.toBeUndefined();

    const entries = await readdir(path.dirname(registryPath));
    expect(entries.filter((name) => name.includes('.corrupt.'))).toHaveLength(1);
  });

  it('resolves and quarantines when the registry file holds malformed JSON', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-agent-registry-'));
    const registryPath = resolveAgentProcessRegistryPath(dataDir);
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, '{"version":', 'utf8');

    await expect(cleanupRegisteredAgentProcesses(dataDir)).resolves.toBeUndefined();

    const entries = await readdir(path.dirname(registryPath));
    expect(entries.filter((name) => name.includes('.corrupt.'))).toHaveLength(1);
  });

  it('leaves no temp files and writes parseable JSON after cleanup', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-agent-registry-'));
    const registryPath = resolveAgentProcessRegistryPath(dataDir);
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(
      registryPath,
      JSON.stringify({
        version: 1,
        processes: [
          {
            pid: 6883,
            conversation_id: 'conv-1',
            agent_type: 'acp',
            registered_at_ms: 1,
          },
        ],
      }),
      'utf8'
    );

    const notFound = () => Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    vi.spyOn(process, 'kill').mockImplementation((() => {
      throw notFound();
    }) as typeof process.kill);

    await cleanupRegisteredAgentProcesses(dataDir);

    const entries = await readdir(path.dirname(registryPath));
    expect(entries.filter((name) => name.endsWith('.tmp'))).toHaveLength(0);

    const written = JSON.parse(await readFile(registryPath, 'utf8')) as { processes: unknown[] };
    expect(written.processes).toEqual([]);
  });

  it('resolves when the registry file cannot be read (I/O error)', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-agent-registry-'));
    const registryPath = resolveAgentProcessRegistryPath(dataDir);
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, JSON.stringify({ version: 1, processes: [] }), 'utf8');
    await chmod(registryPath, 0o000);

    await expect(cleanupRegisteredAgentProcesses(dataDir)).resolves.toBeUndefined();

    await chmod(registryPath, 0o644);
  });

  it('resolves when writing the registry back fails (I/O error)', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-agent-registry-'));
    const registryPath = resolveAgentProcessRegistryPath(dataDir);
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(
      registryPath,
      JSON.stringify({
        version: 1,
        processes: [{ pid: 6883, conversation_id: 'conv-1', agent_type: 'acp', registered_at_ms: 1 }],
      }),
      'utf8'
    );

    const notFound = () => Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    vi.spyOn(process, 'kill').mockImplementation((() => {
      throw notFound();
    }) as typeof process.kill);

    await chmod(path.dirname(registryPath), 0o555);

    await expect(cleanupRegisteredAgentProcesses(dataDir)).resolves.toBeUndefined();

    await chmod(path.dirname(registryPath), 0o755);
  });

  it('keeps entries registered concurrently during cleanup and drops killed dead ones', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'aionui-agent-registry-'));
    const registryPath = resolveAgentProcessRegistryPath(dataDir);
    await mkdir(path.dirname(registryPath), { recursive: true });
    const entryA = { pid: 65001, conversation_id: 'conv-a', agent_type: 'acp', registered_at_ms: 1 };
    const entryB = { pid: 65002, conversation_id: 'conv-b', agent_type: 'acp', registered_at_ms: 2 };
    await writeFile(registryPath, JSON.stringify({ version: 1, processes: [entryA] }), 'utf8');

    const notFound = () => Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    let concurrentRegistered = false;
    vi.spyOn(process, 'kill').mockImplementation(((target: number, signal?: NodeJS.Signals | number) => {
      // B is "alive": liveness probes for it succeed.
      if ((target === 65002 || target === -65002) && signal === 0) {
        return true;
      }
      // First kill attempt on A: another backend concurrently registers B.
      if (!concurrentRegistered && (target === 65001 || target === -65001)) {
        concurrentRegistered = true;
        writeFileSync(registryPath, JSON.stringify({ version: 1, processes: [entryA, entryB] }), 'utf8');
      }
      // A is dead (and stays dead): every signal to it fails.
      throw notFound();
    }) as typeof process.kill);

    await cleanupRegisteredAgentProcesses(dataDir);

    const written = JSON.parse(await readFile(registryPath, 'utf8')) as {
      processes: Array<{ pid: number }>;
    };
    expect(written.processes.map((entry) => entry.pid)).toEqual([65002]);
  });
});
