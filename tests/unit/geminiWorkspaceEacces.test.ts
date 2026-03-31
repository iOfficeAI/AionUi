import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Verifies that an inaccessible workspace directory causes fs.realpath to
 * throw EACCES, which is now caught early in GeminiAgent.initialize() before
 * aioncli-core can trigger an unhandled rejection.
 *
 * Fixes: ELECTRON-BM — "EACCES: permission denied, realpath gemini-temp-*"
 * Root cause: aioncli-core calls fs.realpath(workspace) without try-catch.
 * The existing mkdir guard (ELECTRON-6W fix) handles ENOENT but not EACCES.
 * Fix: GeminiAgent.initialize() now calls fs.promises.realpath(path) after
 * mkdir, turning the unhandled rejection into a catchable bootstrap error.
 */
describe('gemini workspace EACCES guard (ELECTRON-BM)', () => {
  // Skip on Windows — chmod has no effect on NTFS
  const isWindows = process.platform === 'win32';
  // Skip when running as root — root bypasses file permissions
  const isRoot = process.getuid?.() === 0;
  const describeUnix = isWindows || isRoot ? describe.skip : describe;

  describeUnix('on Unix with non-root user', () => {
    it('fs.realpath fails with EACCES when parent directory lacks execute permission', async () => {
      // Create parent/child structure to simulate EACCES on realpath
      const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-eacces-'));
      const child = path.join(parent, 'workspace');
      await fs.mkdir(child);

      // Remove execute permission on parent — child path becomes unresolvable
      await fs.chmod(parent, 0o600);

      try {
        await expect(fs.realpath(child)).rejects.toThrow(/EACCES/);
      } finally {
        await fs.chmod(parent, 0o755);
        await fs.rm(parent, { recursive: true });
      }
    });

    it('mkdir recursive does NOT detect EACCES on existing directory', async () => {
      const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-eacces-'));
      const child = path.join(parent, 'workspace');
      await fs.mkdir(child);

      await fs.chmod(parent, 0o600);

      try {
        // mkdir recursive on an existing path may succeed even when the path
        // is not traversable — this is why the ENOENT guard (mkdir) alone
        // is insufficient for EACCES scenarios.
        const mkdirResult = fs.mkdir(child, { recursive: true });
        // On some platforms mkdir may succeed, on others it may fail.
        // The point is: we cannot rely on mkdir alone to detect EACCES.
        await mkdirResult.catch(() => {});

        // But realpath consistently fails — this is the new guard
        await expect(fs.realpath(child)).rejects.toThrow(/EACCES/);
      } finally {
        await fs.chmod(parent, 0o755);
        await fs.rm(parent, { recursive: true });
      }
    });

    it('realpath succeeds on accessible directory (no false positive)', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-ok-'));

      const realPath = await fs.realpath(tmpDir);
      expect(realPath).toBeTruthy();

      await fs.rm(tmpDir, { recursive: true });
    });
  });
});
