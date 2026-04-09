import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock electron and initStorage before importing utils
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => os.tmpdir()),
    getAppPath: vi.fn(() => os.tmpdir()),
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getSystemDir: vi.fn(() => ({
    workDir: os.tmpdir(),
    dataDir: os.tmpdir(),
    configDir: os.tmpdir(),
  })),
}));

const { readDirectoryRecursive } = await import('@process/utils');

describe('readDirectoryRecursive', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aionui-test-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('returns directory tree for a valid directory', async () => {
    await fsp.writeFile(path.join(tmpDir, 'file.txt'), 'hello');
    await fsp.mkdir(path.join(tmpDir, 'sub'));
    await fsp.writeFile(path.join(tmpDir, 'sub', 'nested.txt'), 'world');

    const ac = new AbortController();
    const result = await readDirectoryRecursive(tmpDir, { maxDepth: 2, abortController: ac });

    expect(result).not.toBeNull();
    expect(result.isDir).toBe(true);
    expect(result.children).toHaveLength(2);

    const file = result.children.find((c) => c.name === 'file.txt');
    expect(file).toBeDefined();
    expect(file.isFile).toBe(true);

    const sub = result.children.find((c) => c.name === 'sub');
    expect(sub).toBeDefined();
    expect(sub.isDir).toBe(true);
    expect(sub.children).toHaveLength(1);
  });

  it('returns null when directory does not exist (ENOENT)', async () => {
    const nonExistent = path.join(tmpDir, 'deleted-workspace');

    const result = await readDirectoryRecursive(nonExistent);

    expect(result).toBeNull();
  });

  it('reads directories without requiring an abort controller', async () => {
    await fsp.writeFile(path.join(tmpDir, 'file.txt'), 'hello');

    const result = await readDirectoryRecursive(tmpDir, { maxDepth: 1 });

    expect(result).not.toBeNull();
    expect(result.children.map((child) => child.name)).toContain('file.txt');
  });

  it('returns null for cleaned-up temp workspace path', async () => {
    const tempWorkspace = path.join(tmpDir, 'gemini-temp-1773815225951');
    await fsp.mkdir(tempWorkspace);
    await fsp.writeFile(path.join(tempWorkspace, 'doc.md'), 'test');

    // Simulate workspace cleanup
    await fsp.rm(tempWorkspace, { recursive: true });

    const result = await readDirectoryRecursive(tempWorkspace);
    expect(result).toBeNull();
  });

  it('returns null when path points to a file', async () => {
    const filePath = path.join(tmpDir, 'not-a-dir.txt');
    await fsp.writeFile(filePath, 'content');

    const result = await readDirectoryRecursive(filePath);

    expect(result).toBeNull();
  });

  it('skips files deleted between readdir and stat (race condition)', async () => {
    await fsp.writeFile(path.join(tmpDir, 'keep.txt'), 'keep');
    await fsp.writeFile(path.join(tmpDir, 'vanish.txt'), 'vanish');

    // Confirm both exist
    const items = await fsp.readdir(tmpDir);
    expect(items).toContain('vanish.txt');

    // Delete one to simulate race condition
    await fsp.unlink(path.join(tmpDir, 'vanish.txt'));

    const ac = new AbortController();
    const result = await readDirectoryRecursive(tmpDir, { abortController: ac });

    expect(result).not.toBeNull();
    const names = result.children.map((c) => c.name);
    expect(names).toContain('keep.txt');
    expect(names).not.toContain('vanish.txt');
  });

  it('respects maxDepth option', async () => {
    await fsp.mkdir(path.join(tmpDir, 'a'));
    await fsp.mkdir(path.join(tmpDir, 'a', 'b'));
    await fsp.writeFile(path.join(tmpDir, 'a', 'b', 'deep.txt'), '');

    const ac = new AbortController();
    const result = await readDirectoryRecursive(tmpDir, { maxDepth: 1, abortController: ac });

    expect(result).not.toBeNull();
    const subDir = result.children.find((c) => c.name === 'a');
    expect(subDir).toBeDefined();
    expect(subDir.isDir).toBe(true);
    // maxDepth=1: 'a' is returned with empty children (not recursed into 'b')
    expect(subDir.children).toEqual([]);
  });

  it('returns result with empty children when readdir throws EPERM (Fixes ELECTRON-H, ELECTRON-6T)', async () => {
    // Create a real directory with a subdirectory
    const restrictedDir = path.join(tmpDir, 'restricted');
    await fsp.mkdir(restrictedDir);
    await fsp.writeFile(path.join(restrictedDir, 'secret.txt'), 'secret');

    // Mock readdir to throw EPERM for the restricted subdirectory
    const originalReaddir = fsp.readdir;
    const readdirSpy = vi.spyOn(fsp, 'readdir').mockImplementation(async (dirPath, ...args) => {
      if (String(dirPath) === restrictedDir) {
        const err = new Error('EPERM: operation not permitted, scandir') as NodeJS.ErrnoException;
        err.code = 'EPERM';
        throw err;
      }
      return originalReaddir(dirPath, ...args);
    });

    const ac = new AbortController();
    const result = await readDirectoryRecursive(tmpDir, { maxDepth: 2, abortController: ac });

    // Should not crash — the restricted dir should be returned with empty children
    expect(result).not.toBeNull();
    const restricted = result.children.find((c) => c.name === 'restricted');
    expect(restricted).toBeDefined();
    expect(restricted.isDir).toBe(true);
    expect(restricted.children).toEqual([]);

    readdirSpy.mockRestore();
  });

  it('returns result with empty children when readdir throws EACCES', async () => {
    const noAccessDir = path.join(tmpDir, 'no-access');
    await fsp.mkdir(noAccessDir);

    const originalReaddir = fsp.readdir;
    const readdirSpy = vi.spyOn(fsp, 'readdir').mockImplementation(async (dirPath, ...args) => {
      if (String(dirPath) === noAccessDir) {
        const err = new Error('EACCES: permission denied, scandir') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      return originalReaddir(dirPath, ...args);
    });

    const ac = new AbortController();
    const result = await readDirectoryRecursive(tmpDir, { maxDepth: 2, abortController: ac });

    expect(result).not.toBeNull();
    const noAccess = result.children.find((c) => c.name === 'no-access');
    expect(noAccess).toBeDefined();
    expect(noAccess.children).toEqual([]);

    readdirSpy.mockRestore();
  });

  it('skips node_modules directory', async () => {
    await fsp.mkdir(path.join(tmpDir, 'node_modules'));
    await fsp.writeFile(path.join(tmpDir, 'node_modules', 'pkg.js'), '');
    await fsp.writeFile(path.join(tmpDir, 'index.ts'), '');

    const ac = new AbortController();
    const result = await readDirectoryRecursive(tmpDir, { maxDepth: 2, abortController: ac });

    const names = result.children.map((c) => c.name);
    expect(names).toContain('index.ts');
    expect(names).not.toContain('node_modules');
  });
});
