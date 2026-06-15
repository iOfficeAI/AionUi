/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { resolveCommandEveRuntimeBootstrapPaths } from './runtimeBootstrapCore';

export const COMMAND_EVE_CRM_OVERLAY_BRIDGE_VERSION = 'command-eve-crm-overlay/v0';
export const COMMAND_EVE_CRM_OVERLAY_INITIALIZE_BRIDGE_VERSION = 'command-eve-crm-overlay-initialize/v0';
export const COMMAND_EVE_CRM_DRAFT_CREATE_BRIDGE_VERSION = 'command-eve-crm-draft-create/v0';
export const COMMAND_EVE_CRM_STAGE_LOCAL_BRIDGE_VERSION = 'command-eve-crm-stage-local/v0';

export type CommandEveCrmOverlayStatus = 'ready' | 'blocked' | 'failed';

export type CommandEveCrmOverlayPolicy = {
  local_only: true;
  plane_sync_enabled: false;
  hosted_sync_enabled: false;
  bulk_import_enabled: false;
  enrichment_enabled: false;
  outreach_enabled: false;
  crm_data_class_default: 'S2';
  customer_write_requires_humangate: 'HG-4';
  deal_action_ceiling_without_consent: 'draft-only';
};

export type CommandEveCrmOverlayCounts = {
  companies: number;
  contacts: number;
  deals: number;
  audit_events: number;
};

export type CommandEveCrmOverlayDeal = {
  deal_id: string;
  company_id: string;
  stage: string;
  allowed_actions: string;
  consent_status: string;
  human_gate: string;
  data_class: string;
  last_activity_at: string;
};

export type CommandEveCrmOverlayModel = {
  schema_version: 'command-eve-crm-overlay/v0';
  generated_at: string;
  initialized: boolean;
  db_path: string;
  event_ledger_path: string;
  policy: CommandEveCrmOverlayPolicy;
  counts: CommandEveCrmOverlayCounts;
  recent_deals: CommandEveCrmOverlayDeal[];
  warnings: string[];
};

export type CommandEveCrmOverlayResult = {
  version: typeof COMMAND_EVE_CRM_OVERLAY_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveCrmOverlayStatus;
  reason_code?: string;
  message?: string;
  model?: CommandEveCrmOverlayModel;
  source: {
    generated_by: 'command-eve-crm-overlay-core';
    hermes_home: string;
  };
};

export type CommandEveCrmOverlayInitializeResult = {
  version: typeof COMMAND_EVE_CRM_OVERLAY_INITIALIZE_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveCrmOverlayStatus;
  reason_code?: string;
  message?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  model?: CommandEveCrmOverlayModel;
  source: {
    generated_by: 'command-eve-crm-overlay-core';
    hermes_home: string;
  };
};

export type CommandEveCrmDraftCreateResult = {
  version: typeof COMMAND_EVE_CRM_DRAFT_CREATE_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveCrmOverlayStatus;
  reason_code?: string;
  message?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  company_id?: string;
  contact_id?: string;
  deal_id?: string;
  model?: CommandEveCrmOverlayModel;
  source: {
    generated_by: 'command-eve-crm-overlay-core';
    hermes_home: string;
  };
};

export type CommandEveCrmStageLocalRequest = {
  dealId: string;
  targetStage: 'qualified';
};

export type CommandEveCrmStageLocalResult = {
  version: typeof COMMAND_EVE_CRM_STAGE_LOCAL_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveCrmOverlayStatus;
  reason_code?: string;
  message?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  deal_id?: string;
  previous_stage?: string;
  stage?: string;
  model?: CommandEveCrmOverlayModel;
  source: {
    generated_by: 'command-eve-crm-overlay-core';
    hermes_home: string;
  };
};

export type CommandEveCrmOverlayOptions = {
  userDataPath: string;
  eventLedgerPath?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  pythonPath?: string;
};

type JsonRecord = Record<string, unknown>;

function policy(): CommandEveCrmOverlayPolicy {
  return {
    local_only: true,
    plane_sync_enabled: false,
    hosted_sync_enabled: false,
    bulk_import_enabled: false,
    enrichment_enabled: false,
    outreach_enabled: false,
    crm_data_class_default: 'S2',
    customer_write_requires_humangate: 'HG-4',
    deal_action_ceiling_without_consent: 'draft-only',
  };
}

function crmDbPath(hermesHome: string): string {
  return path.join(hermesHome, 'crm', 'command-eve-crm.db');
}

function pythonBinary(paths: ReturnType<typeof resolveCommandEveRuntimeBootstrapPaths>, fallback?: string): string {
  const hermesPython =
    process.platform === 'win32'
      ? path.join(paths.hermesVenv, 'Scripts', 'python.exe')
      : path.join(paths.hermesVenv, 'bin', 'python');
  if (fs.existsSync(hermesPython)) return hermesPython;
  const candidates = [
    fallback,
    process.env.COMMAND_EVE_PYTHON_BINARY,
    process.platform === 'darwin' ? '/opt/homebrew/bin/python3' : undefined,
    process.platform === 'darwin' ? '/usr/local/bin/python3' : undefined,
    process.platform === 'darwin' ? '/usr/bin/python3' : undefined,
    'python3',
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    return candidate;
  }
  return 'python3';
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return undefined;
}

function resolveEventLedgerPath(
  paths: ReturnType<typeof resolveCommandEveRuntimeBootstrapPaths>,
  options: Pick<CommandEveCrmOverlayOptions, 'eventLedgerPath' | 'env'>
): string {
  const env = options.env ?? process.env;
  const companyOsRoot = firstNonEmpty(
    env.COMMAND_EVE_COMPANY_OS_ROOT,
    env.COMPANY_OS_ROOT,
    env.COMMAND_EVE_SOURCE_ROOT
  );
  return (
    firstNonEmpty(
      options.eventLedgerPath,
      env.COMMAND_EVE_AGENT_EVENTS_PATH,
      companyOsRoot ? path.join(companyOsRoot, 'metrics', 'agent-events.jsonl') : undefined
    ) || path.join(paths.runtimeRoot, 'agent-events.jsonl')
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPythonJson(
  pythonPath: string,
  input: JsonRecord,
  script: string,
  cwd: string
): { ok: boolean; data?: JsonRecord; error?: string } {
  fs.mkdirSync(cwd, { recursive: true });
  const result = spawnSync(pythonPath, ['-c', script], {
    cwd,
    env: { ...process.env, PYTHONNOUSERSITE: '1' },
    input: `${JSON.stringify(input)}\n`,
    encoding: 'utf8',
    shell: false,
    timeout: 15_000,
    windowsHide: true,
    maxBuffer: 512 * 1024,
  });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status !== 0) {
    return { ok: false, error: result.stderr || result.stdout || `python exited with ${result.status}` };
  }
  try {
    const parsed = JSON.parse(result.stdout || '{}') as unknown;
    return isRecord(parsed) ? { ok: true, data: parsed } : { ok: false, error: 'python returned non-object JSON' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'python JSON parse failed' };
  }
}

function crmReadScript(): string {
  return String.raw`
import json
import os
import sqlite3
import sys

request = json.loads(sys.stdin.read() or "{}")
db_path = request["db_path"]
if not os.path.isfile(db_path):
    print(json.dumps({"initialized": False, "counts": {"companies": 0, "contacts": 0, "deals": 0, "audit_events": 0}}))
    sys.exit(0)

conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
try:
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    required = {"crm_companies", "crm_contacts", "crm_deals", "crm_events"}
    if not required.issubset(tables):
        print(json.dumps({
            "initialized": False,
            "counts": {"companies": 0, "contacts": 0, "deals": 0, "audit_events": 0},
            "warnings": ["crm_schema_incomplete"],
        }))
        sys.exit(0)
    counts = {
        "companies": int(conn.execute("SELECT COUNT(*) FROM crm_companies").fetchone()[0]),
        "contacts": int(conn.execute("SELECT COUNT(*) FROM crm_contacts").fetchone()[0]),
        "deals": int(conn.execute("SELECT COUNT(*) FROM crm_deals").fetchone()[0]),
        "audit_events": int(conn.execute("SELECT COUNT(*) FROM crm_events").fetchone()[0]),
    }
    recent_deals = [
        {
            "deal_id": row[0],
            "company_id": row[1] or "",
            "stage": row[2],
            "allowed_actions": row[3],
            "consent_status": row[4],
            "human_gate": row[5],
            "data_class": row[6],
            "last_activity_at": row[7] or "",
        }
        for row in conn.execute(
            """
            SELECT deal_id, company_id, stage, allowed_actions, consent_status, human_gate, data_class, last_activity_at
            FROM crm_deals
            ORDER BY COALESCE(last_activity_at, '') DESC, deal_id DESC
            LIMIT 8
            """
        ).fetchall()
    ]
    print(json.dumps({"initialized": True, "counts": counts, "recent_deals": recent_deals, "warnings": []}))
finally:
    conn.close()
`;
}

function crmInitializeScript(): string {
  return String.raw`
import json
import os
import sqlite3
import sys

request = json.loads(sys.stdin.read() or "{}")
db_path = request["db_path"]
os.makedirs(os.path.dirname(db_path), exist_ok=True)
conn = sqlite3.connect(db_path)
try:
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS crm_companies (
        company_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        website TEXT,
        source TEXT,
        industry TEXT,
        company_size TEXT,
        country TEXT,
        relationship_status TEXT NOT NULL DEFAULT 'draft',
        owner TEXT NOT NULL DEFAULT 'eve',
        data_class TEXT NOT NULL DEFAULT 'S2',
        last_verified TEXT
    );
    CREATE TABLE IF NOT EXISTS crm_contacts (
        contact_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        company_id TEXT,
        role_title TEXT,
        source TEXT,
        source_uri TEXT,
        email_ref TEXT,
        phone_ref TEXT,
        linkedin_url TEXT,
        country TEXT,
        language TEXT,
        tags TEXT,
        owner TEXT NOT NULL DEFAULT 'eve',
        consent_status TEXT NOT NULL DEFAULT 'unknown',
        consent_basis TEXT,
        consent_source TEXT,
        data_class TEXT NOT NULL DEFAULT 'S2',
        retention_until TEXT,
        last_verified TEXT,
        notes_ref TEXT
    );
    CREATE TABLE IF NOT EXISTS crm_deals (
        deal_id TEXT PRIMARY KEY,
        pipeline_board_slug TEXT NOT NULL,
        kanban_task_id TEXT,
        company_id TEXT,
        contact_ids TEXT,
        stage TEXT NOT NULL DEFAULT 'draft',
        value_range TEXT,
        currency TEXT,
        probability INTEGER,
        next_action_at TEXT,
        owner TEXT NOT NULL DEFAULT 'eve',
        source TEXT,
        confidence REAL,
        human_gate TEXT NOT NULL DEFAULT 'HG-4',
        allowed_actions TEXT NOT NULL DEFAULT 'draft-only',
        last_activity_at TEXT,
        data_class TEXT NOT NULL DEFAULT 'S2',
        consent_status TEXT NOT NULL DEFAULT 'unknown',
        notes_ref TEXT
    );
    CREATE TABLE IF NOT EXISTS crm_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON crm_contacts(company_id);
    CREATE INDEX IF NOT EXISTS idx_crm_deals_company ON crm_deals(company_id);
    CREATE INDEX IF NOT EXISTS idx_crm_events_kind ON crm_events(kind, created_at);
    """)
    conn.execute(
        "INSERT OR IGNORE INTO crm_events (event_id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
        (
            request["audit_event_id"],
            "crm_overlay_initialized",
            json.dumps({
                "local_only": True,
                "plane_sync_enabled": False,
                "hosted_sync_enabled": False,
                "bulk_import_enabled": False,
                "enrichment_enabled": False,
                "outreach_enabled": False,
                "crm_data_class_default": "S2",
                "human_gate": "HG-4",
            }),
            request["created_at"],
        ),
    )
    conn.commit()
    print(json.dumps({"initialized": True}))
finally:
    conn.close()
`;
}

function crmDraftCreateScript(): string {
  return String.raw`
import json
import os
import sqlite3
import sys

request = json.loads(sys.stdin.read() or "{}")
db_path = request["db_path"]
if not os.path.isfile(db_path):
    print(json.dumps({"ok": False, "reason_code": "CRM_OVERLAY_NOT_INITIALIZED"}))
    sys.exit(0)

conn = sqlite3.connect(db_path)
try:
    conn.execute("PRAGMA busy_timeout=5000")
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    required = {"crm_companies", "crm_contacts", "crm_deals", "crm_events"}
    if not required.issubset(tables):
        print(json.dumps({"ok": False, "reason_code": "CRM_SCHEMA_INCOMPLETE"}))
        sys.exit(0)

    company_id = request["company_id"]
    contact_id = request["contact_id"]
    deal_id = request["deal_id"]
    created_at = request["created_at"]
    event_id = request["audit_event_id"]
    payload = {
        "company_id": company_id,
        "contact_id": contact_id,
        "deal_id": deal_id,
        "local_only": True,
        "plane_sync_enabled": False,
        "hosted_sync_enabled": False,
        "outreach_enabled": False,
        "consent_status": "unknown",
        "allowed_actions": "draft-only",
        "data_class": "S2",
        "human_gate": "HG-4",
    }
    conn.execute(
        """
        INSERT OR IGNORE INTO crm_companies
        (company_id, display_name, source, relationship_status, owner, data_class, last_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (company_id, "Draft Company", "command-eve-local-draft", "draft", "eve", "S2", created_at),
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO crm_contacts
        (contact_id, display_name, company_id, role_title, source, owner, consent_status, data_class, last_verified, notes_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (contact_id, "Draft Contact", company_id, "Decision Maker", "command-eve-local-draft", "eve", "unknown", "S2", created_at, "local-draft-only"),
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO crm_deals
        (deal_id, pipeline_board_slug, company_id, contact_ids, stage, owner, source, confidence, human_gate, allowed_actions, last_activity_at, data_class, consent_status, notes_ref)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (deal_id, "sales", company_id, json.dumps([contact_id]), "draft", "eve", "command-eve-local-draft", 0.1, "HG-4", "draft-only", created_at, "S2", "unknown", "local-draft-only"),
    )
    conn.execute(
        "INSERT OR IGNORE INTO crm_events (event_id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
        (event_id, "crm_draft_deal_created", json.dumps(payload), created_at),
    )
    conn.commit()
    print(json.dumps({"ok": True}))
finally:
    conn.close()
`;
}

function crmStageLocalScript(): string {
  return String.raw`
import json
import os
import sqlite3
import sys

request = json.loads(sys.stdin.read() or "{}")
db_path = request["db_path"]
if not os.path.isfile(db_path):
    print(json.dumps({"ok": False, "reason_code": "CRM_OVERLAY_NOT_INITIALIZED"}))
    sys.exit(0)

conn = sqlite3.connect(db_path)
try:
    conn.execute("PRAGMA busy_timeout=5000")
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    required = {"crm_companies", "crm_contacts", "crm_deals", "crm_events"}
    if not required.issubset(tables):
        print(json.dumps({"ok": False, "reason_code": "CRM_SCHEMA_INCOMPLETE"}))
        sys.exit(0)

    deal_id = request["deal_id"]
    target_stage = request["target_stage"]
    if target_stage != "qualified":
        print(json.dumps({"ok": False, "reason_code": "CRM_STAGE_TARGET_NOT_ALLOWED"}))
        sys.exit(0)

    row = conn.execute(
        "SELECT stage, allowed_actions, consent_status, human_gate, data_class FROM crm_deals WHERE deal_id = ?",
        (deal_id,),
    ).fetchone()
    if row is None:
        print(json.dumps({"ok": False, "reason_code": "CRM_DEAL_NOT_FOUND"}))
        sys.exit(0)

    previous_stage, allowed_actions, consent_status, human_gate, data_class = row
    if allowed_actions != "draft-only" or consent_status != "unknown" or human_gate != "HG-4" or data_class != "S2":
        print(json.dumps({"ok": False, "reason_code": "CRM_STAGE_POLICY_MISMATCH"}))
        sys.exit(0)
    if previous_stage not in ("draft", "qualified"):
        print(json.dumps({"ok": False, "reason_code": "CRM_STAGE_SOURCE_NOT_ALLOWED"}))
        sys.exit(0)

    created_at = request["created_at"]
    event_id = request["audit_event_id"]
    conn.execute(
        "UPDATE crm_deals SET stage = ?, last_activity_at = ? WHERE deal_id = ?",
        (target_stage, created_at, deal_id),
    )
    payload = {
        "deal_id": deal_id,
        "previous_stage": previous_stage,
        "stage": target_stage,
        "local_only": True,
        "plane_sync_enabled": False,
        "hosted_sync_enabled": False,
        "outreach_enabled": False,
        "subprocess_spawned": False,
        "consent_status": consent_status,
        "allowed_actions": allowed_actions,
        "data_class": data_class,
        "human_gate": human_gate,
    }
    conn.execute(
        "INSERT OR IGNORE INTO crm_events (event_id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
        (event_id, "crm_draft_deal_stage_changed", json.dumps(payload), created_at),
    )
    conn.commit()
    print(json.dumps({"ok": True, "previous_stage": previous_stage, "stage": target_stage}))
finally:
    conn.close()
`;
}

function countsFrom(value: unknown): CommandEveCrmOverlayCounts {
  const counts = isRecord(value) ? value : {};
  return {
    companies: typeof counts.companies === 'number' ? counts.companies : 0,
    contacts: typeof counts.contacts === 'number' ? counts.contacts : 0,
    deals: typeof counts.deals === 'number' ? counts.deals : 0,
    audit_events: typeof counts.audit_events === 'number' ? counts.audit_events : 0,
  };
}

function warningsFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function recentDealsFrom(value: unknown): CommandEveCrmOverlayDeal[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((deal) => ({
      deal_id: typeof deal.deal_id === 'string' ? deal.deal_id : '',
      company_id: typeof deal.company_id === 'string' ? deal.company_id : '',
      stage: typeof deal.stage === 'string' ? deal.stage : '',
      allowed_actions: typeof deal.allowed_actions === 'string' ? deal.allowed_actions : '',
      consent_status: typeof deal.consent_status === 'string' ? deal.consent_status : '',
      human_gate: typeof deal.human_gate === 'string' ? deal.human_gate : '',
      data_class: typeof deal.data_class === 'string' ? deal.data_class : '',
      last_activity_at: typeof deal.last_activity_at === 'string' ? deal.last_activity_at : '',
    }))
    .filter((deal) => deal.deal_id);
}

function baseModel({
  dbPath,
  eventLedgerPath,
  initialized,
  counts,
  recentDeals,
  warnings,
  now,
}: {
  dbPath: string;
  eventLedgerPath: string;
  initialized: boolean;
  counts: CommandEveCrmOverlayCounts;
  recentDeals: CommandEveCrmOverlayDeal[];
  warnings: string[];
  now: () => Date;
}): CommandEveCrmOverlayModel {
  return {
    schema_version: 'command-eve-crm-overlay/v0',
    generated_at: now().toISOString(),
    initialized,
    db_path: dbPath,
    event_ledger_path: eventLedgerPath,
    policy: policy(),
    counts,
    recent_deals: recentDeals,
    warnings,
  };
}

function sanitizeEventIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function crmAuditEventId(occurredAt: string): string {
  return ['command-eve-crm-overlay-initialized', sanitizeEventIdPart(occurredAt)].join('-');
}

function crmDraftAuditEventId(occurredAt: string): string {
  return ['command-eve-crm-draft-deal-created', sanitizeEventIdPart(occurredAt)].join('-');
}

function crmStageAuditEventId(dealId: string, occurredAt: string): string {
  return ['command-eve-crm-stage-local', sanitizeEventIdPart(dealId), sanitizeEventIdPart(occurredAt)].join('-');
}

function appendCrmAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  dbPath,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  dbPath: string;
}): void {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'crm.overlay_initialized',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: 'command-eve-crm-overlay',
    parent_issue_id: '',
    run_id: 'crm-overlay-initialize',
    session_id: '',
    agent: 'eve',
    mode: 'crm-overlay-initialize',
    role_owner: 'Controller',
    department: 'Sales',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      db_path: dbPath,
      local_only: true,
      plane_sync_enabled: false,
      hosted_sync_enabled: false,
      bulk_import_enabled: false,
      enrichment_enabled: false,
      outreach_enabled: false,
      crm_data_class_default: 'S2',
      human_gate: 'HG-4',
      action: 'crm_overlay_initialize',
    },
    artifact_paths: [dbPath],
    linear_comment_ids: [] as string[],
    human_gate_required: false,
    redaction_level: 'none',
  };
  fs.mkdirSync(path.dirname(eventLedgerPath), { recursive: true });
  fs.appendFileSync(eventLedgerPath, `${JSON.stringify(event)}\n`);
}

function appendCrmDraftAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  dbPath,
  companyId,
  contactId,
  dealId,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  dbPath: string;
  companyId: string;
  contactId: string;
  dealId: string;
}): void {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'crm.draft_deal_created',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: dealId,
    parent_issue_id: companyId,
    run_id: 'crm-draft-create',
    session_id: '',
    agent: 'eve',
    mode: 'crm-draft-create',
    role_owner: 'Controller',
    department: 'Sales',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      company_id: companyId,
      contact_id: contactId,
      deal_id: dealId,
      db_path: dbPath,
      local_only: true,
      plane_sync_enabled: false,
      hosted_sync_enabled: false,
      outreach_enabled: false,
      consent_status: 'unknown',
      allowed_actions: 'draft-only',
      data_class: 'S2',
      human_gate: 'HG-4',
      action: 'crm_draft_deal_create',
    },
    artifact_paths: [dbPath],
    linear_comment_ids: [] as string[],
    human_gate_required: true,
    redaction_level: 'ids-only',
  };
  fs.mkdirSync(path.dirname(eventLedgerPath), { recursive: true });
  fs.appendFileSync(eventLedgerPath, `${JSON.stringify(event)}\n`);
}

function appendCrmStageAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  dbPath,
  dealId,
  previousStage,
  stage,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  dbPath: string;
  dealId: string;
  previousStage: string;
  stage: string;
}): void {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'crm.draft_deal_stage_changed',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: dealId,
    parent_issue_id: '',
    run_id: 'crm-stage-local',
    session_id: '',
    agent: 'eve',
    mode: 'crm-stage-local',
    role_owner: 'Controller',
    department: 'Sales',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      deal_id: dealId,
      previous_stage: previousStage,
      stage,
      db_path: dbPath,
      local_only: true,
      plane_sync_enabled: false,
      hosted_sync_enabled: false,
      outreach_enabled: false,
      subprocess_spawned: false,
      consent_status: 'unknown',
      allowed_actions: 'draft-only',
      data_class: 'S2',
      human_gate: 'HG-4',
      action: 'crm_draft_deal_stage_local',
    },
    artifact_paths: [dbPath],
    linear_comment_ids: [] as string[],
    human_gate_required: true,
    redaction_level: 'ids-only',
  };
  fs.mkdirSync(path.dirname(eventLedgerPath), { recursive: true });
  fs.appendFileSync(eventLedgerPath, `${JSON.stringify(event)}\n`);
}

function resultBase(hermesHome: string): Pick<CommandEveCrmOverlayResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_CRM_OVERLAY_BRIDGE_VERSION,
    source: {
      generated_by: 'command-eve-crm-overlay-core',
      hermes_home: hermesHome,
    },
  };
}

function initializeResultBase(hermesHome: string): Pick<CommandEveCrmOverlayInitializeResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_CRM_OVERLAY_INITIALIZE_BRIDGE_VERSION,
    source: {
      generated_by: 'command-eve-crm-overlay-core',
      hermes_home: hermesHome,
    },
  };
}

function draftCreateResultBase(hermesHome: string): Pick<CommandEveCrmDraftCreateResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_CRM_DRAFT_CREATE_BRIDGE_VERSION,
    source: {
      generated_by: 'command-eve-crm-overlay-core',
      hermes_home: hermesHome,
    },
  };
}

function stageLocalResultBase(hermesHome: string): Pick<CommandEveCrmStageLocalResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_CRM_STAGE_LOCAL_BRIDGE_VERSION,
    source: {
      generated_by: 'command-eve-crm-overlay-core',
      hermes_home: hermesHome,
    },
  };
}

export function buildCrmOverlay(options: CommandEveCrmOverlayOptions): CommandEveCrmOverlayResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const dbPath = crmDbPath(paths.hermesHome);
  const eventLedgerPath = resolveEventLedgerPath(paths, options);
  const now = options.now ?? (() => new Date());
  const base = resultBase(paths.hermesHome);
  const python = pythonBinary(paths, options.pythonPath);

  const read = readPythonJson(python, { db_path: dbPath }, crmReadScript(), paths.hermesHome);
  if (!read.ok) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'CRM_OVERLAY_READ_FAILED',
      message: read.error || 'Command EVE CRM overlay could not be read.',
    };
  }

  const initialized = read.data?.initialized === true;
  const model = baseModel({
    dbPath,
    eventLedgerPath,
    initialized,
    counts: countsFrom(read.data?.counts),
    recentDeals: recentDealsFrom(read.data?.recent_deals),
    warnings: warningsFrom(read.data?.warnings),
    now,
  });

  if (!initialized) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'CRM_OVERLAY_NOT_INITIALIZED',
      message: 'Command EVE CRM overlay is local-only but not initialized yet.',
      model,
    };
  }

  return {
    ...base,
    ok: true,
    status: 'ready',
    reason_code: 'CRM_OVERLAY_READY_LOCAL_ONLY',
    model,
  };
}

export function initializeCrmOverlay(options: CommandEveCrmOverlayOptions): CommandEveCrmOverlayInitializeResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const dbPath = crmDbPath(paths.hermesHome);
  const eventLedgerPath = resolveEventLedgerPath(paths, options);
  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const auditEventId = crmAuditEventId(occurredAt);
  const base = initializeResultBase(paths.hermesHome);
  const python = pythonBinary(paths, options.pythonPath);

  const write = readPythonJson(
    python,
    {
      db_path: dbPath,
      audit_event_id: auditEventId,
      created_at: occurredAt,
    },
    crmInitializeScript(),
    paths.hermesHome
  );
  if (!write.ok) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'CRM_OVERLAY_INITIALIZE_FAILED',
      message: write.error || 'Command EVE CRM overlay could not be initialized.',
    };
  }

  appendCrmAuditEvent({ eventId: auditEventId, eventLedgerPath, occurredAt, dbPath });
  const overlay = buildCrmOverlay({ ...options, now });
  return {
    ...base,
    ok: overlay.ok,
    status: overlay.status,
    reason_code: overlay.ok ? 'CRM_OVERLAY_INITIALIZED_LOCAL_ONLY' : overlay.reason_code,
    message: overlay.message,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    model: overlay.model,
  };
}

export function createCrmDraftDeal(options: CommandEveCrmOverlayOptions): CommandEveCrmDraftCreateResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const dbPath = crmDbPath(paths.hermesHome);
  const eventLedgerPath = resolveEventLedgerPath(paths, options);
  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const idPart = sanitizeEventIdPart(occurredAt) || String(Date.now());
  const companyId = `crm-company-${idPart}`;
  const contactId = `crm-contact-${idPart}`;
  const dealId = `crm-deal-${idPart}`;
  const auditEventId = crmDraftAuditEventId(occurredAt);
  const base = draftCreateResultBase(paths.hermesHome);
  const python = pythonBinary(paths, options.pythonPath);

  const write = readPythonJson(
    python,
    {
      db_path: dbPath,
      audit_event_id: auditEventId,
      created_at: occurredAt,
      company_id: companyId,
      contact_id: contactId,
      deal_id: dealId,
    },
    crmDraftCreateScript(),
    paths.hermesHome
  );
  if (!write.ok || write.data?.ok !== true) {
    const reasonCode =
      typeof write.data?.reason_code === 'string' ? write.data.reason_code : 'CRM_DRAFT_DEAL_CREATE_FAILED';
    return {
      ...base,
      ok: false,
      status: write.ok ? 'blocked' : 'failed',
      reason_code: reasonCode,
      message: write.error || 'Command EVE CRM draft deal could not be created.',
    };
  }

  appendCrmDraftAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    dbPath,
    companyId,
    contactId,
    dealId,
  });
  const overlay = buildCrmOverlay({ ...options, now });
  return {
    ...base,
    ok: overlay.ok,
    status: overlay.status,
    reason_code: overlay.ok ? 'CRM_DRAFT_DEAL_CREATED_LOCAL_ONLY' : overlay.reason_code,
    message: overlay.message,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    company_id: companyId,
    contact_id: contactId,
    deal_id: dealId,
    model: overlay.model,
  };
}

export function changeCrmDealStageLocal(
  options: CommandEveCrmOverlayOptions,
  request: CommandEveCrmStageLocalRequest
): CommandEveCrmStageLocalResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const dbPath = crmDbPath(paths.hermesHome);
  const eventLedgerPath = resolveEventLedgerPath(paths, options);
  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const dealId = request.dealId.trim();
  const auditEventId = crmStageAuditEventId(dealId, occurredAt);
  const base = stageLocalResultBase(paths.hermesHome);
  const python = pythonBinary(paths, options.pythonPath);

  if (!dealId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'CRM_STAGE_DEAL_ID_REQUIRED',
      message: 'Command EVE CRM local stage change requires a deal id.',
    };
  }

  const write = readPythonJson(
    python,
    {
      db_path: dbPath,
      audit_event_id: auditEventId,
      created_at: occurredAt,
      deal_id: dealId,
      target_stage: request.targetStage,
    },
    crmStageLocalScript(),
    paths.hermesHome
  );
  if (!write.ok || write.data?.ok !== true) {
    const reasonCode =
      typeof write.data?.reason_code === 'string' ? write.data.reason_code : 'CRM_STAGE_LOCAL_FAILED';
    return {
      ...base,
      ok: false,
      status: write.ok ? 'blocked' : 'failed',
      reason_code: reasonCode,
      message: write.error || 'Command EVE CRM local stage change could not be applied.',
      deal_id: dealId,
    };
  }

  const previousStage = typeof write.data.previous_stage === 'string' ? write.data.previous_stage : '';
  const stage = typeof write.data.stage === 'string' ? write.data.stage : request.targetStage;
  appendCrmStageAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    dbPath,
    dealId,
    previousStage,
    stage,
  });
  const overlay = buildCrmOverlay({ ...options, now });
  return {
    ...base,
    ok: overlay.ok,
    status: overlay.status,
    reason_code: overlay.ok ? 'CRM_STAGE_CHANGED_LOCAL_ONLY' : overlay.reason_code,
    message: overlay.message,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    deal_id: dealId,
    previous_stage: previousStage,
    stage,
    model: overlay.model,
  };
}
