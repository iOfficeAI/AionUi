/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  changeLanguageMock,
  createPetWindowMock,
  destroyNotchTaskboxWindowMock,
  destroyPetWindowMock,
  getNotchTaskboxStatusMock,
  isPetSupportedMock,
  processConfigGetMock,
  processConfigSetMock,
  providerHandlers,
  resizePetWindowMock,
  setNotchTaskboxEnabledMock,
  setNotchTaskboxHardwareNotchMock,
  setPetConfirmEnabledMock,
  setPetDndModeMock,
  systemSettingsMock,
} = vi.hoisted(() => {
  type ProviderHandler = (payload?: unknown) => unknown;
  const handlers = new Map<string, ProviderHandler>();
  const makeProvider = (key: string) => ({
    provider: vi.fn((handler: ProviderHandler) => {
      handlers.set(key, handler);
    }),
  });

  return {
    changeLanguageMock: vi.fn(() => Promise.resolve()),
    createPetWindowMock: vi.fn(),
    destroyNotchTaskboxWindowMock: vi.fn(),
    destroyPetWindowMock: vi.fn(),
    getNotchTaskboxStatusMock: vi.fn(),
    isPetSupportedMock: vi.fn(),
    processConfigGetMock: vi.fn(),
    processConfigSetMock: vi.fn(),
    providerHandlers: handlers,
    resizePetWindowMock: vi.fn(),
    setNotchTaskboxEnabledMock: vi.fn(),
    setNotchTaskboxHardwareNotchMock: vi.fn(),
    setPetConfirmEnabledMock: vi.fn(),
    setPetDndModeMock: vi.fn(),
    systemSettingsMock: {
      setKeepAwake: makeProvider('setKeepAwake'),
      changeLanguage: makeProvider('changeLanguage'),
      languageChanged: { emit: vi.fn() },
      getPetEnabled: makeProvider('getPetEnabled'),
      setPetEnabled: makeProvider('setPetEnabled'),
      getPetSize: makeProvider('getPetSize'),
      setPetSize: makeProvider('setPetSize'),
      getPetDnd: makeProvider('getPetDnd'),
      setPetDnd: makeProvider('setPetDnd'),
      getPetConfirmEnabled: makeProvider('getPetConfirmEnabled'),
      setPetConfirmEnabled: makeProvider('setPetConfirmEnabled'),
      getNotchTaskboxStatus: makeProvider('getNotchTaskboxStatus'),
      setNotchTaskboxEnabled: makeProvider('setNotchTaskboxEnabled'),
      setNotchTaskboxHardwareNotch: makeProvider('setNotchTaskboxHardwareNotch'),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: systemSettingsMock,
  },
}));

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    power: {
      preventDisplaySleep: vi.fn(() => 7),
      allowSleep: vi.fn(),
    },
  }),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: processConfigGetMock,
    set: processConfigSetMock,
  },
}));

vi.mock('@process/services/i18n', () => ({
  changeLanguage: changeLanguageMock,
}));

vi.mock('@process/pet/petManager', () => ({
  createPetWindow: createPetWindowMock,
  destroyPetWindow: destroyPetWindowMock,
  isPetSupported: isPetSupportedMock,
  resizePetWindow: resizePetWindowMock,
  setPetDndMode: setPetDndModeMock,
  setPetConfirmEnabled: setPetConfirmEnabledMock,
}));

vi.mock('@process/notchTaskbox/notchTaskboxWindowManager', () => ({
  destroyNotchTaskboxWindow: destroyNotchTaskboxWindowMock,
  getNotchTaskboxStatus: getNotchTaskboxStatusMock,
  setNotchTaskboxEnabled: setNotchTaskboxEnabledMock,
  setNotchTaskboxHardwareNotch: setNotchTaskboxHardwareNotchMock,
}));

const initBridge = async () => {
  vi.resetModules();
  const { initSystemSettingsBridge } = await import('@process/bridge/systemSettingsBridge');
  initSystemSettingsBridge();
};

const getHandler = (key: string) => {
  const handler = providerHandlers.get(key);
  if (!handler) throw new Error(`Provider ${key} was not registered`);
  return handler;
};

describe('systemSettingsBridge notch taskbox providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerHandlers.clear();
    processConfigGetMock.mockResolvedValue(undefined);
    processConfigSetMock.mockResolvedValue(undefined);
    isPetSupportedMock.mockReturnValue(true);
    getNotchTaskboxStatusMock.mockResolvedValue({ enabled: true, open: true, hardwareNotch: false });
    setNotchTaskboxEnabledMock.mockResolvedValue({ enabled: false, open: false, hardwareNotch: false });
    setNotchTaskboxHardwareNotchMock.mockResolvedValue({ enabled: true, open: true, hardwareNotch: true });
  });

  it('forwards notch taskbox providers to the window manager', async () => {
    await initBridge();

    await expect(getHandler('getNotchTaskboxStatus')()).resolves.toEqual({
      enabled: true,
      open: true,
      hardwareNotch: false,
    });
    await expect(getHandler('setNotchTaskboxEnabled')({ enabled: false })).resolves.toEqual({
      enabled: false,
      open: false,
      hardwareNotch: false,
    });
    await expect(getHandler('setNotchTaskboxHardwareNotch')({ hardwareNotch: true })).resolves.toEqual({
      enabled: true,
      open: true,
      hardwareNotch: true,
    });

    expect(getNotchTaskboxStatusMock).toHaveBeenCalled();
    expect(setNotchTaskboxEnabledMock).toHaveBeenCalledWith(false);
    expect(setNotchTaskboxHardwareNotchMock).toHaveBeenCalledWith(true);
  });

  it('disables the taskbox before showing the desktop pet', async () => {
    await initBridge();

    await getHandler('setPetEnabled')({ enabled: true });

    expect(processConfigSetMock).toHaveBeenCalledWith('pet.enabled', true);
    expect(processConfigSetMock).toHaveBeenCalledWith('notchTaskbox.enabled', false);
    expect(destroyNotchTaskboxWindowMock).toHaveBeenCalled();
    expect(createPetWindowMock).toHaveBeenCalled();
    expect(destroyPetWindowMock).not.toHaveBeenCalled();
  });
});
