/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type CommandSafetyDecision = 'allow_once' | 'manual' | 'deny';

export type CommandSafetyHazardKind =
  | 'chain'
  | 'pipe'
  | 'redirection_write'
  | 'command_substitution'
  | 'pipe_to_shell'
  | 'dynamic_path'
  | 'external_path'
  | 'secret_path'
  | 'destructive_command'
  | 'find_exec'
  | 'find_delete'
  | 'unknown_command';

export type CommandSafetyHazard = {
  kind: CommandSafetyHazardKind;
  detail: string;
};

export type CommandSafetyContext = {
  workspaceRoot: string;
};

export type CommandSafetyClassification = {
  decision: CommandSafetyDecision;
  command: string;
  baseCommand: string | null;
  hazards: CommandSafetyHazard[];
  reasons: string[];
};

export type CommandSafetyApprovalSuggestion = {
  classification: CommandSafetyClassification;
  suggestedAction: 'allow' | 'deny' | 'ask' | null;
  suggestedReason: string;
};
