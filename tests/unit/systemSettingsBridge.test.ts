import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockProcessConfig, mockPower, mockChangeLanguage, mockScanAll, mockImportSessions, mockGetDatabase } =
  vi.hoisted(() => ({
    mockProcessConfig: {
      get: vi.fn(),
      set: vi.fn(),
    },
    mockPower: {
      preventDisplaySleep: vi.fn(() => 42),
      allowSleep: vi.fn(),
    },
    mockChangeLanguage: vi.fn(async () => {}),
    mockScanAll: vi.fn(async () => ({ sessions: [], errors: [] as string[] })),
    mockImportSessions: vi.fn(async () => 0),
    mockGetDatabase: vi.fn(async () => ({ ok: true })),
  }));

const providerMap = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const emitMap = vi.hoisted(() => new Map<string, ReturnType<typeof vi.fn>>());
const conversationEmit = vi.hoisted(() => vi.fn());

const petMocks = vi.hoisted(() => ({
  createPetWindow: vi.fn(),
  destroyPetWindow: vi.fn(),
  isPetSupported: vi.fn(() => true),
  resizePetWindow: vi.fn(),
  setPetDndMode: vi.fn(),
  setPetConfirmEnabled: vi.fn(),
}));

vi.mock('@/common', () => {
  function makeProviderProxy(prefix: string) {
    return new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        const key = `${prefix}.${prop}`;
        if (!emitMap.has(key)) emitMap.set(key, vi.fn());
        return {
          provider: (fn: (...args: unknown[]) => unknown) => {
            providerMap.set(key, fn);
          },
          emit: emitMap.get(key),
        };
      },
    });
  }
  return {
    ipcBridge: {
      systemSettings: makeProviderProxy('systemSettings'),
      conversation: {
        listChanged: {
          emit: conversationEmit,
        },
      },
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
  changeLanguage: mockChangeLanguage,
}));

vi.mock('@process/services/database', () => ({
  getDatabase: mockGetDatabase,
}));

vi.mock('@process/services/sessionSync', () => ({
  SessionScannerService: class {
    scanAll = mockScanAll;
  },
  SessionImportService: class {
    constructor(_db: unknown) {}
    importSessions = mockImportSessions;
  },
}));

vi.mock('@process/pet/petManager', () => petMocks);

import {
  initSystemSettingsBridge,
  onCloseToTrayChanged,
  onLanguageChanged,
} from '@/process/bridge/systemSettingsBridge';

function getProvider(key: string): (...args: unknown[]) => unknown {
  const fn = providerMap.get(key);
  if (!fn) {
    throw new Error(`Provider not found: ${key}`);
  }
  return fn;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('systemSettingsBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMap.clear();
    emitMap.clear();
    mockProcessConfig.get.mockImplementation(async () => undefined);
    mockProcessConfig.set.mockResolvedValue(undefined);
    mockChangeLanguage.mockResolvedValue(undefined);
    mockScanAll.mockResolvedValue({ sessions: [], errors: [] });
    mockImportSessions.mockResolvedValue(0);
    mockGetDatabase.mockResolvedValue({ ok: true });
    petMocks.isPetSupported.mockReturnValue(true);
  });

  describe('基础读写 provider', () => {
    it('should expose defaults for core settings', async () => {
      initSystemSettingsBridge();

      expect(await getProvider('systemSettings.getCloseToTray')()).toBe(false);
      expect(await getProvider('systemSettings.getNotificationEnabled')()).toBe(true);
      expect(await getProvider('systemSettings.getCronNotificationEnabled')()).toBe(false);
      expect(await getProvider('systemSettings.getKeepAwake')()).toBe(false);
      expect(await getProvider('systemSettings.getAutoPreviewOfficeFiles')()).toBe(true);
      expect(await getProvider('systemSettings.getAgentSessionSync')()).toBe(false);
    });

    it('should persist all writable switches', async () => {
      initSystemSettingsBridge();

      await getProvider('systemSettings.setNotificationEnabled')({ enabled: true });
      await getProvider('systemSettings.setCronNotificationEnabled')({ enabled: true });
      await getProvider('systemSettings.setSaveUploadToWorkspace')({ enabled: true });
      await getProvider('systemSettings.setAutoPreviewOfficeFiles')({ enabled: false });
      await getProvider('systemSettings.setAgentSessionSync')({ enabled: true });

      expect(mockProcessConfig.set).toHaveBeenCalledWith('system.notificationEnabled', true);
      expect(mockProcessConfig.set).toHaveBeenCalledWith('system.cronNotificationEnabled', true);
      expect(mockProcessConfig.set).toHaveBeenCalledWith('upload.saveToWorkspace', true);
      expect(mockProcessConfig.set).toHaveBeenCalledWith('system.autoPreviewOfficeFiles', false);
      expect(mockProcessConfig.set).toHaveBeenCalledWith('system.agentSessionSync', true);
    });
  });

  describe('close-to-tray / keep-awake / language', () => {
    it('should notify listener after setCloseToTray', async () => {
      const listener = vi.fn();
      onCloseToTrayChanged(listener);
      initSystemSettingsBridge();

      await getProvider('systemSettings.setCloseToTray')({ enabled: true });

      expect(mockProcessConfig.set).toHaveBeenCalledWith('system.closeToTray', true);
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('should toggle keep-awake power blocker', async () => {
      initSystemSettingsBridge();
      const setKeepAwake = getProvider('systemSettings.setKeepAwake');

      await setKeepAwake({ enabled: false });
      mockPower.preventDisplaySleep.mockClear();
      mockPower.allowSleep.mockClear();

      await setKeepAwake({ enabled: true });
      await setKeepAwake({ enabled: true });
      await setKeepAwake({ enabled: false });

      expect(mockPower.preventDisplaySleep).toHaveBeenCalledTimes(1);
      expect(mockPower.allowSleep).toHaveBeenCalledWith(42);
    });

    it('should emit language change and call i18n switch asynchronously', async () => {
      const listener = vi.fn();
      onLanguageChanged(listener);
      initSystemSettingsBridge();

      await getProvider('systemSettings.changeLanguage')({ language: 'zh-CN' });

      expect(emitMap.get('systemSettings.languageChanged')).toHaveBeenCalledWith({ language: 'zh-CN' });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(mockChangeLanguage).toHaveBeenCalledWith('zh-CN');
    });

    it('should swallow i18n errors and keep provider non-blocking', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockChangeLanguage.mockRejectedValueOnce(new Error('boom'));
      initSystemSettingsBridge();

      await getProvider('systemSettings.changeLanguage')({ language: 'en-US' });
      await flushMicrotasks();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('pet settings', () => {
    it('should update pet toggle and invoke manager actions', async () => {
      initSystemSettingsBridge();

      expect(await getProvider('systemSettings.getPetEnabled')()).toBe(false);
      await getProvider('systemSettings.setPetEnabled')({ enabled: true });
      await getProvider('systemSettings.setPetEnabled')({ enabled: false });
      await getProvider('systemSettings.setPetSize')({ size: 320 });
      await getProvider('systemSettings.setPetDnd')({ dnd: true });
      await getProvider('systemSettings.setPetConfirmEnabled')({ enabled: false });

      expect(petMocks.createPetWindow).toHaveBeenCalledTimes(1);
      expect(petMocks.destroyPetWindow).toHaveBeenCalledTimes(1);
      expect(petMocks.resizePetWindow).toHaveBeenCalledWith(320);
      expect(petMocks.setPetDndMode).toHaveBeenCalledWith(true);
      expect(petMocks.setPetConfirmEnabled).toHaveBeenCalledWith(false);
      expect(mockProcessConfig.set).toHaveBeenCalledWith('pet.enabled', true);
      expect(mockProcessConfig.set).toHaveBeenCalledWith('pet.enabled', false);
    });

    it('should skip creating pet window when pet is unsupported', async () => {
      petMocks.isPetSupported.mockReturnValue(false);
      initSystemSettingsBridge();

      await getProvider('systemSettings.setPetEnabled')({ enabled: true });

      expect(petMocks.createPetWindow).not.toHaveBeenCalled();
      expect(mockProcessConfig.set).not.toHaveBeenCalledWith('pet.enabled', true);
    });
  });

  describe('session sync flow', () => {
    it('should return imported=0 when no sessions found', async () => {
      mockScanAll.mockResolvedValueOnce({ sessions: [], errors: ['x'] });
      initSystemSettingsBridge();

      const result = await getProvider('systemSettings.syncAgentSessions')();

      expect(result).toEqual({ imported: 0, errors: ['x'] });
      expect(mockGetDatabase).not.toHaveBeenCalled();
      expect(conversationEmit).not.toHaveBeenCalled();
    });

    it('should import sessions and emit sidebar refresh when imported > 0', async () => {
      mockScanAll.mockResolvedValueOnce({
        sessions: [
          {
            agentType: 'claude',
            sessionId: 's1',
            workspace: 'w',
            name: 'n',
            lastModified: 1,
            sourcePath: '/tmp/a.jsonl',
          },
        ],
        errors: [],
      });
      mockImportSessions.mockResolvedValueOnce(2);
      initSystemSettingsBridge();

      const result = await getProvider('systemSettings.syncAgentSessions')();

      expect(result).toEqual({ imported: 2, errors: [] });
      expect(mockGetDatabase).toHaveBeenCalledTimes(1);
      expect(mockImportSessions).toHaveBeenCalledTimes(1);
      expect(conversationEmit).toHaveBeenCalledWith({
        conversationId: '',
        action: 'created',
        source: 'desktop-sync',
      });
    });

    it('should auto-sync on startup when switch is enabled', async () => {
      mockProcessConfig.get.mockImplementation(async (key: string) => {
        if (key === 'system.agentSessionSync') return true;
        return false;
      });
      mockScanAll.mockResolvedValueOnce({ sessions: [], errors: [] });

      initSystemSettingsBridge();
      await flushMicrotasks();

      expect(mockScanAll).toHaveBeenCalled();
    });
  });
});
