import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prependBundledLarkCliToPath, prependPreferredLarkCliToPath } from '@/process/startup/bundledCliPath';

const temporaryDirectories: string[] = [];

function createResourcesRoot(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'bundled-cli-path-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('bundled Lark CLI PATH setup', () => {
  it('prepends the bundled binary directory for packaged Windows builds', () => {
    const resourcesPath = createResourcesRoot();
    const bundleDirectory = path.join(resourcesPath, 'bundled-lark-cli', 'win32-x64');
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(path.join(bundleDirectory, 'lark-cli.exe'), 'binary');
    const env: NodeJS.ProcessEnv = { PATH: 'C:\\Windows\\System32' };

    expect(
      prependBundledLarkCliToPath({
        isPackaged: true,
        resourcesPath,
        cwd: resourcesPath,
        platform: 'win32',
        arch: 'x64',
        env,
      })
    ).toBe(bundleDirectory);
    expect(env.PATH?.split(path.delimiter)[0]).toBe(bundleDirectory);
    expect(env.Path).toBe(env.PATH);
  });

  it('does not modify PATH when the bundled binary is missing', () => {
    const resourcesPath = createResourcesRoot();
    const env: NodeJS.ProcessEnv = { PATH: 'existing' };
    expect(
      prependBundledLarkCliToPath({
        isPackaged: true,
        resourcesPath,
        cwd: resourcesPath,
        platform: 'linux',
        arch: 'x64',
        env,
      })
    ).toBeNull();
    expect(env.PATH).toBe('existing');
  });

  it('does not duplicate an existing bundled directory', () => {
    const resourcesPath = createResourcesRoot();
    const bundleDirectory = path.join(resourcesPath, 'bundled-lark-cli', 'linux-x64');
    mkdirSync(bundleDirectory, { recursive: true });
    writeFileSync(path.join(bundleDirectory, 'lark-cli'), 'binary');
    const env: NodeJS.ProcessEnv = { PATH: `${bundleDirectory}${path.delimiter}/usr/bin` };

    prependBundledLarkCliToPath({
      isPackaged: true,
      resourcesPath,
      cwd: resourcesPath,
      platform: 'linux',
      arch: 'x64',
      env,
    });
    expect(env.PATH?.split(path.delimiter).filter((entry) => entry === bundleDirectory)).toHaveLength(1);
  });

  it('prefers a managed version whose binary checksum is valid', () => {
    const resourcesPath = createResourcesRoot();
    const userDataPath = createResourcesRoot();
    const runtimeKey = 'win32-x64';
    const managedDirectory = path.join(userDataPath, 'tools', 'lark-cli', '1.0.86', runtimeKey);
    const bundledDirectory = path.join(resourcesPath, 'bundled-lark-cli', runtimeKey);
    mkdirSync(managedDirectory, { recursive: true });
    mkdirSync(bundledDirectory, { recursive: true });
    writeFileSync(path.join(bundledDirectory, 'lark-cli.exe'), 'bundled');
    writeFileSync(path.join(managedDirectory, 'lark-cli.exe'), 'managed');
    writeFileSync(
      path.join(managedDirectory, 'manifest.json'),
      JSON.stringify({
        version: '1.0.86',
        runtimeKey,
        binarySha256: createHash('sha256').update('managed').digest('hex'),
      })
    );
    writeFileSync(
      path.join(userDataPath, 'tools', 'lark-cli', 'active.json'),
      JSON.stringify({ version: '1.0.86', runtimeKey })
    );
    const env: NodeJS.ProcessEnv = { PATH: bundledDirectory };

    const active = prependPreferredLarkCliToPath({
      isPackaged: true,
      resourcesPath,
      cwd: resourcesPath,
      userDataPath,
      platform: 'win32',
      arch: 'x64',
      env,
    });

    expect(active).toEqual({ directory: managedDirectory, source: 'managed', version: '1.0.86' });
    expect(env.PATH?.split(path.delimiter)[0]).toBe(managedDirectory);
    expect(env.PATH).not.toContain(bundledDirectory);
  });

  it('falls back to the bundled version when the managed binary was modified', () => {
    const resourcesPath = createResourcesRoot();
    const userDataPath = createResourcesRoot();
    const runtimeKey = 'linux-x64';
    const managedDirectory = path.join(userDataPath, 'tools', 'lark-cli', '1.0.86', runtimeKey);
    const bundledDirectory = path.join(resourcesPath, 'bundled-lark-cli', runtimeKey);
    mkdirSync(managedDirectory, { recursive: true });
    mkdirSync(bundledDirectory, { recursive: true });
    writeFileSync(path.join(bundledDirectory, 'lark-cli'), 'bundled');
    writeFileSync(path.join(bundledDirectory, 'manifest.json'), JSON.stringify({ version: '1.0.85' }));
    writeFileSync(path.join(managedDirectory, 'lark-cli'), 'tampered');
    writeFileSync(
      path.join(managedDirectory, 'manifest.json'),
      JSON.stringify({ version: '1.0.86', runtimeKey, binarySha256: '0'.repeat(64) })
    );
    writeFileSync(
      path.join(userDataPath, 'tools', 'lark-cli', 'active.json'),
      JSON.stringify({ version: '1.0.86', runtimeKey })
    );
    const env: NodeJS.ProcessEnv = { PATH: managedDirectory };

    const active = prependPreferredLarkCliToPath({
      isPackaged: true,
      resourcesPath,
      cwd: resourcesPath,
      userDataPath,
      platform: 'linux',
      arch: 'x64',
      env,
    });

    expect(active).toEqual({ directory: bundledDirectory, source: 'bundled', version: '1.0.85' });
    expect(env.PATH?.split(path.delimiter)[0]).toBe(bundledDirectory);
    expect(env.PATH).not.toContain(managedDirectory);
  });
});
