import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

describe('runtime/appContext', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('falls back to runtime paths when Electron app is unavailable', async () => {
    process.env.AIONUI_RUNTIME_DIR = '/mock/runtime';
    delete process.env.NODE_ENV;

    vi.doMock('electron', () => {
      throw new Error('electron unavailable');
    });

    vi.doMock('os', () => ({
      homedir: () => '/mock/home',
      tmpdir: () => '/mock/tmp',
    }));

    const { runtimeApp } = await import('@/runtime/appContext');

    expect(runtimeApp.getPath('home')).toBe('/mock/home');
    expect(runtimeApp.getPath('temp')).toBe('/mock/tmp');
    expect(runtimeApp.getPath('userData')).toBe('/mock/runtime');
    expect(runtimeApp.getAppPath()).toBe(process.cwd());
    expect(runtimeApp.isPackaged).toBe(false);

    process.env.NODE_ENV = 'production';
    expect(runtimeApp.isPackaged).toBe(true);
  });

  it('prefers AIONUI_USER_DATA_DIR over AIONUI_RUNTIME_DIR in fallback mode', async () => {
    process.env.AIONUI_USER_DATA_DIR = '/mock/user-data';
    process.env.AIONUI_RUNTIME_DIR = '/mock/runtime';

    vi.doMock('electron', () => {
      throw new Error('electron unavailable');
    });

    vi.doMock('os', () => ({
      homedir: () => '/mock/home',
      tmpdir: () => '/mock/tmp',
    }));

    const { runtimeApp } = await import('@/runtime/appContext');

    expect(runtimeApp.getPath('userData')).toBe('/mock/user-data');
    expect(runtimeApp.getPath('temp')).toBe('/mock/tmp');
  });
});
