/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';

export const CHISL_APPROVAL_TABLES = ['approval_rules', 'approval_audits'] as const;

export function initChislApprovalSchema(db: ISqliteDriver): void {
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  try {
    db.pragma('journal_mode = WAL');
  } catch {
    // Continue with default journal mode if WAL fails.
  }

  db.exec(`CREATE TABLE IF NOT EXISTS approval_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scope TEXT NOT NULL,
    scope_ref TEXT,
    tool TEXT,
    matcher_json TEXT NOT NULL,
    action TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    expiry INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    reason TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]'
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_approval_rules_scope ON approval_rules(scope, scope_ref)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_approval_rules_enabled ON approval_rules(enabled)');

  db.exec(`CREATE TABLE IF NOT EXISTS approval_audits (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    permission TEXT NOT NULL,
    patterns_json TEXT NOT NULL,
    metadata_json TEXT,
    decision TEXT NOT NULL,
    rule_id TEXT,
    rule_name TEXT,
    rule_scope TEXT,
    reply_sent TEXT NOT NULL,
    endpoint_used TEXT NOT NULL,
    reason TEXT NOT NULL,
    evaluated_at INTEGER NOT NULL,
    evaluation_ms INTEGER NOT NULL,
    principal TEXT,
    rule_snapshot_json TEXT
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_approval_audits_request_id ON approval_audits(request_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_approval_audits_session_id ON approval_audits(session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_approval_audits_evaluated_at ON approval_audits(evaluated_at)');
}
