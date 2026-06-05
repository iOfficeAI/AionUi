/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ApprovalAudit,
  ApprovalEvaluationContext,
  ApprovalEvaluationResult,
  ChislPermissionRequest,
} from './types';

export function buildApprovalAudit(
  request: ChislPermissionRequest,
  context: ApprovalEvaluationContext,
  result: ApprovalEvaluationResult,
  evaluatedAt = Date.now()
): ApprovalAudit {
  const audit: ApprovalAudit = {
    requestId: request.id,
    sessionId: request.sessionID,
    permission: request.permission,
    patterns: [...request.patterns],
    metadata: request.metadata ? { ...request.metadata } : null,
    decision: result.decision,
    replySent: result.replySent,
    endpointUsed: result.endpointUsed,
    reason: result.reason,
    evaluatedAt,
    evaluationMs: result.evaluationMs,
  };

  if (context.principal) {
    audit.principal = context.principal;
  }

  if (result.rule) {
    audit.ruleId = result.rule.id;
    audit.ruleName = result.rule.name;
    audit.ruleScope = result.rule.scope;
    audit.ruleSnapshot = { ...result.rule, tags: [...result.rule.tags] };
  }

  return audit;
}
