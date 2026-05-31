import { builtinCommands } from './builtinCommands';
import type { CommandDefinition } from './types';

export const getBuiltinCommands = (): CommandDefinition[] => builtinCommands;

export const getCommandById = (id: string): CommandDefinition | undefined =>
  builtinCommands.find((command) => command.id === id);
