/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHISL_APPROVAL_TABLES, initChislApprovalSchema } from '@/process/services/approval/schema';
import { openChislApprovalStore, type ChislApprovalStore } from '@/process/services/approval/repository';

let store: ChislApprovalStore;

beforeEach(() => {
  store = openChislApprovalStore(':memory:');
});

afterEach(() => {
  store.close();
});

function listTables(): string[] {
  return (
    store.driver
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`)
      .all() as { name: string }[]
  ).map((row) => row.name);
}

function listIndexes(table: string): string[] {
  return (
    store.driver
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? ORDER BY name ASC`)
      .all(table) as { name: string }[]
  ).map((row) => row.name);
}

describe('initChislApprovalSchema', () => {
  it('creates all required Chisl approval tables', () => {
    const tables = listTables();
    for (const expected of CHISL_APPROVAL_TABLES) {
      expect(tables).toContain(expected);
    }
  });

  it('is idempotent when invoked repeatedly', () => {
    initChislApprovalSchema(store.driver);
    initChislApprovalSchema(store.driver);
    const tables = listTables();
    for (const expected of CHISL_APPROVAL_TABLES) {
      expect(tables.filter((name) => name === expected)).toHaveLength(1);
    }
  });

  it('creates expected indexes for rules and audits', () => {
    const ruleIndexes = listIndexes('approval_rules');
    expect(ruleIndexes).toContain('idx_approval_rules_scope');
    expect(ruleIndexes).toContain('idx_approval_rules_enabled');
    const auditIndexes = listIndexes('approval_audits');
    expect(auditIndexes).toContain('idx_approval_audits_request_id');
    expect(auditIndexes).toContain('idx_approval_audits_session_id');
    expect(auditIndexes).toContain('idx_approval_audits_evaluated_at');
  });
});
