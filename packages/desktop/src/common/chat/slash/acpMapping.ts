/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AcpAvailableCommand,
  AcpSlashCommandApiItem,
  SlashCommandCompletionBehavior,
  SlashCommandItem,
} from './types';

type AcpSlashCommandLike = AcpAvailableCommand | AcpSlashCommandApiItem;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeCompletionBehavior = (value: unknown): SlashCommandCompletionBehavior | undefined => {
  if (value === 'normal' || value === 'neutral_tip_on_empty') {
    return value;
  }
  return undefined;
};

const isHttpSlashCommand = (command: AcpSlashCommandLike): command is AcpSlashCommandApiItem => 'command' in command;

const getHint = (command: AcpSlashCommandLike): string | undefined => {
  if (isHttpSlashCommand(command)) {
    return typeof command.hint === 'string' ? command.hint : undefined;
  }

  return typeof command.input?.hint === 'string' ? command.input.hint : undefined;
};

const getCompletionBehavior = (command: AcpSlashCommandLike): SlashCommandCompletionBehavior | undefined => {
  if (isHttpSlashCommand(command)) {
    return normalizeCompletionBehavior(command.completion_behavior ?? command.completionBehavior);
  }

  return normalizeCompletionBehavior(command._meta?.completion_behavior);
};

const getEmptyTurnTipCode = (command: AcpSlashCommandLike): string | undefined => {
  if (isHttpSlashCommand(command)) {
    const value = command.empty_turn_tip_code ?? command.emptyTurnTipCode;
    return typeof value === 'string' ? value : undefined;
  }

  return typeof command._meta?.empty_turn_tip_code === 'string' ? command._meta.empty_turn_tip_code : undefined;
};

const getEmptyTurnTipParams = (command: AcpSlashCommandLike): Record<string, unknown> | undefined => {
  if (isHttpSlashCommand(command)) {
    const value = command.empty_turn_tip_params ?? command.emptyTurnTipParams;
    return isObject(value) ? value : undefined;
  }

  return isObject(command._meta?.empty_turn_tip_params) ? command._meta.empty_turn_tip_params : undefined;
};

export const mapAcpCommandToSlashCommand = (command: AcpSlashCommandLike): SlashCommandItem => {
  const hint = getHint(command);
  const completionBehavior = getCompletionBehavior(command);
  const emptyTurnTipCode = getEmptyTurnTipCode(command);
  const emptyTurnTipParams = getEmptyTurnTipParams(command);

  return {
    name: 'command' in command ? command.command : command.name,
    description: command.description,
    kind: 'template',
    source: 'acp',
    selectionBehavior: 'insert',
    ...(hint ? { hint } : {}),
    ...(completionBehavior ? { completionBehavior } : {}),
    ...(emptyTurnTipCode ? { emptyTurnTipCode } : {}),
    ...(emptyTurnTipParams ? { emptyTurnTipParams } : {}),
  };
};

export const mapAcpCommandsToSlashCommands = (commands: readonly AcpSlashCommandLike[]): SlashCommandItem[] =>
  commands.map(mapAcpCommandToSlashCommand);
