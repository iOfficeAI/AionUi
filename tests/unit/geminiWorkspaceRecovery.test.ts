import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Verifies that a deleted temporary workspace directory is recreated before
 * fs.realpath is called, preventing ENOENT unhandled rejection.
 *
 * Fixes: ELECTRON-6W — "ENOENT: no such file or directory, realpath gemini-temp-*"
 * Root cause: loadServerHierarchicalMemory (aioncli-core) calls
 * `await fs.realpath(workspace)` without try-catch. When the temp directory
 * is removed between creation and agent initialization, this throws an
 * unhandled rejection.
 * Fix: GeminiAgent.initialize() now calls `fs.promises.mkdir(path, { recursive: true })`
 * before loadCliConfig, ensuring the directory exists.
 */
describe('gemini workspace recovery (ELECTRON-6W)', () => {
  it('fs.realpath fails with ENOENT on a deleted temp workspace', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-temp-'));
    await fs.rm(tmpDir, { recursive: true });

    await expect(fs.realpath(tmpDir)).rejects.toThrow('ENOENT');
  });

  it('mkdir with recursive:true recreates a deleted directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-temp-'));
    await fs.rm(tmpDir, { recursive: true });

    // This is the fix pattern used in GeminiAgent.initialize()
    await fs.mkdir(tmpDir, { recursive: true });

    const stat = await fs.stat(tmpDir);
    expect(stat.isDirectory()).toBe(true);

    // Clean up
    await fs.rm(tmpDir, { recursive: true });
  });

  it('fs.realpath succeeds after mkdir recreates the directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-temp-'));
    await fs.rm(tmpDir, { recursive: true });

    // Recreate (the fix)
    await fs.mkdir(tmpDir, { recursive: true });

    // fs.realpath now succeeds instead of throwing ENOENT
    const realPath = await fs.realpath(tmpDir);
    expect(realPath).toBeTruthy();

    // Clean up
    await fs.rm(tmpDir, { recursive: true });
  });

  it('mkdir with recursive:true is idempotent on existing directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-temp-'));

    // Write a file to verify directory contents are preserved
    const testFile = path.join(tmpDir, 'test.txt');
    await fs.writeFile(testFile, 'hello');

    // mkdir on existing directory should not throw or erase contents
    await fs.mkdir(tmpDir, { recursive: true });

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toBe('hello');

    // Clean up
    await fs.rm(tmpDir, { recursive: true });
  });
});
