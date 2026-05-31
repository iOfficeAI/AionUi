import type { CommandDefinition } from '@/renderer/commands/types';
import type { ShortcutBinding } from './types';

export const getDefaultShortcutBindings = (commands: CommandDefinition[]): ShortcutBinding[] =>
  commands
    .filter((command) => command.status === 'enabled' && command.defaultShortcut)
    .map((command) => ({
      commandId: command.id,
      accelerator: command.defaultShortcut!,
      scope: command.scope === 'route' ? 'route' : command.scope === 'component' ? 'component' : 'global',
      enabled: true,
    }));

export const getReservedShortcutBindings = (commands: CommandDefinition[]): ShortcutBinding[] =>
  commands
    .filter((command) => command.status !== 'enabled' && command.defaultShortcut)
    .map((command) => ({
      commandId: command.id,
      accelerator: command.defaultShortcut!,
      scope: command.scope === 'route' ? 'route' : command.scope === 'component' ? 'component' : 'global',
      enabled: false,
    }));
