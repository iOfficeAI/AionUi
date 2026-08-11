import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

const mockGetPath = vi.fn();
const mockGetAppPath = vi.fn().mockReturnValue('/app/path');

vi.mock('electron', () => ({
  app: {
    getPath: (...args: unknown[]) => mockGetPath(...args),
    getAppPath: () => mockGetAppPath(),
    isPackaged: false,
    getName: () => 'AionUi',
    getVersion: () => '1.0.0',
  },
  Notification: vi.fn(),
  powerSaveBlocker: { start: vi.fn(), stop: vi.fn() },
  utilityProcess: { fork: vi.fn() },
}));

describe('ElectronPlatformServices.paths.getLogsDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns app.getPath("logs") when it succeeds', async () => {
    mockGetPath.mockImplementation((name: string) => {
      if (name === 'logs') return '/Users/test/Library/Logs/AionUi';
      if (name === 'userData') return '/Users/test/Library/Application Support/AionUi';
      return `/mock/${name}`;
    });

    const { ElectronPlatformServices } = await import('../../../src/common/platform/ElectronPlatformServices');
    const svc = new ElectronPlatformServices();
    expect(svc.paths.getLogsDir()).toBe('/Users/test/Library/Logs/AionUi');
  });

  it('falls back to userData/logs when app.getPath("logs") throws', async () => {
    const userData = '/Users/test/Library/Application Support/AionUi';
    mockGetPath.mockImplementation((name: string) => {
      if (name === 'logs') throw new Error("Failed to get 'logs' path");
      if (name === 'userData') return userData;
      return `/mock/${name}`;
    });

    vi.resetModules();
    const { ElectronPlatformServices } = await import('../../../src/common/platform/ElectronPlatformServices');
    const svc = new ElectronPlatformServices();
    expect(svc.paths.getLogsDir()).toBe(path.join(userData, 'logs'));
  });
});
