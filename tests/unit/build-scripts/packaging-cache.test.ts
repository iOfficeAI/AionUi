import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// Keep the same cache regression suite runnable in a dependency-free worktree
// and included in the normal repository Vitest gate.
it('passes the packaging cache regression suite', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      resolve(__dirname, 'packaging-cache.test.cjs'),
      resolve(__dirname, 'packaging-entry.test.cjs'),
      resolve(__dirname, 'release-evidence.test.cjs'),
      resolve(__dirname, 'cloud-delivery.test.cjs'),
    ],
    {
      encoding: 'utf8',
      timeout: 15000,
    }
  );
  expect(result.error, result.stdout + result.stderr).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
