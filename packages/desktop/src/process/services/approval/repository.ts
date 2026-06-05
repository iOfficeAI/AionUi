/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import { initChislApprovalSchema } from './schema';
import type {
  ApprovalAudit,
  ApprovalAuditRow,
  ApprovalRule,
  ApprovalRuleCreate,
  ApprovalRuleRow,
  ApprovalRuleUpdate,
} from './types';

export type ChislApprovalStore = {
  driver: ISqliteDriver;
  close(): void;
};

function rowToApprovalRule(row: ApprovalRuleRow): ApprovalRule {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    scopeRef: row.scope_ref ?? undefined,
    tool: row.tool ?? undefined,
    matcher: JSON.parse(row.matcher_json),
    action: row.action,
    priority: row.priority,
    expiry: row.expiry ?? undefined,
    enabled: row.enabled === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reason: row.reason ?? undefined,
    tags: JSON.parse(row.tags_json),
  };
}

function approvalRuleToRow(rule: ApprovalRule): ApprovalRuleRow {
  return {
    id: rule.id,
    name: rule.name,
    scope: rule.scope,
    scope_ref: rule.scopeRef ?? null,
    tool: rule.tool ?? null,
    matcher_json: JSON.stringify(rule.matcher),
    action: rule.action,
    priority: rule.priority,
    expiry: rule.expiry ?? null,
    enabled: rule.enabled ? 1 : 0,
    created_by: rule.createdBy,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
    reason: rule.reason ?? null,
    tags_json: JSON.stringify(rule.tags),
  };
}

function rowToApprovalAudit(row: ApprovalAuditRow): ApprovalAudit {
  const audit: ApprovalAudit = {
    requestId: row.request_id,
    sessionId: row.session_id,
    permission: row.permission,
    patterns: JSON.parse(row.patterns_json),
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    decision: row.decision,
    replySent: row.reply_sent,
    endpointUsed: row.endpoint_used,
    reason: row.reason,
    evaluatedAt: row.evaluated_at,
    evaluationMs: row.evaluation_ms,
  };
  if (row.rule_id) audit.ruleId = row.rule_id;
  if (row.rule_name) audit.ruleName = row.rule_name;
  if (row.rule_scope) audit.ruleScope = row.rule_scope;
  if (row.principal) audit.principal = row.principal;
  if (row.rule_snapshot_json) audit.ruleSnapshot = JSON.parse(row.rule_snapshot_json);
  return audit;
}

function approvalAuditToRow(id: string, audit: ApprovalAudit): ApprovalAuditRow {
  return {
    id,
    request_id: audit.requestId,
    session_id: audit.sessionId,
    permission: audit.permission,
    patterns_json: JSON.stringify(audit.patterns),
    metadata_json: audit.metadata ? JSON.stringify(audit.metadata) : null,
    decision: audit.decision,
    rule_id: audit.ruleId ?? null,
    rule_name: audit.ruleName ?? null,
    rule_scope: audit.ruleScope ?? null,
    reply_sent: audit.replySent,
    endpoint_used: audit.endpointUsed,
    reason: audit.reason,
    evaluated_at: audit.evaluatedAt,
    evaluation_ms: audit.evaluationMs,
    principal: audit.principal ?? null,
    rule_snapshot_json: audit.ruleSnapshot ? JSON.stringify(audit.ruleSnapshot) : null,
  };
}

export function openChislApprovalStore(dbPath: string): ChislApprovalStore {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const driver = new BetterSqlite3Driver(dbPath);
  initChislApprovalSchema(driver);
  return {
    driver,
    close: () => driver.close(),
  };
}

export function createApprovalRule(store: ChislApprovalStore, input: ApprovalRuleCreate): ApprovalRule {
  const now = Date.now();
  const rule: ApprovalRule = {
    id: input.id ?? randomUUID(),
    name: input.name,
    scope: input.scope,
    scopeRef: input.scopeRef,
    tool: input.tool,
    matcher: input.matcher,
    action: input.action,
    priority: input.priority ?? 0,
    expiry: input.expiry,
    enabled: input.enabled ?? true,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    reason: input.reason,
    tags: input.tags ?? [],
  };
  const row = approvalRuleToRow(rule);
  store.driver
    .prepare(
      `INSERT INTO approval_rules (
        id, name, scope, scope_ref, tool, matcher_json, action, priority, expiry,
        enabled, created_by, created_at, updated_at, reason, tags_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.name,
      row.scope,
      row.scope_ref,
      row.tool,
      row.matcher_json,
      row.action,
      row.priority,
      row.expiry,
      row.enabled,
      row.created_by,
      row.created_at,
      row.updated_at,
      row.reason,
      row.tags_json
    );
  const loaded = getApprovalRule(store, rule.id);
  if (!loaded) {
    throw new Error('Failed to load approval rule after insert');
  }
  return loaded;
}

export function getApprovalRule(store: ChislApprovalStore, id: string): ApprovalRule | null {
  const row = store.driver
    .prepare(
      `SELECT id, name, scope, scope_ref, tool, matcher_json, action, priority, expiry,
              enabled, created_by, created_at, updated_at, reason, tags_json
       FROM approval_rules WHERE id = ?`
    )
    .get(id) as ApprovalRuleRow | undefined;
  return row ? rowToApprovalRule(row) : null;
}

export function listApprovalRules(store: ChislApprovalStore): ApprovalRule[] {
  const rows = store.driver
    .prepare(
      `SELECT id, name, scope, scope_ref, tool, matcher_json, action, priority, expiry,
              enabled, created_by, created_at, updated_at, reason, tags_json
       FROM approval_rules ORDER BY created_at ASC`
    )
    .all() as ApprovalRuleRow[];
  return rows.map(rowToApprovalRule);
}

export function updateApprovalRule(
  store: ChislApprovalStore,
  id: string,
  update: ApprovalRuleUpdate
): ApprovalRule | null {
  const existing = getApprovalRule(store, id);
  if (!existing) return null;
  const next: ApprovalRule = {
    ...existing,
    name: update.name ?? existing.name,
    scope: update.scope ?? existing.scope,
    scopeRef: update.scopeRef !== undefined ? update.scopeRef : existing.scopeRef,
    tool: update.tool !== undefined ? update.tool : existing.tool,
    matcher: update.matcher ?? existing.matcher,
    action: update.action ?? existing.action,
    priority: update.priority ?? existing.priority,
    expiry: update.expiry !== undefined ? update.expiry : existing.expiry,
    enabled: update.enabled ?? existing.enabled,
    reason: update.reason !== undefined ? update.reason : existing.reason,
    tags: update.tags ?? existing.tags,
    updatedAt: Date.now(),
  };
  const row = approvalRuleToRow(next);
  store.driver
    .prepare(
      `UPDATE approval_rules SET
        name = ?, scope = ?, scope_ref = ?, tool = ?, matcher_json = ?, action = ?,
        priority = ?, expiry = ?, enabled = ?, updated_at = ?, reason = ?, tags_json = ?
       WHERE id = ?`
    )
    .run(
      row.name,
      row.scope,
      row.scope_ref,
      row.tool,
      row.matcher_json,
      row.action,
      row.priority,
      row.expiry,
      row.enabled,
      row.updated_at,
      row.reason,
      row.tags_json,
      id
    );
  return getApprovalRule(store, id);
}

export function deleteApprovalRule(store: ChislApprovalStore, id: string): boolean {
  const result = store.driver.prepare(`DELETE FROM approval_rules WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function appendApprovalAudit(store: ChislApprovalStore, audit: ApprovalAudit): ApprovalAudit {
  const id = randomUUID();
  const row = approvalAuditToRow(id, audit);
  store.driver
    .prepare(
      `INSERT INTO approval_audits (
        id, request_id, session_id, permission, patterns_json, metadata_json, decision,
        rule_id, rule_name, rule_scope, reply_sent, endpoint_used, reason,
        evaluated_at, evaluation_ms, principal, rule_snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.request_id,
      row.session_id,
      row.permission,
      row.patterns_json,
      row.metadata_json,
      row.decision,
      row.rule_id,
      row.rule_name,
      row.rule_scope,
      row.reply_sent,
      row.endpoint_used,
      row.reason,
      row.evaluated_at,
      row.evaluation_ms,
      row.principal,
      row.rule_snapshot_json
    );
  const loaded = getApprovalAudit(store, id);
  if (!loaded) {
    throw new Error('Failed to load approval audit after insert');
  }
  return { ...loaded, id };
}

export function getApprovalAudit(store: ChislApprovalStore, id: string): ApprovalAudit | null {
  const row = store.driver
    .prepare(
      `SELECT id, request_id, session_id, permission, patterns_json, metadata_json, decision,
              rule_id, rule_name, rule_scope, reply_sent, endpoint_used, reason,
              evaluated_at, evaluation_ms, principal, rule_snapshot_json
       FROM approval_audits WHERE id = ?`
    )
    .get(id) as ApprovalAuditRow | undefined;
  return row ? rowToApprovalAudit(row) : null;
}

export function listApprovalAudits(store: ChislApprovalStore, requestId?: string): ApprovalAudit[] {
  const baseSql = `SELECT id, request_id, session_id, permission, patterns_json, metadata_json, decision,
              rule_id, rule_name, rule_scope, reply_sent, endpoint_used, reason,
              evaluated_at, evaluation_ms, principal, rule_snapshot_json
       FROM approval_audits`;
  const rows = requestId
    ? (store.driver
        .prepare(`${baseSql} WHERE request_id = ? ORDER BY evaluated_at ASC`)
        .all(requestId) as ApprovalAuditRow[])
    : (store.driver.prepare(`${baseSql} ORDER BY evaluated_at ASC`).all() as ApprovalAuditRow[]);
  return rows.map(rowToApprovalAudit);
}
