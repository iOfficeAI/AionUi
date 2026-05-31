import type { KeyboardShortcutsConfig as PersistedKeyboardShortcutsConfig } from '@/common/config/configKeys';
import type { CommandDefinition } from '@/renderer/commands/types';

export type KeyboardShortcutsConfig = PersistedKeyboardShortcutsConfig;

export type ShortcutBinding = KeyboardShortcutsConfig['bindings'][number];

export type EffectiveShortcutBinding = ShortcutBinding & {
  accelerator: string;
  command: CommandDefinition;
  source: 'default' | 'user';
};

export type ShortcutConflictSeverity = 'info' | 'warning' | 'error';

export type ShortcutConflictType = 'duplicate' | 'reserved' | 'existingLocal' | 'invalid';

export type ShortcutConflict = {
  type: ShortcutConflictType;
  severity: ShortcutConflictSeverity;
  accelerator?: string;
  commandIds: string[];
  message: string;
};
