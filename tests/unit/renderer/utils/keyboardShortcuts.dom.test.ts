import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ mac: false }));

vi.mock('@/renderer/utils/platform', () => ({
  isMacOS: () => platform.mac,
}));

import { getSettingsShortcutHint, SETTINGS_SHORTCUT_KEY } from '@/renderer/utils/ui/keyboardShortcuts';

describe('getSettingsShortcutHint', () => {
  beforeEach(() => {
    platform.mac = false;
  });

  it('shows the ⌘ modifier on macOS', () => {
    platform.mac = true;

    expect(getSettingsShortcutHint()).toBe('⌘,');
  });

  it('shows the Ctrl modifier on Windows/Linux', () => {
    expect(getSettingsShortcutHint()).toBe('Ctrl+,');
  });

  it('shares the same primary key as the settings toggle shortcut', () => {
    expect(SETTINGS_SHORTCUT_KEY).toBe(',');
  });
});
