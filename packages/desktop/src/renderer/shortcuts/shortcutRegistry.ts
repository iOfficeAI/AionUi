import type { CommandContext, CommandDefinition } from '@/renderer/commands/types';
import { matchesAccelerator, normalizeAccelerator } from './accelerator';
import { getDefaultShortcutBindings, getReservedShortcutBindings } from './defaultBindings';
import type { EffectiveShortcutBinding, KeyboardShortcutsConfig, ShortcutBinding, ShortcutConflict } from './types';

export const KEYBOARD_SHORTCUTS_CONFIG_KEY = 'keyboard.shortcuts' as const;

const VALID_BINDING_SCOPES = new Set(['global', 'route', 'component']);

const isValidBindingScope = (scope: unknown): scope is ShortcutBinding['scope'] =>
  scope === undefined || (typeof scope === 'string' && VALID_BINDING_SCOPES.has(scope));

export const isKeyboardShortcutsConfig = (value: unknown): value is KeyboardShortcutsConfig => {
  const candidate = value as KeyboardShortcutsConfig | undefined;
  return (
    Boolean(candidate) &&
    candidate?.version === 1 &&
    Array.isArray(candidate.bindings) &&
    candidate.bindings.every(
      (binding) =>
        binding &&
        typeof binding.commandId === 'string' &&
        (typeof binding.accelerator === 'string' || binding.accelerator === null) &&
        isValidBindingScope(binding.scope) &&
        (binding.enabled === undefined || typeof binding.enabled === 'boolean')
    )
  );
};

export const normalizeKeyboardShortcutsConfig = (
  value: unknown,
  commands: CommandDefinition[]
): { config: KeyboardShortcutsConfig | null; conflicts: ShortcutConflict[] } => {
  if (!value || typeof value !== 'object') {
    return { config: null, conflicts: [] };
  }

  const candidate = value as { version?: unknown; bindings?: unknown };
  if (candidate.version !== 1 || !Array.isArray(candidate.bindings)) {
    return { config: null, conflicts: [] };
  }

  const commandIds = new Set(commands.map((command) => command.id));
  const seenCommandIds = new Set<string>();
  const bindings: ShortcutBinding[] = [];
  const conflicts: ShortcutConflict[] = [];

  for (const rawBinding of candidate.bindings) {
    const binding = rawBinding as Partial<ShortcutBinding> | undefined;
    if (
      !binding ||
      typeof binding.commandId !== 'string' ||
      !(typeof binding.accelerator === 'string' || binding.accelerator === null) ||
      (binding.enabled !== undefined && typeof binding.enabled !== 'boolean')
    ) {
      conflicts.push({
        type: 'invalid',
        severity: 'error',
        commandIds: [],
        message: 'Invalid shortcut binding shape.',
      });
      continue;
    }

    if (!commandIds.has(binding.commandId)) {
      conflicts.push({
        type: 'invalid',
        severity: 'error',
        accelerator: binding.accelerator ?? undefined,
        commandIds: [binding.commandId],
        message: `Unknown shortcut command ${binding.commandId}.`,
      });
      continue;
    }

    if (!isValidBindingScope(binding.scope)) {
      conflicts.push({
        type: 'invalid',
        severity: 'error',
        accelerator: binding.accelerator ?? undefined,
        commandIds: [binding.commandId],
        message: `Invalid shortcut scope for ${binding.commandId}.`,
      });
      continue;
    }

    if (seenCommandIds.has(binding.commandId)) {
      conflicts.push({
        type: 'duplicate',
        severity: 'error',
        accelerator: binding.accelerator ?? undefined,
        commandIds: [binding.commandId],
        message: `Duplicate shortcut override for ${binding.commandId}.`,
      });
      continue;
    }

    seenCommandIds.add(binding.commandId);
    bindings.push({
      commandId: binding.commandId,
      accelerator: binding.accelerator,
      scope: binding.scope,
      enabled: binding.enabled,
    });
  }

  return {
    config: {
      version: 1,
      bindings,
    },
    conflicts,
  };
};

export const createDefaultKeyboardShortcutsConfig = (commands: CommandDefinition[]): KeyboardShortcutsConfig => ({
  version: 1,
  bindings: getDefaultShortcutBindings(commands),
});

export const setShortcutBindingOverride = (
  config: KeyboardShortcutsConfig | null | undefined,
  commandId: string,
  accelerator: string | null,
  enabled = true
): KeyboardShortcutsConfig => {
  const bindings = (config?.bindings ?? []).filter((binding) => binding.commandId !== commandId);
  bindings.push({ commandId, accelerator, enabled });
  return { version: 1, bindings };
};

export const removeShortcutBindingOverride = (
  config: KeyboardShortcutsConfig | null | undefined,
  commandId: string
): KeyboardShortcutsConfig => ({
  version: 1,
  bindings: (config?.bindings ?? []).filter((binding) => binding.commandId !== commandId),
});

export const validateShortcutBindingOverride = (
  commands: CommandDefinition[],
  config: KeyboardShortcutsConfig | null | undefined,
  commandId: string,
  accelerator: string | null,
  enabled = true
): ShortcutConflict[] => {
  const command = commands.find((candidate) => candidate.id === commandId);
  if (!command) {
    return [
      {
        type: 'invalid',
        severity: 'error',
        accelerator: accelerator ?? undefined,
        commandIds: [commandId],
        message: `Unknown shortcut command ${commandId}.`,
      },
    ];
  }

  const candidateConfig = setShortcutBindingOverride(config, commandId, accelerator, enabled);
  return getShortcutConflicts(commands, candidateConfig).filter((conflict) => {
    if (!conflict.commandIds.includes(commandId)) return false;
    if (
      conflict.type === 'duplicate' &&
      conflict.commandIds.length === 1 &&
      conflict.commandIds[0] === commandId &&
      normalizeAccelerator(accelerator ?? '') === normalizeAccelerator(command.defaultShortcut ?? '')
    ) {
      return false;
    }
    return true;
  });
};

const commandPriority = (command: CommandDefinition): number => {
  if (command.scope === 'component') return 300;
  if (command.scope === 'route') return 200;
  if (command.scope === 'app') return 100;
  return 0;
};

export const getEffectiveShortcutBindings = (
  commands: CommandDefinition[],
  config: KeyboardShortcutsConfig | null | undefined
): EffectiveShortcutBinding[] => {
  const userBindings = new Map<string, ShortcutBinding>();
  if (config?.version === 1) {
    for (const binding of config.bindings) {
      userBindings.set(binding.commandId, binding);
    }
  }

  const bindings: EffectiveShortcutBinding[] = [];
  for (const command of commands) {
    if (command.status !== 'enabled') continue;
    const userBinding = userBindings.get(command.id);
    const accelerator = userBinding ? userBinding.accelerator : command.defaultShortcut;
    const enabled = userBinding?.enabled ?? true;
    if (!enabled || !accelerator) continue;
    const normalized = normalizeAccelerator(accelerator);
    if (!normalized) continue;
    bindings.push({
      commandId: command.id,
      accelerator,
      scope: userBinding?.scope ?? (command.scope === 'route' ? 'route' : 'global'),
      enabled: true,
      command,
      source: userBinding ? 'user' : 'default',
    });
  }
  return bindings.toSorted((a, b) => commandPriority(b.command) - commandPriority(a.command));
};

export const getShortcutConflicts = (
  commands: CommandDefinition[],
  config: KeyboardShortcutsConfig | null | undefined
): ShortcutConflict[] => {
  const conflicts: ShortcutConflict[] = [];
  const normalizedConfig = normalizeKeyboardShortcutsConfig(config, commands);
  conflicts.push(...normalizedConfig.conflicts);

  if (config?.version === 1) {
    for (const binding of config.bindings) {
      if (binding.accelerator && !normalizeAccelerator(binding.accelerator)) {
        conflicts.push({
          type: 'invalid',
          severity: 'error',
          accelerator: binding.accelerator,
          commandIds: [binding.commandId],
          message: `Invalid shortcut accelerator for ${binding.commandId}.`,
        });
      }
    }
  }

  const activeBindings = getEffectiveShortcutBindings(commands, normalizedConfig.config);
  const reservedBindings = getReservedShortcutBindings(commands);
  const activeByAccelerator = new Map<string, EffectiveShortcutBinding[]>();

  for (const binding of activeBindings) {
    const normalized = normalizeAccelerator(binding.accelerator);
    if (!normalized) continue;
    const group = activeByAccelerator.get(normalized) ?? [];
    group.push(binding);
    activeByAccelerator.set(normalized, group);
  }

  for (const [accelerator, bindings] of activeByAccelerator) {
    if (bindings.length > 1) {
      conflicts.push({
        type: 'duplicate',
        severity: 'error',
        accelerator,
        commandIds: bindings.map((binding) => binding.commandId),
        message: `Multiple enabled commands share ${accelerator}.`,
      });
    }
  }

  for (const reserved of reservedBindings) {
    if (!reserved.accelerator) continue;
    const normalized = normalizeAccelerator(reserved.accelerator);
    if (!normalized) continue;
    const active = activeByAccelerator.get(normalized);
    if (!active?.length) continue;
    const reservedCommand = commands.find((command) => command.id === reserved.commandId);
    conflicts.push({
      type: reservedCommand?.status === 'existing' ? 'existingLocal' : 'reserved',
      severity: 'warning',
      accelerator: normalized,
      commandIds: [reserved.commandId, ...active.map((binding) => binding.commandId)],
      message: reservedCommand?.reservedReason ?? `${normalized} is reserved outside the renderer shortcut registry.`,
    });
  }

  return conflicts;
};

export const getRegisterableShortcutBindings = (
  commands: CommandDefinition[],
  config: KeyboardShortcutsConfig | null | undefined
): EffectiveShortcutBinding[] => {
  const bindings = getEffectiveShortcutBindings(commands, config);
  const conflicts = getShortcutConflicts(commands, config);
  const blockedCommandIds = new Set<string>();

  for (const conflict of conflicts) {
    if (conflict.type !== 'duplicate' && conflict.type !== 'reserved' && conflict.type !== 'existingLocal') {
      continue;
    }
    for (const commandId of conflict.commandIds) {
      blockedCommandIds.add(commandId);
    }
  }

  return bindings.filter((binding) => !blockedCommandIds.has(binding.commandId));
};

export const findShortcutCommand = (
  event: KeyboardEvent,
  commands: CommandDefinition[],
  config: KeyboardShortcutsConfig | null | undefined,
  ctx: CommandContext
): CommandDefinition | null => {
  if (event.defaultPrevented || event.isComposing) {
    return null;
  }

  const bindings = getRegisterableShortcutBindings(commands, config);
  for (const binding of bindings) {
    const command = binding.command;
    if (!command.run) continue;
    if (!matchesAccelerator(event, binding.accelerator)) continue;
    if (command.when && !command.when(ctx)) continue;
    return command;
  }
  return null;
};
