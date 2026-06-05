/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendApprovalAudit,
  createApprovalRule,
  deleteApprovalRule,
  getApprovalAudit,
  getApprovalRule,
  listApprovalAudits,
  listApprovalRules,
  openChislApprovalStore,
  updateApprovalRule,
  type ChislApprovalStore,
} from '@/process/services/approval/repository';
import type { ApprovalRule, ApprovalAudit, ApprovalMatcher } from '@/process/services/approval/types';

let store: ChislApprovalStore;

beforeEach(() => {
  store = openChislApprovalStore(':memory:');
});

afterEach(() => {
  store.close();
});

const matcher: ApprovalMatcher = { type: 'exact', field: 'permission', patterns: ['bash'] };

function baseRule(overrides: Partial<Parameters<typeof createApprovalRule>[1]> = {}): Parameters<typeof createApprovalRule>[1] {
  return {
    name: 'allow bash',
    scope: 'global',
    matcher,
    action: 'allow',
    priority: 1,
    enabled: true,
    createdBy: 'engineer-1',
    reason: 'trusted dev tool',
    tags: ['trusted'],
    ...overrides,
  };
}

describe('createApprovalRule', () => {
  it('inserts a rule and round-trips fields through getApprovalRule', () => {
    const created = createApprovalRule(store, baseRule());
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.name).toBe('allow bash');
    expect(created.scope).toBe('global');
    expect(created.tool).toBeUndefined();
    expect(created.matcher).toEqual(matcher);
    expect(created.action).toBe('allow');
    expect(created.priority).toBe(1);
    expect(created.enabled).toBe(true);
    expect(created.reason).toBe('trusted dev tool');
    expect(created.tags).toEqual(['trusted']);

    const loaded = getApprovalRule(store, created.id);
    expect(loaded).toEqual(created);
  });

  it('preserves scopeRef and tool when provided', () => {
    const created = createApprovalRule(
      store,
      baseRule({ scope: 'session', scopeRef: 'sess-a', tool: 'bash' })
    );
    const loaded = getApprovalRule(store, created.id);
    expect(loaded?.scope).toBe('session');
    expect(loaded?.scopeRef).toBe('sess-a');
    expect(loaded?.tool).toBe('bash');
  });
});

describe('listApprovalRules', () => {
  it('returns rules in createdAt ASC order', () => {
    const a = createApprovalRule(store, baseRule({ name: 'a' }));
    const b = createApprovalRule(store, baseRule({ name: 'b' }));
    const c = createApprovalRule(store, baseRule({ name: 'c' }));
    const ids = listApprovalRules(store).map((r) => r.id);
    expect(ids).toEqual([a.id, b.id, c.id]);
  });
});

describe('updateApprovalRule', () => {
  it('updates mutable fields and bumps updatedAt', () => {
    const created = createApprovalRule(store, baseRule());
    const before = created.updatedAt;
    const updated = updateApprovalRule(store, created.id, {
      action: 'deny',
      enabled: false,
      priority: 99,
      reason: 'revoked',
      tags: ['revoked'],
    });
    expect(updated?.action).toBe('deny');
    expect(updated?.enabled).toBe(false);
    expect(updated?.priority).toBe(99);
    expect(updated?.reason).toBe('revoked');
    expect(updated?.tags).toEqual(['revoked']);
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(before);

    const loaded = getApprovalRule(store, created.id);
    expect(loaded?.action).toBe('deny');
    expect(loaded?.enabled).toBe(false);
  });

  it('returns null for unknown id', () => {
    const result = updateApprovalRule(store, 'missing', { enabled: false });
    expect(result).toBeNull();
  });
});

describe('deleteApprovalRule', () => {
  it('removes the row', () => {
    const created = createApprovalRule(store, baseRule());
    expect(deleteApprovalRule(store, created.id)).toBe(true);
    expect(getApprovalRule(store, created.id)).toBeNull();
  });

  it('returns false when id is missing', () => {
    expect(deleteApprovalRule(store, 'missing')).toBe(false);
  });
});

describe('appendApprovalAudit / getApprovalAudit / listApprovalAudits', () => {
  it('appends an immutable audit record and round-trips it', () => {
    const audit: ApprovalAudit = {
      requestId: 'req-1',
      sessionId: 'sess-a',
      permission: 'bash',
      patterns: ['npm test'],
      metadata: { command: 'npm test' },
      decision: 'allow',
      ruleId: 'rule-1',
      ruleName: 'allow bash',
      ruleScope: 'global',
      replySent: 'once',
      endpointUsed: 'preferred',
      reason: 'matched allow rule',
      evaluatedAt: 1_700_000_000_000,
      evaluationMs: 2,
      principal: 'engineer-1',
      ruleSnapshot: {
        id: 'rule-1',
        name: 'allow bash',
        scope: 'global',
        matcher,
        action: 'allow',
        priority: 1,
        enabled: true,
        createdBy: 'engineer-1',
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        tags: [],
      } satisfies ApprovalRule,
    };
    const stored = appendApprovalAudit(store, audit);
    expect(stored.id.length).toBeGreaterThan(0);

    const loaded = getApprovalAudit(store, stored.id);
    expect(loaded).toEqual(audit);
  });

  it('lists audits for a specific requestId', () => {
    const base = {
      sessionId: 'sess-a',
      permission: 'bash',
      patterns: [],
      metadata: null,
      decision: 'fallback' as const,
      replySent: 'reject' as const,
      endpointUsed: 'preferred' as const,
      reason: 'no match',
      evaluatedAt: 1,
      evaluationMs: 0,
    };
    appendApprovalAudit(store, { ...base, requestId: 'r1' });
    appendApprovalAudit(store, { ...base, requestId: 'r1' });
    appendApprovalAudit(store, { ...base, requestId: 'r2' });
    const r1 = listApprovalAudits(store, 'r1');
    expect(r1).toHaveLength(2);
    expect(r1.every((a) => a.requestId === 'r1')).toBe(true);
    expect(listApprovalAudits(store)).toHaveLength(3);
  });
});
