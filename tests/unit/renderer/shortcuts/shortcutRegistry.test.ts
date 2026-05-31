import { describe, expect, it } from 'vitest';
import type { CommandDefinition } from '@/renderer/commands/types';
import {
  getEffectiveShortcutBindings,
  getRegisterableShortcutBindings,
  getShortcutConflicts,
  normalizeKeyboardShortcutsConfig,
  removeShortcutBindingOverride,
  setShortcutBindingOverride,
  validateShortcutBindingOverride,
} from '@/renderer/shortcuts/shortcutRegistry';

const commands: CommandDefinition[] = [
  {
    id: 'app.openSettings',
    titleKey: 'settings.keyboardShortcuts.commands.appOpenSettings',
    defaultTitle: 'Open settings',
    category: 'app',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+,',
  },
  {
    id: 'app.toggleSidebar',
    titleKey: 'settings.keyboardShortcuts.commands.appToggleSidebar',
    defaultTitle: 'Toggle sidebar',
    category: 'app',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+B',
  },
  {
    id: 'conversation.findCurrent',
    titleKey: 'settings.keyboardShortcuts.commands.conversationFindCurrent',
    defaultTitle: 'Find current conversation',
    category: 'conversation',
    scope: 'existingLocal',
    risk: 'normal',
    status: 'existing',
    defaultShortcut: 'CtrlOrCmd+F',
  },
];

describe('shortcut registry', () => {
  it('filters unknown and duplicate command overrides', () => {
    const { config, conflicts } = normalizeKeyboardShortcutsConfig(
      {
        version: 1,
        bindings: [
          { commandId: 'app.openSettings', accelerator: 'CtrlOrCmd+K' },
          { commandId: 'missing.command', accelerator: 'CtrlOrCmd+M' },
          { commandId: 'app.openSettings', accelerator: 'CtrlOrCmd+O' },
        ],
      },
      commands
    );

    expect(config?.bindings).toEqual([{ commandId: 'app.openSettings', accelerator: 'CtrlOrCmd+K' }]);
    expect(conflicts.map((conflict) => conflict.type)).toEqual(['invalid', 'duplicate']);
  });

  it('filters and reports invalid persisted scope values', () => {
    const { config, conflicts } = normalizeKeyboardShortcutsConfig(
      {
        version: 1,
        bindings: [
          { commandId: 'app.openSettings', accelerator: 'CtrlOrCmd+K', scope: 'window' },
          { commandId: 'app.toggleSidebar', accelerator: 'CtrlOrCmd+Shift+B', scope: 'global' },
        ],
      },
      commands
    );

    expect(config?.bindings).toEqual([
      { commandId: 'app.toggleSidebar', accelerator: 'CtrlOrCmd+Shift+B', scope: 'global' },
    ]);
    expect(conflicts).toMatchObject([
      {
        type: 'invalid',
        commandIds: ['app.openSettings'],
      },
    ]);
  });

  it('applies valid user overrides over defaults', () => {
    const { config } = normalizeKeyboardShortcutsConfig(
      {
        version: 1,
        bindings: [{ commandId: 'app.toggleSidebar', accelerator: 'CtrlOrCmd+Shift+B' }],
      },
      commands
    );

    const binding = getEffectiveShortcutBindings(commands, config).find(
      (candidate) => candidate.commandId === 'app.toggleSidebar'
    );

    expect(binding?.accelerator).toBe('CtrlOrCmd+Shift+B');
    expect(binding?.source).toBe('user');
  });

  it('reports active duplicate accelerators', () => {
    const { config } = normalizeKeyboardShortcutsConfig(
      {
        version: 1,
        bindings: [{ commandId: 'app.toggleSidebar', accelerator: 'CtrlOrCmd+,' }],
      },
      commands
    );

    expect(getShortcutConflicts(commands, config).some((conflict) => conflict.type === 'duplicate')).toBe(true);
  });

  it('reports collisions with existing local shortcuts', () => {
    const { config } = normalizeKeyboardShortcutsConfig(
      {
        version: 1,
        bindings: [{ commandId: 'app.toggleSidebar', accelerator: 'CtrlOrCmd+F' }],
      },
      commands
    );

    expect(getShortcutConflicts(commands, config).some((conflict) => conflict.type === 'existingLocal')).toBe(true);
  });

  it('does not register bindings that collide with existing local shortcuts', () => {
    const { config } = normalizeKeyboardShortcutsConfig(
      {
        version: 1,
        bindings: [{ commandId: 'app.toggleSidebar', accelerator: 'CtrlOrCmd+F' }],
      },
      commands
    );

    expect(getRegisterableShortcutBindings(commands, config).map((binding) => binding.commandId)).toEqual([
      'app.openSettings',
    ]);
  });

  it('creates and removes shortcut overrides', () => {
    const overridden = setShortcutBindingOverride(null, 'app.openSettings', 'CtrlOrCmd+K');
    expect(overridden.bindings).toEqual([{ commandId: 'app.openSettings', accelerator: 'CtrlOrCmd+K', enabled: true }]);

    const disabled = setShortcutBindingOverride(overridden, 'app.openSettings', null, false);
    expect(disabled.bindings).toEqual([{ commandId: 'app.openSettings', accelerator: null, enabled: false }]);

    expect(removeShortcutBindingOverride(disabled, 'app.openSettings').bindings).toEqual([]);
  });

  it('validates edited shortcut overrides before saving', () => {
    expect(validateShortcutBindingOverride(commands, null, 'app.toggleSidebar', 'CtrlOrCmd+F')).toMatchObject([
      { type: 'existingLocal' },
    ]);
    expect(validateShortcutBindingOverride(commands, null, 'app.toggleSidebar', 'CtrlOrCmd+K')).toEqual([]);
  });
});
