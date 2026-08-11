import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import postinstall = require('../../scripts/postinstall.js');

function ensureJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function ensureFile(filePath: string, contents = ''): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

function createProjectRoot(): string {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-postinstall-'));
  ensureJsonFile(path.join(projectRoot, 'node_modules', '@office-ai', 'aioncli-core', 'package.json'), {
    name: '@office-ai/aioncli-core',
    version: '0.30.1',
    dependencies: {
      '@google/genai': '1.30.0',
    },
  });

  return projectRoot;
}

describe('getAionCliGenaiRepair', () => {
  let projectRoot: string | null = null;

  afterEach(() => {
    if (projectRoot && fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    projectRoot = null;
  });

  it('skips repair when the nested @google/genai install is complete', () => {
    projectRoot = createProjectRoot();

    const nestedPackageDir = path.join(
      projectRoot,
      'node_modules',
      '@office-ai',
      'aioncli-core',
      'node_modules',
      '@google',
      'genai'
    );
    ensureJsonFile(path.join(nestedPackageDir, 'package.json'), {
      name: '@google/genai',
      version: '1.30.0',
    });
    ensureFile(path.join(nestedPackageDir, 'dist', 'index.mjs'));
    ensureFile(path.join(nestedPackageDir, 'dist', 'node', 'index.cjs'));

    const result = postinstall.getAionCliGenaiRepair(projectRoot);

    expect(result?.repairNeeded).toBe(false);
    expect(result?.missingFiles).toEqual([]);
    expect(result?.installedVersion).toBe('1.30.0');
  });

  it('marks repair as needed when the nested package is only a placeholder directory', () => {
    projectRoot = createProjectRoot();

    const placeholderDir = path.join(
      projectRoot,
      'node_modules',
      '@office-ai',
      'aioncli-core',
      'node_modules',
      '@google',
      'genai',
      'node_modules',
      'google-auth-library'
    );
    ensureJsonFile(path.join(placeholderDir, 'package.json'), {
      name: 'google-auth-library',
      version: '10.6.2',
    });

    const result = postinstall.getAionCliGenaiRepair(projectRoot);

    expect(result?.repairNeeded).toBe(true);
    expect(result?.installedVersion).toBeNull();
    expect(result?.missingFiles).toContain('package.json');
    expect(result?.missingFiles).toContain(path.join('dist', 'index.mjs'));
  });
});

describe('repairAionCliGenaiDependency', () => {
  let projectRoot: string | null = null;

  afterEach(() => {
    if (projectRoot && fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    projectRoot = null;
  });

  it('repairs a broken nested install by running npm inside @office-ai/aioncli-core', () => {
    projectRoot = createProjectRoot();

    const packageDir = path.join(projectRoot, 'node_modules', '@office-ai', 'aioncli-core');
    const nestedPackageDir = path.join(packageDir, 'node_modules', '@google', 'genai');
    fs.mkdirSync(path.join(nestedPackageDir, 'node_modules'), { recursive: true });

    const spawnSyncMock = vi.fn((command: string, args: string[], options?: { cwd?: string }) => {
      expect(command).toBe(process.platform === 'win32' ? 'cmd.exe' : 'npm');
      expect(options?.cwd).toBe(packageDir);
      expect(args).toContain('@google/genai@1.30.0');

      ensureJsonFile(path.join(nestedPackageDir, 'package.json'), {
        name: '@google/genai',
        version: '1.30.0',
      });
      ensureFile(path.join(nestedPackageDir, 'dist', 'index.mjs'));
      ensureFile(path.join(nestedPackageDir, 'dist', 'node', 'index.cjs'));

      return { status: 0 };
    });

    const repaired = postinstall.repairAionCliGenaiDependency(projectRoot, spawnSyncMock);

    expect(repaired).toBe(true);
    expect(spawnSyncMock).toHaveBeenCalledOnce();
    expect(postinstall.getAionCliGenaiRepair(projectRoot)?.repairNeeded).toBe(false);
  });

  it('throws when the repair command fails', () => {
    projectRoot = createProjectRoot();

    const error = () =>
      postinstall.repairAionCliGenaiDependency(
        projectRoot,
        vi.fn(() => ({ status: 1 }))
      );

    expect(error).toThrowError('Failed to repair nested dependency @google/genai@1.30.0 (exit code 1)');
  });
});
