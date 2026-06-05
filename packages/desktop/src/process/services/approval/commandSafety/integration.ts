/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ApprovalRuleAction, ChislPermissionRequest } from '../types';
import { classifyPermissionCommand } from './classifier';
import type {
  CommandSafetyApprovalSuggestion,
  CommandSafetyClassification,
  CommandSafetyContext,
  CommandSafetyDecision,
} from './types';

function mapDecisionToSuggestedAction(decision: CommandSafetyDecision): ApprovalRuleAction | null {
  switch (decision) {
    case 'allow_once':
      return 'allow';
    case 'manual':
      return 'ask';
    case 'deny':
      return 'deny';
    default:
      return null;
  }
}

function buildSuggestedReason(classification: CommandSafetyClassification): string {
  if (classification.reasons.length > 0) {
    return classification.reasons.join('; ');
  }
  return `Command safety classification: ${classification.decision}`;
}

export function suggestApprovalFromCommandSafety(
  request: ChislPermissionRequest,
  context: CommandSafetyContext
): CommandSafetyApprovalSuggestion | null {
  const classification = classifyPermissionCommand(request.patterns, context);
  if (!classification) return null;

  return {
    classification,
    suggestedAction: mapDecisionToSuggestedAction(classification.decision),
    suggestedReason: buildSuggestedReason(classification),
  };
}

export function buildSuggestedApprovalRuleInput(
  request: ChislPermissionRequest,
  context: CommandSafetyContext
): {
  action: ApprovalRuleAction | null;
  reason: string;
  classification: CommandSafetyClassification;
} | null {
  const suggestion = suggestApprovalFromCommandSafety(request, context);
  if (!suggestion) return null;

  return {
    action: suggestion.suggestedAction,
    reason: suggestion.suggestedReason,
    classification: suggestion.classification,
  };
}
