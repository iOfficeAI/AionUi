/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Provider = (payload: never) => Promise<unknown>;

const languageMocks = vi.hoisted(() => {
  const providers: Record<string, Provider> = {};
  return {
    changeLanguage: vi.fn(),
    emitLanguageChanged: vi.fn(),
    providers,
    provider:
      (name: string) =>
      (handler: Provider): void => {
        providers[name] = handler;
      },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      getCloseToTray: { provider: languageMocks.provider('getCloseToTray') },
      setCloseToTray: { provider: languageMocks.provider('setCloseToTray') },
      changeLanguage: { provider: languageMocks.provider('changeLanguage') },
      languageChanged: { emit: languageMocks.emitLanguageChanged },
      getPetEnabled: { provider: languageMocks.provider('getPetEnabled') },
      setPetEnabled: { provider: languageMocks.provider('setPetEnabled') },
      getPetSize: { provider: languageMocks.provider('getPetSize') },
      setPetSize: { provider: languageMocks.provider('setPetSize') },
      getPetDnd: { provider: languageMocks.provider('getPetDnd') },
      setPetDnd: { provider: languageMocks.provider('setPetDnd') },
      getPetConfirmEnabled: { provider: languageMocks.provider('getPetConfirmEnabled') },
      setPetConfirmEnabled: { provider: languageMocks.provider('setPetConfirmEnabled') },
    },
  },
}));

vi.mock('@process/services/i18n', () => ({
  changeLanguage: languageMocks.changeLanguage,
}));

vi.mock('@process/startup/mainProcessDiagnostics', () => ({
  isSafeModeLaunch: () => false,
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn(), set: vi.fn() },
}));

vi.mock('@process/utils/tray', () => ({
  createOrUpdateTray: vi.fn(),
  destroyTray: vi.fn(),
  setCloseToTrayEnabled: vi.fn(),
}));

vi.mock('@process/utils/closeToTraySetting', () => ({
  readCloseToTraySetting: vi.fn(),
  writeCloseToTraySetting: vi.fn(),
}));

import { initSystemSettingsBridge, onLanguageChanged } from '@/process/bridge/systemSettingsBridge';

describe('system settings language synchronization', () => {
  beforeEach(() => {
    languageMocks.changeLanguage.mockReset();
    languageMocks.emitLanguageChanged.mockReset();
    initSystemSettingsBridge();
  });

  it('refreshes native menus only after the main-process language has changed', async () => {
    let finishLanguageChange: (() => void) | undefined;
    languageMocks.changeLanguage.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishLanguageChange = resolve;
        })
    );
    const refreshNativeMenus = vi.fn();
    onLanguageChanged(refreshNativeMenus);

    const changing = languageMocks.providers.changeLanguage({ language: 'zh-CN' } as never);

    expect(languageMocks.emitLanguageChanged).toHaveBeenCalledWith({ language: 'zh-CN' });
    expect(refreshNativeMenus).not.toHaveBeenCalled();

    finishLanguageChange?.();
    await changing;

    expect(refreshNativeMenus).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild native menus with stale labels when language loading fails', async () => {
    languageMocks.changeLanguage.mockRejectedValue(new Error('translation unavailable'));
    const refreshNativeMenus = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    onLanguageChanged(refreshNativeMenus);

    await languageMocks.providers.changeLanguage({ language: 'zh-CN' } as never);

    expect(refreshNativeMenus).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
