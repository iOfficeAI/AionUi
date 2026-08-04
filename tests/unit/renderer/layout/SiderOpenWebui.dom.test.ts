/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getStatus: vi.fn(),
  openExternal: vi.fn(),
  setConfig: vi.fn(),
  start: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  shell: { openExternal: { invoke: mocks.openExternal } },
  theme: {
    changed: { on: vi.fn(() => () => undefined) },
    setActive: { invoke: vi.fn(async () => undefined) },
  },
  webui: {
    getStatus: { invoke: mocks.getStatus },
    start: { invoke: mocks.start },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: mocks.getConfig,
    set: mocks.setConfig,
    whenReady: vi.fn(async () => undefined),
  },
}));

import { openDesktopWebui } from '@renderer/components/layout/Sider';

describe('openDesktopWebui', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue(false);
    mocks.setConfig.mockResolvedValue(undefined);
    mocks.openExternal.mockResolvedValue(undefined);
  });

  it('opens the current WebUI address when the service is running', async () => {
    mocks.getStatus.mockResolvedValue({ running: true, port: 25809 });

    await openDesktopWebui();

    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.openExternal).toHaveBeenCalledWith('http://localhost:25809');
  });

  it('starts WebUI with the saved remote preference before opening it', async () => {
    mocks.getStatus.mockResolvedValue({ running: false, port: 25809 });
    mocks.getConfig.mockReturnValue(true);
    mocks.start.mockResolvedValue({ port: 25809 });

    await openDesktopWebui();

    expect(mocks.start).toHaveBeenCalledWith({ port: 25809, allowRemote: true });
    expect(mocks.setConfig).toHaveBeenCalledWith('webui.desktop.enabled', true);
    expect(mocks.openExternal).toHaveBeenCalledWith('http://localhost:25809');
  });

  it('does not open a dead address when startup fails', async () => {
    mocks.getStatus.mockResolvedValue({ running: false, port: 25809 });
    mocks.start.mockRejectedValue(new Error('port conflict'));

    await expect(openDesktopWebui()).rejects.toThrow('port conflict');
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });
});
