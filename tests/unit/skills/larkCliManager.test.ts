import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LarkCliManager, type LarkCliManagerOptions } from '@/process/services/skills/larkCliManager';

let testRoot: string;

const checksum = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');

beforeEach(async () => {
  testRoot = await fs.mkdtemp(path.join(tmpdir(), 'lark-cli-manager-test-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(testRoot, { recursive: true, force: true });
});

async function createManager(overrides: Partial<LarkCliManagerOptions> = {}): Promise<LarkCliManager> {
  const resourcesPath = path.join(testRoot, 'resources');
  const bundleDirectory = path.join(resourcesPath, 'bundled-lark-cli', 'win32-x64');
  await fs.mkdir(bundleDirectory, { recursive: true });
  await fs.writeFile(path.join(bundleDirectory, 'lark-cli.exe'), 'bundled');
  await fs.writeFile(path.join(bundleDirectory, 'manifest.json'), JSON.stringify({ version: 'v1.0.85' }));
  return new LarkCliManager({
    userDataPath: path.join(testRoot, 'user-data'),
    resourcesPath,
    cwd: testRoot,
    isPackaged: true,
    platform: 'win32',
    arch: 'x64',
    env: { PATH: 'C:\\Windows\\System32' },
    ...overrides,
  });
}

describe('LarkCliManager', () => {
  it('checks the official latest release against the bundled baseline', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ tag_name: 'v1.0.86' }), { status: 200 }));
    const manager = await createManager({ fetch: fetcher });

    await expect(manager.checkForUpdates()).resolves.toMatchObject({
      bundledVersion: '1.0.85',
      currentVersion: '1.0.85',
      latestVersion: '1.0.86',
      source: 'bundled',
      updateAvailable: true,
    });
  });

  it('rejects a release archive when its checksum does not match', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('checksums.txt')) return new Response(`${'0'.repeat(64)}  lark-cli-1.0.86-windows-amd64.zip`);
      return new Response('archive');
    });
    const manager = await createManager({ fetch: fetcher });

    await expect(manager.install('1.0.86')).rejects.toThrow('Lark CLI checksum mismatch');
  });

  it('activates a verified managed update and can restore the bundled version', async () => {
    const archive = new TextEncoder().encode('official archive');
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('checksums.txt')) {
        return new Response(`${checksum(archive)}  lark-cli-1.0.86-windows-amd64.zip`);
      }
      return new Response(archive);
    });
    const env: NodeJS.ProcessEnv = { PATH: 'C:\\Windows\\System32' };
    const exec = vi.fn(async (_file: string, _args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
      const destination = options?.env?.LARK_CLI_DEST;
      if (!destination) throw new Error('Missing extraction destination');
      await fs.writeFile(path.join(destination, 'lark-cli.exe'), 'managed binary');
    });
    const manager = await createManager({ fetch: fetcher, execFile: exec, env });

    await expect(manager.install('v1.0.86')).resolves.toMatchObject({
      currentVersion: '1.0.86',
      source: 'managed',
    });
    expect(env.PATH?.split(path.delimiter)[0]).toContain(path.join('tools', 'lark-cli', '1.0.86', 'win32-x64'));

    await expect(manager.restoreBundled()).resolves.toMatchObject({
      currentVersion: '1.0.85',
      source: 'bundled',
    });
  });
});
