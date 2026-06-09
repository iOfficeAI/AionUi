import { describe, expect, it } from 'vitest';
import { buildSpawnArgs } from '../../../packages/web-host/src/backend-launcher';

describe('buildSpawnArgs parent pid', () => {
  it('passes parent pid when provided', () => {
    const args = buildSpawnArgs({
      port: 1,
      dbPath: '/d',
      local: false,
      appVersion: '0.0.1',
      isPackaged: true,
      parentPid: 4242,
    });

    expect(args).toContain('--parent-pid');
    expect(args).toContain('4242');
  });
});
