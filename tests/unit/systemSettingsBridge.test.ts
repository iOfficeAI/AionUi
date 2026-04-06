import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockProcessConfig, mockPower } = vi.hoisted(() => ({
  mockProcessConfig: {
    get: vi.fn(),
    set: vi.fn(),
  },
  mockPower: {
    preventDisplaySleep: vi.fn(() => 42),
    allowSleep: vi.fn(),
    preventSleep: vi.fn(() => 1),
  },
}));

const providerMap = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock('@/common', () => {
  function makeProviderProxy(prefix: string) {
    return new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        const key = `${prefix}.${prop}`;
        return {
          provider: (fn: (...args: unknown[]) => unknown) => {
            providerMap.set(key, fn);
          },
          emit: vi.fn(),
        };
      },
    });
  }
  return {
    ipcBridge: {
      systemSettings: makeProviderProxy('systemSettings'),
    },
  };
});
vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    power: mockPower,
  }),
}));
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: mockProcessConfig,
}));
vi.mock('@process/services/i18n', () => ({
  changeLanguage: vi.fn(async () => {}),
}));

import { initSystemSettingsBridge } from '@/process/bridge/systemSettingsBridge';

describe('systemSettingsBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMap.clear();
    // ProcessConfig.get is called at init time (restore keep-awake), so ensure it returns a promise
    mockProcessConfig.get.mockResolvedValue(undefined);
    mockProcessConfig.set.mockResolvedValue(undefined);
    initSystemSettingsBridge();
  });

  describe('getKeepAwake', () => {
    it('should return false when not set', async () => {
      mockProcessConfig.get.mockResolvedValue(undefined);
      const handler = providerMap.get('systemSettings.getKeepAwake');
      const result = await handler!();
      expect(result).toBe(false);
    });

    it('should return stored value', async () => {
      mockProcessConfig.get.mockResolvedValue(true);
      const handler = providerMap.get('systemSettings.getKeepAwake');
      const result = await handler!();
      expect(result).toBe(true);
    });
  });

  describe('setKeepAwake', () => {
    it('should start power blocker when enabling', async () => {
      mockProcessConfig.set.mockResolvedValue(undefined);
      const handler = providerMap.get('systemSettings.setKeepAwake');
      await handler!({ enabled: true });

      expect(mockProcessConfig.set).toHaveBeenCalledWith('system.keepAwake', true);
      expect(mockPower.preventDisplaySleep).toHaveBeenCalled();
    });

    it('should toggle enable then disable correctly', async () => {
      const handler = providerMap.get('systemSettings.setKeepAwake');

      // Reset module state: disable first to ensure _keepAwakeBlockerId is null
      await handler!({ enabled: false });
      mockPower.preventDisplaySleep.mockClear();
      mockPower.allowSleep.mockClear();

      // Enable — should create blocker
      await handler!({ enabled: true });
      expect(mockPower.preventDisplaySleep).toHaveBeenCalledTimes(1);

      // Disable — should release the blocker
      await handler!({ enabled: false });
      expect(mockPower.allowSleep).toHaveBeenCalledWith(42);

      // Re-enable — should create a new blocker
      mockPower.preventDisplaySleep.mockClear();
      await handler!({ enabled: true });
      expect(mockPower.preventDisplaySleep).toHaveBeenCalledTimes(1);
    });

    it('should not create duplicate blockers on consecutive enable calls', async () => {
      const handler = providerMap.get('systemSettings.setKeepAwake');

      // First reset state by disabling
      await handler!({ enabled: false });
      mockPower.preventDisplaySleep.mockClear();
      mockPower.allowSleep.mockClear();

      // Enable once
      await handler!({ enabled: true });
      const callCount = mockPower.preventDisplaySleep.mock.calls.length;

      // Enable again — should NOT create another blocker
      await handler!({ enabled: true });
      expect(mockPower.preventDisplaySleep).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('getCloseToTray', () => {
    it('should return false as default', async () => {
      mockProcessConfig.get.mockResolvedValue(undefined);
      const handler = providerMap.get('systemSettings.getCloseToTray');
      expect(await handler!()).toBe(false);
    });
  });

  describe('getNotificationEnabled', () => {
    it('should return true as default', async () => {
      mockProcessConfig.get.mockResolvedValue(undefined);
      const handler = providerMap.get('systemSettings.getNotificationEnabled');
      expect(await handler!()).toBe(true);
    });
  });

  describe('getCronNotificationEnabled', () => {
    it('should return false as default', async () => {
      mockProcessConfig.get.mockResolvedValue(undefined);
      const handler = providerMap.get('systemSettings.getCronNotificationEnabled');
      expect(await handler!()).toBe(false);
    });
  });

  describe('getSaveUploadToWorkspace', () => {
    it('should return false as default', async () => {
      mockProcessConfig.get.mockResolvedValue(undefined);
      const handler = providerMap.get('systemSettings.getSaveUploadToWorkspace');
      expect(await handler!()).toBe(false);
    });
  });
});
