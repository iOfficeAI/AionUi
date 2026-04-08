import { describe, expect, it } from 'vitest';
import type { IExtensionSettingsTab } from '../../../src/common/adapter/ipcBridge';
import {
  buildBuiltinSettingsNavItems,
  buildSettingsNavItems,
  SETTINGS_ROUTE_DEFINITIONS,
} from '../../../src/renderer/pages/settings/components/SettingsSider/settingsNavigation';

const t = ((key: string, options?: { defaultValue?: string }) => options?.defaultValue || key) as never;

describe('settings navigation registry', () => {
  it('includes fork-specific settings routes in the central route registry', () => {
    const routePaths = SETTINGS_ROUTE_DEFINITIONS.map((item) => item.path);

    expect(routePaths).toContain('cron');
    expect(routePaths).toContain('api');
    expect(routePaths).toContain('pet');
    expect(routePaths).toContain('skills-hub');
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
