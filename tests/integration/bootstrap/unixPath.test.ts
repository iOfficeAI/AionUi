import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildUnixHydratedPath, hydrateUnixProcessPath } from '@/process/startup/unixPath';

const unixOnlyIt = process.platform === 'win32' ? it.skip : it;

describe('buildUnixHydratedPath', () => {
  it('prepends existing user CLI directories and removes duplicates', () => {
    const home = '/home/asher';
    const hydrated = buildUnixHydratedPath({
      currentPath: `/usr/bin:${home}/.local/bin`,
      existingDirectories: [`${home}/.npm-global/bin`, `${home}/.opencode/bin`, `${home}/.local/bin`],
    });

    expect(hydrated).toBe(`${home}/.npm-global/bin:${home}/.opencode/bin:${home}/.local/bin:/usr/bin`);
  });

  it('preserves the current PATH when HOME is unavailable', () => {
    expect(
      buildUnixHydratedPath({
        currentPath: '/usr/local/bin:/usr/bin',
        existingDirectories: [],
      })
    ).toBe('/usr/local/bin:/usr/bin');
  });
});

describe('hydrateUnixProcessPath', () => {
  unixOnlyIt('adds existing npm and agent user directories without sourcing shell profiles', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'aionui-unix-path-'));
    const npmBin = path.join(root, '.npm-global', 'bin');
    const opencodeBin = path.join(root, '.opencode', 'bin');

    try {
      mkdirSync(npmBin, { recursive: true });
      mkdirSync(opencodeBin, { recursive: true });

      const env: NodeJS.ProcessEnv = {
        HOME: root,
        PATH: '/usr/local/bin:/usr/bin',
      };

      const hydrated = hydrateUnixProcessPath(env);

      expect(hydrated.split(':')).toEqual([npmBin, opencodeBin, '/usr/local/bin', '/usr/bin']);
      expect(env.PATH).toBe(hydrated);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  unixOnlyIt('ignores missing paths and regular files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'aionui-unix-path-'));
    const npmBinFile = path.join(root, '.npm-global', 'bin');

    try {
      mkdirSync(path.dirname(npmBinFile), { recursive: true });
      writeFileSync(npmBinFile, 'not a directory');

      const env: NodeJS.ProcessEnv = {
        HOME: root,
        PATH: '/usr/bin',
      };

      expect(hydrateUnixProcessPath(env)).toBe('/usr/bin');
      expect(env.PATH).toBe('/usr/bin');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('leaves PATH unset when HOME and PATH are unavailable', () => {
    const env: NodeJS.ProcessEnv = {};

    expect(hydrateUnixProcessPath(env)).toBe('');
    expect(env.PATH).toBeUndefined();
  });
});
