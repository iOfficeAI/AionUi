import { afterEach, describe, expect, it, vi } from 'vitest';
import hotkeys from 'hotkeys-js';
import type { CommandDefinition } from '@/renderer/commands/types';
import { registerHotkeyBindings } from '@/renderer/shortcuts/hotkeysAdapter';

const command = (overrides: Partial<CommandDefinition> = {}): CommandDefinition => ({
  id: 'app.test',
  titleKey: 'settings.keyboardShortcuts.commands.appOpenSettings',
  defaultTitle: 'Test command',
  category: 'app',
  scope: 'app',
  risk: 'normal',
  status: 'enabled',
  defaultShortcut: 'Ctrl+K',
  run: vi.fn(),
  ...overrides,
});

const context = {
  navigate: vi.fn(),
  location: { pathname: '/', search: '', hash: '' },
  visibleConversationIds: [],
  layout: null,
  navigationHistory: null,
  appearance: {
    theme: 'light' as const,
    setTheme: vi.fn(),
  },
  workspaceAvailable: false,
};

describe('hotkeys adapter', () => {
  afterEach(() => {
    hotkeys.unbind();
    hotkeys.setScope('all');
  });

  it('restores hotkeys-js global filter and scope after cleanup', () => {
    const previousFilter = hotkeys.filter;
    hotkeys.setScope('existing-scope');

    const cleanup = registerHotkeyBindings({
      bindings: [
        {
          commandId: 'app.test',
          accelerator: 'Ctrl+K',
          enabled: true,
          scope: 'global',
          source: 'default',
          command: command(),
        },
      ],
      context,
    });

    expect(hotkeys.filter).not.toBe(previousFilter);
    expect(hotkeys.getScope()).toBe('__aionui_internal_global__');

    cleanup();

    expect(hotkeys.filter).toBe(previousFilter);
    expect(hotkeys.getScope()).toBe('existing-scope');
  });

  it('keeps shared filter installed until all registrations are cleaned up', () => {
    const previousFilter = hotkeys.filter;
    const firstCleanup = registerHotkeyBindings({ bindings: [], context });
    const installedFilter = hotkeys.filter;
    const secondCleanup = registerHotkeyBindings({ bindings: [], context });

    firstCleanup();
    expect(hotkeys.filter).toBe(installedFilter);

    secondCleanup();
    expect(hotkeys.filter).toBe(previousFilter);
  });
});
