import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prependBundledLarkCliToPath } from '@/process/startup/bundledCliPath';

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
});
