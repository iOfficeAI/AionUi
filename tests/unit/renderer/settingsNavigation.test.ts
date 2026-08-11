import { describe, expect, it } from 'vitest';
import type { IExtensionSettingsTab } from '../../../src/common/adapter/ipcBridge';
import {
  buildBuiltinSettingsNavItems,
  buildSettingsNavItems,
  SETTINGS_ROUTE_DEFINITIONS,
} from '../../../src/renderer/pages/settings/components/SettingsSider/settingsNavigation';

const t = ((key: string, options?: { defaultValue?: string }) => options?.defaultValue || key) as never;

describe('settings navigation registry', () => {
  it('keeps settings navigation focused on actual settings pages', () => {
    const routePaths = SETTINGS_ROUTE_DEFINITIONS.map((item) => item.path);

    expect(routePaths).not.toContain('cron');
    expect(routePaths).toContain('api');
    expect(routePaths).toContain('pet');
    expect(routePaths).toContain('assistants');
    expect(routePaths).toContain('agent');
    expect(routePaths).toContain('capabilities');
  });

  it('does not expose scheduled tasks in builtin settings navigation', () => {
    const builtinItems = buildBuiltinSettingsNavItems({
      isDesktop: true,
      t,
    });

    expect(builtinItems.some((item) => item.id === 'cron')).toBe(false);
  });

  it('inserts the session-management extension tab after api', () => {
    const builtinItems = buildBuiltinSettingsNavItems({
      isDesktop: true,
      t,
    });
    const extensionTabs = [
      {
        id: 'ext-session-management-session-management',
        name: 'Session Management',
        entryUrl: 'aion-asset://asset/E:/ext/session-management/settings/session-management.html',
        _extensionName: 'session-management',
        order: 30,
        position: { anchor: 'api', placement: 'after' },
      },
    ] as IExtensionSettingsTab[];

    const navItems = buildSettingsNavItems({
      builtinItems,
      extensionTabs,
      resolveExtTabName: (tab) => tab.name,
    });

    expect(builtinItems.some((item) => item.id === 'session-management')).toBe(false);
    const apiIndex = navItems.findIndex((item) => item.id === 'api');
    const extensionIndex = navItems.findIndex((item) => item.id === 'ext-session-management-session-management');

    expect(apiIndex).toBeGreaterThan(-1);
    expect(extensionIndex).toBe(apiIndex + 1);
  });

  it('keeps embedded extension tabs out of page navigation while preserving regular extension tabs', () => {
    const builtinItems = buildBuiltinSettingsNavItems({
      isDesktop: true,
      t,
    });
    const extensionTabs = [
      {
        id: 'ext-api-diagnostics-runtime-diagnostics',
        name: 'API Diagnostics',
        entryUrl: 'aion-asset://asset/E:/ext/api-diagnostics.html',
        _extensionName: 'api-diagnostics-devtools',
        order: 10,
      },
      {
        id: 'ext-custom-tab',
        name: 'Custom',
        entryUrl: 'https://example.com/settings',
        _extensionName: 'custom-tools',
        order: 20,
        position: { anchor: 'api', placement: 'after' },
      },
    ] as IExtensionSettingsTab[];

    const navItems = buildSettingsNavItems({
      builtinItems,
      extensionTabs,
      resolveExtTabName: (tab) => tab.name,
    });

    expect(navItems.some((item) => item.id === 'ext-api-diagnostics-runtime-diagnostics')).toBe(false);
    const apiIndex = navItems.findIndex((item) => item.id === 'api');
    const customIndex = navItems.findIndex((item) => item.id === 'ext-custom-tab');

    expect(apiIndex).toBeGreaterThan(-1);
    expect(customIndex).toBe(apiIndex + 1);
  });
});
