import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
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
});
