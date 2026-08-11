import { describe, expect, it } from 'vitest';
import { isSettingsItemSelected } from '../../../src/renderer/pages/settings/components/SettingsSider';
import { isSettingsNavItemActive } from '../../../src/renderer/pages/settings/components/SettingsPageWrapper';

describe('settings route selection helpers', () => {
  describe('isSettingsItemSelected', () => {
    it('should only activate the exact api settings route', () => {
      expect(isSettingsItemSelected('/settings/api', 'api')).toBe(true);
      expect(isSettingsItemSelected('/settings/api', 'tools')).toBe(false);
      expect(isSettingsItemSelected('/settings/tools/api', 'api')).toBe(false);
    });

    it('should keep parent tools active for nested tools routes only', () => {
      expect(isSettingsItemSelected('/settings/tools', 'tools')).toBe(true);
      expect(isSettingsItemSelected('/settings/tools/api', 'tools')).toBe(true);
      expect(isSettingsItemSelected('/settings/tools/api', 'webui')).toBe(false);
    });
  });

  describe('isSettingsNavItemActive', () => {
    it('should match extension tabs by their full settings route', () => {
      expect(isSettingsNavItemActive('/settings/ext/api-diagnostics-devtools', 'ext/api-diagnostics-devtools')).toBe(
        true
      );
      expect(isSettingsNavItemActive('/settings/ext/api-diagnostics-devtools', 'api')).toBe(false);
    });

    it('should not mark sibling items active when the route moved into settings', () => {
      expect(isSettingsNavItemActive('/settings/api', 'api')).toBe(true);
      expect(isSettingsNavItemActive('/settings/api', 'tools')).toBe(false);
      expect(isSettingsNavItemActive('/settings/api', 'webui')).toBe(false);
    });
  });
});
