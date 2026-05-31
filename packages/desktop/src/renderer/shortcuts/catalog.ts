import { getBuiltinCommands } from '@/renderer/commands/registry';
import type { CommandCategory, CommandDefinition } from '@/renderer/commands/types';
import type { KeyboardShortcutsConfig, ShortcutConflict, ShortcutConflictType } from './types';

export type ShortcutCategory = 'app' | 'conversation' | 'workspace' | 'team' | 'preview' | 'reserved';

export type ShortcutScope =
  | 'appGlobal'
  | 'conversationRoute'
  | 'workspaceRoute'
  | 'previewComponent'
  | 'webuiConditional'
  | 'mainProcessReserved'
  | 'localContext';

export type ShortcutStatus = 'active' | 'candidate' | 'reserved' | 'disabled' | 'local';

export type ShortcutConflictKind =
  | 'none'
  | 'reserved'
  | 'contextBlocked'
  | 'highRisk'
  | 'platformNative'
  | 'duplicatePending';

export type ShortcutDefinition = {
  id: string;
  category: ShortcutCategory;
  titleKey: string;
  defaultAccelerator: string | null;
  currentAccelerator: string | null;
  scope: ShortcutScope;
  status: ShortcutStatus;
  conflict: ShortcutConflictKind;
  noteKey?: string;
  diagnostics?: ShortcutConflict[];
  source?: 'default' | 'user' | 'future';
};

export const shortcutCategoryOrder: ShortcutCategory[] = ['app', 'conversation', 'workspace', 'team', 'preview', 'reserved'];

const categoryByCommandCategory: Record<CommandCategory, ShortcutCategory> = {
  app: 'app',
  conversation: 'conversation',
  developer: 'reserved',
  navigation: 'app',
  preview: 'preview',
  team: 'team',
  workspace: 'workspace',
};

const mapCommandScope = (command: CommandDefinition): ShortcutScope => {
  switch (command.scope) {
    case 'app':
      return 'appGlobal';
    case 'route':
      return command.category === 'workspace' ? 'workspaceRoute' : 'conversationRoute';
    case 'component':
      return 'previewComponent';
    case 'existingLocal':
      return 'localContext';
    case 'mainProcess':
      return 'mainProcessReserved';
    default:
      return 'appGlobal';
  }
};

const mapCommandStatus = (command: CommandDefinition): ShortcutStatus => {
  switch (command.status) {
    case 'enabled':
      return 'active';
    case 'existing':
      return 'local';
    case 'reserved':
      return 'reserved';
    default:
      return 'disabled';
  }
};

const mapCommandConflict = (command: CommandDefinition): ShortcutConflictKind => {
  if (command.scope === 'mainProcess' || command.status === 'reserved') return 'reserved';
  return 'none';
};

const mapCommandNote = (command: CommandDefinition): string | undefined => {
  if (command.scope === 'mainProcess') return 'settings.keyboardShortcuts.notes.mainProcessReserved';
  if (command.status === 'existing') return 'settings.keyboardShortcuts.notes.localHandler';
  return undefined;
};

const fromCommand = (command: CommandDefinition): ShortcutDefinition => ({
  id: command.id,
  category: categoryByCommandCategory[command.category],
  titleKey: command.titleKey,
  defaultAccelerator: command.defaultShortcut ?? null,
  currentAccelerator: command.defaultShortcut ?? null,
  scope: mapCommandScope(command),
  status: mapCommandStatus(command),
  conflict: mapCommandConflict(command),
  noteKey: mapCommandNote(command),
  source: 'default',
});

const futureShortcutCatalog: ShortcutDefinition[] = [
  {
    id: 'app.logout',
    category: 'conversation',
    titleKey: 'settings.keyboardShortcuts.commands.appLogout',
    defaultAccelerator: 'CtrlOrCmd+Shift+L',
    currentAccelerator: 'CtrlOrCmd+Shift+L',
    scope: 'webuiConditional',
    status: 'local',
    conflict: 'contextBlocked',
    noteKey: 'settings.keyboardShortcuts.notes.webuiOnly',
  },
  {
    id: 'app.reload',
    category: 'reserved',
    titleKey: 'settings.keyboardShortcuts.commands.appReload',
    defaultAccelerator: 'CtrlOrCmd+R',
    currentAccelerator: 'CtrlOrCmd+R',
    scope: 'mainProcessReserved',
    status: 'reserved',
    conflict: 'platformNative',
    noteKey: 'settings.keyboardShortcuts.notes.electronMenuReserved',
  },
];

const conflictPriority: Record<ShortcutConflictType, ShortcutConflictKind> = {
  duplicate: 'duplicatePending',
  existingLocal: 'reserved',
  invalid: 'contextBlocked',
  reserved: 'reserved',
};

export const createShortcutCatalog = (
  config: KeyboardShortcutsConfig | null | undefined,
  conflicts: ShortcutConflict[] = []
): ShortcutDefinition[] => {
  const overrideByCommandId = new Map(config?.bindings.map((binding) => [binding.commandId, binding]) ?? []);
  const diagnosticsByCommandId = new Map<string, ShortcutConflict[]>();

  for (const conflict of conflicts) {
    for (const commandId of conflict.commandIds) {
      const current = diagnosticsByCommandId.get(commandId) ?? [];
      current.push(conflict);
      diagnosticsByCommandId.set(commandId, current);
    }
  }

  return [
    ...getBuiltinCommands()
      .filter((command) => command.status !== 'reserved')
      .map((command) => {
        const override = overrideByCommandId.get(command.id);
        const diagnostics = diagnosticsByCommandId.get(command.id) ?? [];
        const firstDiagnostic = diagnostics[0];
        const base = fromCommand(command);
        return {
          id: base.id,
          category: base.category,
          titleKey: base.titleKey,
          defaultAccelerator: base.defaultAccelerator,
          currentAccelerator: override ? override.accelerator : base.currentAccelerator,
          scope: base.scope,
          status: override?.enabled === false ? 'disabled' : base.status,
          conflict: firstDiagnostic ? conflictPriority[firstDiagnostic.type] : base.conflict,
          noteKey: base.noteKey,
          diagnostics,
          source: override ? 'user' : base.source,
        };
      }),
    ...futureShortcutCatalog.filter((shortcut) => shortcut.status !== 'reserved'),
  ];
};

export const shortcutCatalog: ShortcutDefinition[] = createShortcutCatalog(null);
