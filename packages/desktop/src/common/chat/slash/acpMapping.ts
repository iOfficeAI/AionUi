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

export const mapAcpCommandToSlashCommand = (command: AcpSlashCommandLike): SlashCommandItem => {
  const hint = typeof command.hint === 'string' ? command.hint : undefined;
  const completionBehavior = normalizeCompletionBehavior(
    'command' in command ? command.completion_behavior : command.completionBehavior
  );
  const emptyTurnTipCode =
    typeof ('command' in command ? command.empty_turn_tip_code : command.emptyTurnTipCode) === 'string'
      ? ('command' in command ? command.empty_turn_tip_code : command.emptyTurnTipCode)
      : undefined;
  const emptyTurnTipParams = isObject(
    'command' in command ? command.empty_turn_tip_params : command.emptyTurnTipParams
  )
    ? ('command' in command ? command.empty_turn_tip_params : command.emptyTurnTipParams)
    : undefined;

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
