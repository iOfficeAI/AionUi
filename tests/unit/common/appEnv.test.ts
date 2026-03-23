import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false } }));

describe('common/appEnv', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('appends -dev suffix in dev builds', async () => {
    const { getEnvAwareName } = await import('../../../src/common/config/appEnv');
    expect(getEnvAwareName('.aionui')).toBe('.aionui-dev');
    expect(getEnvAwareName('.aionui-config')).toBe('.aionui-config-dev');
  });

  it('returns baseName unchanged in release builds', async () => {
    vi.doMock('electron', () => ({ app: { isPackaged: true } }));
    const { getEnvAwareName } = await import('../../../src/common/config/appEnv');
    expect(getEnvAwareName('.aionui')).toBe('.aionui');
    expect(getEnvAwareName('.aionui-config')).toBe('.aionui-config');
  });
});
