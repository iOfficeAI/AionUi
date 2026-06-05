/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mapApprovalActionToDecision, mapApprovalActionToReply, resolveEndpointUsed } from './action';
import { matchesApprovalRule } from './matcher';
import type {
  ApprovalEvaluationContext,
  ApprovalEvaluationResult,
  ApprovalRule,
  ApprovalRuleScope,
  ChislPermissionRequest,
} from './types';

const SCOPE_ORDER: Record<ApprovalRuleScope, number> = {
  session: 0,
  workspace: 1,
  global: 2,
};

function isRuleActive(rule: ApprovalRule, now: number): boolean {
  if (!rule.enabled) return false;
  if (rule.expiry !== undefined && rule.expiry <= now) return false;
  return true;
}

function ruleAppliesToContext(rule: ApprovalRule, context: ApprovalEvaluationContext): boolean {
  switch (rule.scope) {
    case 'session':
      return rule.scopeRef === context.sessionID;
    case 'workspace':
      return rule.scopeRef !== undefined && rule.scopeRef === context.workspaceRef;
    case 'global':
      return true;
    default:
      return false;
  }
}

function ruleMatchesRequest(rule: ApprovalRule, request: ChislPermissionRequest): boolean {
  if (rule.tool !== undefined && rule.tool.length > 0 && rule.tool !== request.tool) {
    return false;
  }
  return matchesApprovalRule(request, rule.matcher);
}

function compareRules(a: ApprovalRule, b: ApprovalRule): number {
  const scopeDelta = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
  if (scopeDelta !== 0) return scopeDelta;
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id.localeCompare(b.id);
}

export function filterActiveApprovalRules(rules: ApprovalRule[], now = Date.now()): ApprovalRule[] {
  return rules.filter((rule) => isRuleActive(rule, now));
}

export function sortApprovalRulesForEvaluation(rules: ApprovalRule[]): ApprovalRule[] {
  return [...rules].sort(compareRules);
}

export function findMatchingApprovalRules(
  rules: ApprovalRule[],
  request: ChislPermissionRequest,
  context: ApprovalEvaluationContext,
  now = Date.now()
): ApprovalRule[] {
  return sortApprovalRulesForEvaluation(
    filterActiveApprovalRules(rules, now).filter(
      (rule) => ruleAppliesToContext(rule, context) && ruleMatchesRequest(rule, request)
    )
  );
}

export function evaluateApprovalRules(
  rules: ApprovalRule[],
  request: ChislPermissionRequest,
  context: ApprovalEvaluationContext,
  now = Date.now()
): ApprovalEvaluationResult {
  const started = Date.now();
  const matching = findMatchingApprovalRules(rules, request, context, now);

  if (matching.length === 0) {
    const replySent = mapApprovalActionToReply(null);
    return {
      decision: 'fallback',
      action: null,
      rule: null,
      replySent,
      endpointUsed: resolveEndpointUsed(replySent),
      reason: 'No matching approval rule; default deny',
      evaluationMs: Date.now() - started,
    };
  }

  const denyRule = matching.find((rule) => rule.action === 'deny');
  if (denyRule) {
    const replySent = mapApprovalActionToReply('deny');
    return {
      decision: 'deny',
      action: 'deny',
      rule: denyRule,
      replySent,
      endpointUsed: resolveEndpointUsed(replySent),
      reason: denyRule.reason ?? `Matched deny rule ${denyRule.name}`,
      evaluationMs: Date.now() - started,
    };
  }

  const selected = matching[0];
  const replySent = mapApprovalActionToReply(selected.action);
  return {
    decision: mapApprovalActionToDecision(selected.action),
    action: selected.action,
    rule: selected,
    replySent,
    endpointUsed: resolveEndpointUsed(replySent),
    reason: selected.reason ?? `Matched rule ${selected.name}`,
    evaluationMs: Date.now() - started,
  };
}
