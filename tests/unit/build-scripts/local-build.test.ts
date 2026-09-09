import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('passes the local workflow safety and phase regression suite', () => {
  const result = spawnSync(process.execPath, ['--test', resolve(__dirname, 'local-build.test.cjs')], {
    encoding: 'utf8',
    timeout: 90000,
  });
  expect(result.error, result.stdout + result.stderr).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
}, 95000);
