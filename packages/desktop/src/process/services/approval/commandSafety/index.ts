/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { classifyPermissionCommand, classifyShellCommand, extractCommandFromPermissionPatterns } from './classifier';
export { checkPathArgument, isWorkspaceContainedPath } from './paths';
export { buildSuggestedApprovalRuleInput, suggestApprovalFromCommandSafety } from './integration';
export type {
  CommandSafetyApprovalSuggestion,
  CommandSafetyClassification,
  CommandSafetyContext,
  CommandSafetyDecision,
  CommandSafetyHazard,
  CommandSafetyHazardKind,
} from './types';
