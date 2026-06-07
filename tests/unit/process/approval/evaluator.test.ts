/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateApprovalRules,
  filterActiveApprovalRules,
  findMatchingApprovalRules,
  sortApprovalRulesForEvaluation,
} from '@/process/services/approval/evaluator';
import type {
  ApprovalEvaluationContext,
  ApprovalRule,
  ChislPermissionRequest,
} from '@/process/services/approval/types';

const NOW = 1_700_000_000_000;

const request: ChislPermissionRequest = {
  id: 'req-1',
  sessionID: 'sess-a',
  permission: 'bash',
  patterns: ['npm test'],
  tool: 'bash',
};

const context: ApprovalEvaluationContext = {
  sessionID: 'sess-a',
  workspaceRef: 'ws-1',
};

function rule(overrides: Partial<ApprovalRule> & Pick<ApprovalRule, 'id' | 'name' | 'action'>): ApprovalRule {
  return {
    scope: 'global',
    matcher: { type: 'exact', field: 'permission', patterns: ['bash'] },
    priority: 0,
    enabled: true,
    createdBy: 'test',
    createdAt: NOW,
    updatedAt: NOW,
    tags: [],
    ...overrides,
  };
}

describe('filterActiveApprovalRules', () => {
  it('excludes disabled rules', () => {
    const active = filterActiveApprovalRules(
      [
        rule({ id: 'r1', name: 'enabled', action: 'allow' }),
        rule({ id: 'r2', name: 'disabled', action: 'allow', enabled: false }),
      ],
      NOW
    );
    expect(active.map((r) => r.id)).toEqual(['r1']);
  });

  it('excludes expired rules', () => {
    const active = filterActiveApprovalRules(
      [
        rule({ id: 'r1', name: 'live', action: 'allow' }),
        rule({ id: 'r2', name: 'expired', action: 'allow', expiry: NOW - 1 }),
        rule({ id: 'r3', name: 'just-expired', action: 'allow', expiry: NOW }),
        rule({ id: 'r4', name: 'future', action: 'allow', expiry: NOW + 1000 }),
      ],
      NOW
    );
    expect(active.map((r) => r.id)).toEqual(['r1', 'r4']);
  });
});

describe('sortApprovalRulesForEvaluation', () => {
  it('orders by scope (session > workspace > global) then priority desc', () => {
    const sorted = sortApprovalRulesForEvaluation([
      rule({ id: 'g-low', name: 'global low', action: 'allow', scope: 'global', priority: 1, createdAt: NOW + 2 }),
      rule({
        id: 's-mid',
        name: 'session mid',
        action: 'allow',
        scope: 'session',
        scopeRef: 'sess-a',
        priority: 5,
        createdAt: NOW + 10,
      }),
      rule({
        id: 's-high',
        name: 'session high',
        action: 'allow',
        scope: 'session',
        scopeRef: 'sess-a',
        priority: 0,
        createdAt: NOW + 11,
      }),
      rule({ id: 'g-high', name: 'global high', action: 'allow', scope: 'global', priority: 10, createdAt: NOW }),
      rule({
        id: 'w-mid',
        name: 'workspace',
        action: 'allow',
        scope: 'workspace',
        scopeRef: 'ws-1',
        priority: 5,
        createdAt: NOW + 1,
      }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['s-mid', 's-high', 'w-mid', 'g-high', 'g-low']);
  });

  it('older createdAt wins as a tie-break after priority', () => {
    const sorted = sortApprovalRulesForEvaluation([
      rule({ id: 'new', name: 'newer', action: 'allow', priority: 5, createdAt: NOW + 5 }),
      rule({ id: 'old', name: 'older', action: 'allow', priority: 5, createdAt: NOW }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['old', 'new']);
  });

  it('id tie-breaks when scope, priority, and createdAt all match', () => {
    const sorted = sortApprovalRulesForEvaluation([
      rule({ id: 'b-rule', name: 'b', action: 'allow', priority: 1, createdAt: NOW }),
      rule({ id: 'a-rule', name: 'a', action: 'allow', priority: 1, createdAt: NOW }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['a-rule', 'b-rule']);
  });
});

describe('findMatchingApprovalRules', () => {
  it('returns no matches when context does not match scope', () => {
    const matches = findMatchingApprovalRules(
      [rule({ id: 'other', name: 'other', action: 'allow', scope: 'session', scopeRef: 'sess-b' })],
      request,
      context,
      NOW
    );
    expect(matches).toEqual([]);
  });

  it('respects rule.tool when set', () => {
    const matches = findMatchingApprovalRules(
      [
        rule({ id: 'bash', name: 'bash only', action: 'allow', tool: 'bash' }),
        rule({ id: 'read', name: 'read only', action: 'allow', tool: 'read' }),
      ],
      request,
      context,
      NOW
    );
    expect(matches.map((r) => r.id)).toEqual(['bash']);
  });
});

describe('evaluateApprovalRules', () => {
  it('default fallback DENY maps to reply reject when no rule matches', () => {
    const result = evaluateApprovalRules([], request, context, NOW);
    expect(result.decision).toBe('fallback');
    expect(result.replySent).toBe('reject');
    expect(result.endpointUsed).toBe('preferred');
    expect(result.rule).toBeNull();
  });

  it('allow maps to reply once', () => {
    const result = evaluateApprovalRules(
      [rule({ id: 'allow-1', name: 'allow bash', action: 'allow' })],
      request,
      context,
      NOW
    );
    expect(result.decision).toBe('allow');
    expect(result.replySent).toBe('once');
    expect(result.endpointUsed).toBe('preferred');
    expect(result.rule?.id).toBe('allow-1');
  });

  it('deny maps to reply reject', () => {
    const result = evaluateApprovalRules(
      [rule({ id: 'deny-1', name: 'deny bash', action: 'deny' })],
      request,
      context,
      NOW
    );
    expect(result.decision).toBe('deny');
    expect(result.replySent).toBe('reject');
    expect(result.endpointUsed).toBe('preferred');
  });

  it('ask/manual maps to no reply', () => {
    const result = evaluateApprovalRules(
      [rule({ id: 'ask-1', name: 'ask bash', action: 'ask' })],
      request,
      context,
      NOW
    );
    expect(result.decision).toBe('manual');
    expect(result.replySent).toBe('none');
    expect(result.endpointUsed).toBe('none');
  });

  it('deny dominates allow when both match', () => {
    const result = evaluateApprovalRules(
      [
        rule({ id: 'allow-1', name: 'allow', action: 'allow', priority: 100 }),
        rule({ id: 'deny-1', name: 'deny', action: 'deny', priority: 0 }),
      ],
      request,
      context,
      NOW
    );
    expect(result.decision).toBe('deny');
    expect(result.rule?.id).toBe('deny-1');
    expect(result.replySent).toBe('reject');
  });

  it('deny dominates ask when both match', () => {
    const result = evaluateApprovalRules(
      [
        rule({ id: 'ask-1', name: 'ask', action: 'ask', priority: 100 }),
        rule({ id: 'deny-1', name: 'deny', action: 'deny', priority: 0 }),
      ],
      request,
      context,
      NOW
    );
    expect(result.decision).toBe('deny');
    expect(result.rule?.id).toBe('deny-1');
  });

  it('session scope wins over global among non-deny matches', () => {
    const result = evaluateApprovalRules(
      [
        rule({ id: 'global-ask', name: 'global ask', action: 'ask', scope: 'global' }),
        rule({ id: 'session-allow', name: 'session allow', action: 'allow', scope: 'session', scopeRef: 'sess-a' }),
      ],
      request,
      context,
      NOW
    );
    expect(result.decision).toBe('allow');
    expect(result.rule?.id).toBe('session-allow');
    expect(result.replySent).toBe('once');
  });

  it('first-match among non-deny rules (highest priority wins)', () => {
    const result = evaluateApprovalRules(
      [
        rule({ id: 'low', name: 'low ask', action: 'ask', priority: 1 }),
        rule({ id: 'high', name: 'high allow', action: 'allow', priority: 50 }),
      ],
      request,
      context,
      NOW
    );
    expect(result.rule?.id).toBe('high');
    expect(result.replySent).toBe('once');
  });

  it('ignores rules outside scope context and falls back to deny', () => {
    const result = evaluateApprovalRules(
      [rule({ id: 'other-session', name: 'other', action: 'allow', scope: 'session', scopeRef: 'sess-b' })],
      request,
      context,
      NOW
    );
    expect(result.decision).toBe('fallback');
    expect(result.replySent).toBe('reject');
  });

  it('ignores disabled and expired rules and falls back to deny', () => {
    const result = evaluateApprovalRules(
      [
        rule({ id: 'd', name: 'disabled', action: 'allow', enabled: false }),
        rule({ id: 'e', name: 'expired', action: 'allow', expiry: NOW - 1 }),
      ],
      request,
      context,
      NOW
    );
    expect(result.decision).toBe('fallback');
    expect(result.replySent).toBe('reject');
  });
});
