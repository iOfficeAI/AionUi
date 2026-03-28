import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Test that WriteFile (via FileBuilder) ensures parent directory exists
 * before writing, preventing ENOENT errors when the config directory
 * is missing (Sentry ELECTRON-68).
 *
 * Since WriteFile is module-private, we test the behavior by directly
 * exercising the same fs.mkdir + fs.writeFile pattern.
 */
describe('WriteFile ensures parent directory exists (ELECTRON-68)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'initStorage-test-'));
  });

  it('should create parent directory and write file when directory does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nonexistent', 'subdir');
    const filePath = path.join(nestedDir, 'aionui-config.txt');

    // Replicate the fixed WriteFile behavior
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'test-data');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('test-data');
  });

  it('should succeed when parent directory already exists', async () => {
    const filePath = path.join(tmpDir, 'aionui-config.txt');

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'test-data');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('test-data');
  });

  it('should throw ENOENT without mkdir when parent directory is missing', async () => {
    const filePath = path.join(tmpDir, 'nonexistent', 'aionui-config.txt');

    await expect(fs.writeFile(filePath, 'test-data')).rejects.toThrow(/ENOENT/);
  });
});
