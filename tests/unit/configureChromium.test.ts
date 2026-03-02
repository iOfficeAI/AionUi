/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';

const REGISTRY_PATH = path.join(os.homedir(), '.aionui-cdp-registry.json');
const CONFIG_PATH = path.join('/mock/userData', 'cdp.config.json');

function normalizePath(targetPath: string): string {
  return path.normalize(targetPath).replace(/\\/g, '/');
}

type MockOptions = {
  isPackaged?: boolean;
  config?: Record<string, unknown> | null;
  registry?: Array<Record<string, unknown>>;
};

function setupModuleMocks(options: MockOptions = {}) {
  const { isPackaged = false, config = null, registry = [] } = options;

  const appendSwitch = vi.fn();
  const writeFileSync = vi.fn();

  vi.doMock('electron', () => ({
    app: {
      isPackaged,
      getPath: vi.fn((name: string) => (name === 'userData' ? '/mock/userData' : '/mock/path')),
      commandLine: {
        appendSwitch,
      },
    },
  }));

  vi.doMock('fs', () => ({
    existsSync: vi.fn((targetPath: string) => {
      const normalized = normalizePath(targetPath);
      if (normalized === normalizePath(CONFIG_PATH)) return config !== null;
      if (normalized === normalizePath(REGISTRY_PATH)) return registry.length > 0;
      return false;
    }),
    readFileSync: vi.fn((targetPath: string) => {
      const normalized = normalizePath(targetPath);
      if (normalized === normalizePath(CONFIG_PATH)) return JSON.stringify(config ?? {});
      if (normalized === normalizePath(REGISTRY_PATH)) return JSON.stringify(registry);
      return '{}';
    }),
    writeFileSync,
  }));

  vi.doMock('http', () => ({
    default: {
      get: vi.fn(),
    },
  }));

  return { appendSwitch, writeFileSync };
}

describe('configureChromium CDP', () => {
  const originalEnv = { ...process.env };
  const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process as any);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AIONUI_CDP_PORT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  afterAll(() => {
    processOnSpy.mockRestore();
  });

  it('在打包环境中忽略 config.enabled=true', async () => {
    const { appendSwitch } = setupModuleMocks({
      isPackaged: true,
      config: { enabled: true, port: 9300 },
    });

    const mod = await import('@/utils/configureChromium');

    expect(mod.cdpStartupEnabled).toBe(false);
    expect(mod.cdpPort).toBeNull();
    expect(appendSwitch).not.toHaveBeenCalled();
  });

  it('在打包环境中允许环境变量显式开启 CDP', async () => {
    process.env.AIONUI_CDP_PORT = '9301';
    const { appendSwitch } = setupModuleMocks({ isPackaged: true });

    const mod = await import('@/utils/configureChromium');

    expect(mod.cdpStartupEnabled).toBe(true);
    expect(mod.cdpPort).toBe(9301);
    expect(appendSwitch).toHaveBeenCalledWith('remote-debugging-port', '9301');
  });

  it('无效环境变量时回退到默认端口常量', async () => {
    process.env.AIONUI_CDP_PORT = 'invalid';
    const { appendSwitch } = setupModuleMocks({ isPackaged: false });

    const mod = await import('@/utils/configureChromium');

    expect(mod.cdpStartupEnabled).toBe(true);
    expect(mod.cdpPort).toBe(mod.DEFAULT_CDP_PORT);
    expect(appendSwitch).toHaveBeenCalledWith('remote-debugging-port', String(mod.DEFAULT_CDP_PORT));
  });

  it('端口被 registry 占用时选择下一个端口', async () => {
    const { appendSwitch } = setupModuleMocks({
      isPackaged: false,
      config: { enabled: true, port: 9230 },
      registry: [
        {
          pid: process.pid,
          port: 9230,
          cwd: process.cwd(),
          startTime: Date.now(),
        },
      ],
    });

    const mod = await import('@/utils/configureChromium');

    expect(mod.cdpPort).toBe(9231);
    expect(appendSwitch).toHaveBeenCalledWith('remote-debugging-port', '9231');
  });

  it('saveCdpConfig 写入正确的配置文件', async () => {
    const { writeFileSync } = setupModuleMocks({ isPackaged: false });

    const mod = await import('@/utils/configureChromium');
    mod.saveCdpConfig({ enabled: true, port: 9333 });

    expect(writeFileSync).toHaveBeenCalledWith(
      CONFIG_PATH,
      JSON.stringify({ enabled: true, port: 9333 }, null, 2),
      'utf-8'
    );
  });

  it('updateCdpConfig 会合并现有配置', async () => {
    setupModuleMocks({
      isPackaged: false,
      config: { enabled: false, port: 9235 },
    });

    const mod = await import('@/utils/configureChromium');
    const updated = mod.updateCdpConfig({ enabled: true });

    expect(updated).toEqual({ enabled: true, port: 9235 });
  });
});
