/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildApprovalAudit } from '@/process/services/approval/audit';
import type {
  ApprovalEvaluationContext,
  ApprovalEvaluationResult,
  ApprovalRule,
  ChislPermissionRequest,
} from '@/process/services/approval/types';

const NOW = 1_700_000_000_000;

const request: ChislPermissionRequest = {
  id: 'req-1',
  sessionID: 'sess-a',
  permission: 'bash',
  patterns: ['npm test', 'vitest run'],
  metadata: { command: 'npm test', risk: 'low' },
  tool: 'bash',
};

const context: ApprovalEvaluationContext = {
  sessionID: 'sess-a',
  workspaceRef: 'ws-1',
  principal: 'engineer-1',
};

function buildRule(): ApprovalRule {
  return {
    id: 'rule-1',
    name: 'allow bash',
    scope: 'global',
    matcher: { type: 'exact', field: 'permission', patterns: ['bash'] },
    action: 'allow',
    priority: 10,
    enabled: true,
    createdBy: 'engineer-1',
    createdAt: NOW,
    updatedAt: NOW,
    tags: ['trusted'],
  };
}

function buildResult(overrides: Partial<ApprovalEvaluationResult> = {}): ApprovalEvaluationResult {
  return {
    decision: 'allow',
    action: 'allow',
    rule: buildRule(),
    replySent: 'once',
    endpointUsed: 'preferred',
    reason: 'Matched rule allow bash',
    evaluationMs: 3,
    ...overrides,
  };
}

describe('buildApprovalAudit', () => {
  it('captures request, decision, replySent, and rule fields for allow', () => {
    const result = buildResult();
    const audit = buildApprovalAudit(request, context, result, NOW);

    expect(audit.requestId).toBe('req-1');
    expect(audit.sessionId).toBe('sess-a');
    expect(audit.permission).toBe('bash');
    expect(audit.patterns).toEqual(['npm test', 'vitest run']);
    expect(audit.metadata).toEqual({ command: 'npm test', risk: 'low' });
    expect(audit.decision).toBe('allow');
    expect(audit.replySent).toBe('once');
    expect(audit.endpointUsed).toBe('preferred');
    expect(audit.ruleId).toBe('rule-1');
    expect(audit.ruleName).toBe('allow bash');
    expect(audit.ruleScope).toBe('global');
    expect(audit.ruleSnapshot?.id).toBe('rule-1');
    expect(audit.principal).toBe('engineer-1');
    expect(audit.evaluatedAt).toBe(NOW);
    expect(audit.evaluationMs).toBe(3);
  });

  it('records replySent: reject for deny decisions', () => {
    const result = buildResult({ decision: 'deny', action: 'deny', replySent: 'reject', rule: buildRule() });
    const audit = buildApprovalAudit(request, context, result, NOW);
    expect(audit.replySent).toBe('reject');
    expect(audit.decision).toBe('deny');
  });

  it('records replySent: reject for fallback (no rule)', () => {
    const result = buildResult({
      decision: 'fallback',
      action: null,
      rule: null,
      replySent: 'reject',
      endpointUsed: 'preferred',
    });
    const audit = buildApprovalAudit(request, context, result, NOW);
    expect(audit.replySent).toBe('reject');
    expect(audit.decision).toBe('fallback');
    expect(audit.ruleId).toBeUndefined();
    expect(audit.ruleSnapshot).toBeUndefined();
  });

  it('records replySent: none for ask/manual decisions', () => {
    const result = buildResult({ decision: 'manual', action: 'ask', replySent: 'none', endpointUsed: 'none' });
    const audit = buildApprovalAudit(request, context, result, NOW);
    expect(audit.replySent).toBe('none');
    expect(audit.endpointUsed).toBe('none');
    expect(audit.decision).toBe('manual');
  });

  it('produces a fresh copy of patterns, metadata, and tags (not by reference)', () => {
    const result = buildResult();
    const audit = buildApprovalAudit(request, context, result, NOW);
    expect(audit.patterns).not.toBe(request.patterns);
    expect(audit.patterns).toEqual(request.patterns);
    expect(audit.metadata).not.toBe(request.metadata);
    expect(audit.ruleSnapshot?.tags).not.toBe(result.rule?.tags);
  });
});
