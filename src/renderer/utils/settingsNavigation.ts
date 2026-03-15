/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SettingsBuiltinTabId = 'gemini' | 'model' | 'agent' | 'tools' | 'display' | 'webui' | 'channels' | 'system' | 'about';

const PAGE_BUILTIN_SETTINGS_TABS_DESKTOP: SettingsBuiltinTabId[] = ['gemini', 'model', 'agent', 'tools', 'display', 'webui', 'channels', 'system', 'about'];

const PAGE_BUILTIN_SETTINGS_TABS_WEB: SettingsBuiltinTabId[] = ['gemini', 'model', 'agent', 'tools', 'display', 'channels', 'system', 'about'];

const MODAL_BUILTIN_SETTINGS_TABS_DESKTOP: SettingsBuiltinTabId[] = ['gemini', 'model', 'tools', 'webui', 'channels', 'system', 'about'];

const MODAL_BUILTIN_SETTINGS_TABS_WEB: SettingsBuiltinTabId[] = ['gemini', 'model', 'tools', 'channels', 'system', 'about'];

export const getPageBuiltinSettingsTabIds = (isDesktop: boolean): SettingsBuiltinTabId[] => {
  return [...(isDesktop ? PAGE_BUILTIN_SETTINGS_TABS_DESKTOP : PAGE_BUILTIN_SETTINGS_TABS_WEB)];
};

export const getModalBuiltinSettingsTabIds = (isDesktop: boolean): SettingsBuiltinTabId[] => {
  return [...(isDesktop ? MODAL_BUILTIN_SETTINGS_TABS_DESKTOP : MODAL_BUILTIN_SETTINGS_TABS_WEB)];
};

export const getConnectivitySettingsPath = (isDesktop: boolean): '/settings/webui' | '/settings/channels' => {
  return isDesktop ? '/settings/webui' : '/settings/channels';
};

export const resolveSettingsTabForRuntime = (tab: SettingsBuiltinTabId, isDesktop: boolean): SettingsBuiltinTabId => {
  if (!isDesktop && tab === 'webui') {
    return 'channels';
  }

  return tab;
};
