import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// build-with-builder.js runs all of its logic at module top-level and force-exits
// on failure, so it cannot be imported in-process for assertion. We instead spawn
// it as a real subprocess and assert the process exit code, which is the actual
// contract under test: a build failure MUST surface as a non-zero exit so CI /
// founder / automation never sees a broken build as green (the alpha.6 masking).
const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/build-with-builder.js'
);

describe('build-with-builder.js exit-code propagation (fail-closed)', () => {
  it('exits non-zero when the build fails (synchronous throw path)', () => {
    const result = spawnSync(process.execPath, [scriptPath, '--pack-only'], {
      encoding: 'utf8',
      // BUILD_WITH_BUILDER_SELFTEST_FAIL forces the very first statement of the
      // main try block to throw, deterministically exercising the failure path
      // without running a real electron build.
      env: { ...process.env, BUILD_WITH_BUILDER_SELFTEST_FAIL: '1' },
      timeout: 30000,
    });
    expect(result.status).not.toBe(0);
    expect(result.status).toBe(1);
    const combined = `${result.stdout || ''}${result.stderr || ''}`;
    expect(combined).toMatch(/Build failed/);
  });
});
