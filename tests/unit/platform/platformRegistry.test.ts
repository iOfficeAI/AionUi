import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('platformRegistry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getPlatformServices throws before registration', async () => {
    const { getPlatformServices } = await import('../../../src/common/platform/index');
    expect(() => getPlatformServices()).toThrow('[Platform] Services not registered');
  });

  it('getPlatformServices returns the registered instance', async () => {
    const { registerPlatformServices, getPlatformServices } = await import('../../../src/common/platform/index');
    const mock = {
      paths: {},
      worker: {},
      power: {},
      notification: {},
    } as Parameters<typeof registerPlatformServices>[0];
    registerPlatformServices(mock);
    expect(getPlatformServices()).toBe(mock);
  });

  it('re-registering replaces the previous instance', async () => {
    const { registerPlatformServices, getPlatformServices } = await import('../../../src/common/platform/index');
    const first = { paths: {}, worker: {}, power: {}, notification: {} } as Parameters<
      typeof registerPlatformServices
    >[0];
    const second = { paths: {}, worker: {}, power: {}, notification: {} } as Parameters<
      typeof registerPlatformServices
    >[0];
    registerPlatformServices(first);
    registerPlatformServices(second);
    expect(getPlatformServices()).toBe(second);
  });
});
