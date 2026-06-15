/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { resolveCommandEveRuntimeBootstrapPaths } from './runtimeBootstrapCore';

export const COMMAND_EVE_KANBAN_PREFLIGHT_BRIDGE_VERSION = 'command-eve-kanban-preflight/v0';
export const COMMAND_EVE_KANBAN_MARKETING_BOARD_BRIDGE_VERSION = 'command-eve-kanban-marketing-board/v0';
export const COMMAND_EVE_KANBAN_MARKETING_PROOF_CARD_BRIDGE_VERSION = 'command-eve-kanban-marketing-proof-card/v0';
export const COMMAND_EVE_KANBAN_MARKETING_CARD_CREATE_BRIDGE_VERSION = 'command-eve-kanban-marketing-card-create/v0';
export const COMMAND_EVE_KANBAN_MARKETING_CARD_MOVE_BRIDGE_VERSION = 'command-eve-kanban-marketing-card-move/v0';
export const COMMAND_EVE_KANBAN_MARKETING_DISPATCH_PLAN_BRIDGE_VERSION =
  'command-eve-kanban-marketing-dispatch-plan/v0';

const MIN_HERMES_KANBAN_VERSION = '0.16.0';
const RUNTIME_RECONCILIATION_VERSION = 'command-eve-runtime-reconciliation/v0';
const MARKETING_BOARD_TENANT = 'command-eve-marketing';
const MARKETING_BOARD_WORKFLOW = 'command-eve-marketing';
const MARKETING_PROOF_IDEMPOTENCY_KEY = 'command-eve-marketing-board-proof-v0';
const MARKETING_PROOF_CARD_ID = 't_command_eve_marketing_proof';
const MARKETING_BOARD_LANES = ['research', 'draft', 'assetGeneration', 'review', 'readyToApprove'] as const;
// Native Hermes task status per Command EVE marketing lane. The board projection in
// `laneForTask` keys off `current_step_key` first (always set to the lane key for a
// deterministic projection) and falls back to `status`; the status below keeps the
// native row coherent with the lane even if the step key is ever cleared upstream.
const MARKETING_LANE_NATIVE_STATUS: Record<CommandEveKanbanMarketingLaneKey, string> = {
  research: 'triage',
  draft: 'todo',
  assetGeneration: 'ready',
  review: 'review',
  readyToApprove: 'review',
};
const KANBAN_MODULES = [
  { name: 'hermes_cli.kanban_db', required: true },
  { name: 'hermes_cli.kanban', required: true },
  { name: 'tools.kanban_tools', required: true },
  { name: 'plugins.kanban.dashboard.plugin_api', required: false },
];

export type CommandEveKanbanPreflightStatus = 'ready' | 'blocked' | 'failed';
export type CommandEveKanbanMarketingBoardStatus = 'ready' | 'blocked' | 'failed';
export type CommandEveKanbanMarketingLaneKey = (typeof MARKETING_BOARD_LANES)[number];

export type CommandEveKanbanModuleCheck = {
  name: string;
  required: boolean;
  ok: boolean;
  error?: string;
};

export type CommandEveKanbanBoardStatus = {
  slug: string;
  db_path: string;
  db_exists: boolean;
  table_count: number;
  task_count?: number;
  read_only_opened: boolean;
};

export type CommandEveKanbanGovernanceStatus = {
  runtime_reconciliation_path: string;
  dispatcher_disabled: boolean;
  auto_decompose_disabled: boolean;
  mcp_servers_disabled: boolean;
};

export type CommandEveKanbanPreflightModel = {
  schema_version: 'command-eve-kanban-preflight/v0';
  generated_at: string;
  read_only: true;
  hermes: {
    min_required_version: string;
    installed_version: string;
    version_ok: boolean;
  };
  modules: CommandEveKanbanModuleCheck[];
  board: CommandEveKanbanBoardStatus;
  governance: CommandEveKanbanGovernanceStatus;
  warnings: string[];
};

export type CommandEveKanbanPreflightResult = {
  version: typeof COMMAND_EVE_KANBAN_PREFLIGHT_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanPreflightStatus;
  reason_code?: string;
  message?: string;
  model?: CommandEveKanbanPreflightModel;
  source: {
    generated_by: 'command-eve-kanban-preflight-core';
    hermes_home?: string;
    python_path?: string;
  };
};

export type CommandEveKanbanPreflightCommandRequest = {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  input: string;
};

export type CommandEveKanbanPreflightCommandResult = {
  ok: boolean;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
};

export type CommandEveKanbanPreflightCommandRunner = (
  request: CommandEveKanbanPreflightCommandRequest
) => CommandEveKanbanPreflightCommandResult;

export type CommandEveKanbanPreflightOptions = {
  userDataPath: string;
  boardSlug?: string;
  now?: () => Date;
  commandRunner?: CommandEveKanbanPreflightCommandRunner;
};

export type CommandEveKanbanMarketingCard = {
  card_id: string;
  card_title: string;
  card_status: string;
  card_priority: number;
  card_assignee: string;
  lane_key: CommandEveKanbanMarketingLaneKey;
  created_at: number;
  updated_at: number | null;
  linked_run_id: string | null;
  linked_audit_event_id: string | null;
  governance_state: 'read_only' | 'proof_write_recorded' | 'unknown';
};

export type CommandEveKanbanMarketingColumn = {
  key: CommandEveKanbanMarketingLaneKey;
  cards: CommandEveKanbanMarketingCard[];
};

export type CommandEveKanbanMarketingBoardModel = {
  schema_version: 'command-eve-kanban-marketing-board/v0';
  generated_at: string;
  board: {
    slug: string;
    db_path: string;
    db_exists: boolean;
    table_count: number;
  };
  policy: {
    dispatcher_enabled: false;
    auto_decompose_enabled: false;
    card_mutation_requires_humangate: 'HG-2.5';
    delete_allowed: false;
    assign_dispatch_allowed: false;
  };
  summary: {
    total_cards: number;
    audit_linked_cards: number;
  };
  columns: CommandEveKanbanMarketingColumn[];
  warnings: string[];
};

export type CommandEveKanbanMarketingBoardResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_BOARD_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  message?: string;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingProofCardResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_PROOF_CARD_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingBoardOptions = {
  userDataPath: string;
  boardSlug?: string;
  eventLedgerPath?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  pythonPath?: string;
};

export type CommandEveKanbanMarketingCardCreateResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_CARD_CREATE_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  message?: string;
  card_id?: string;
  lane_key?: CommandEveKanbanMarketingLaneKey;
  audit_event_id?: string;
  audit_event_path?: string;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingCardMoveResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_CARD_MOVE_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  message?: string;
  card_id?: string;
  from_lane_key?: CommandEveKanbanMarketingLaneKey;
  to_lane_key?: CommandEveKanbanMarketingLaneKey;
  moved?: boolean;
  audit_event_id?: string;
  audit_event_path?: string;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingDispatchPlanResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_DISPATCH_PLAN_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  reason_codes: string[];
  message?: string;
  card_id?: string;
  command?: 'decompose' | 'specify';
  subprocess_spawned: boolean;
  data_boundary_checked: boolean;
  controller_approval_required?: boolean;
  release_blocked?: boolean;
  human_gate?: 'HG-2.5';
  audit_event_id?: string;
  audit_event_path?: string;
  dispatch_plan?: JsonRecord;
  policy?: JsonRecord;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
    company_os_root?: string;
  };
};

export type CommandEveKanbanMarketingCardCreateOptions = CommandEveKanbanMarketingBoardOptions & {
  title: string;
  description?: string;
  lane_key: string;
  client_token: string;
};

export type CommandEveKanbanMarketingCardMoveOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  to_lane_key: string;
};

export type CommandEveKanbanMarketingDispatchPlanOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  command?: 'decompose' | 'specify';
  companyOsRoot?: string;
  commandRunner?: CommandEveKanbanPreflightCommandRunner;
};

type JsonRecord = Record<string, unknown>;

type RuntimeReconciliationShape = {
  version?: unknown;
  hermes_config?: {
    mcp_servers?: unknown;
    kanban_dispatch_in_gateway?: unknown;
    kanban_auto_decompose?: unknown;
  };
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resultBase(
  source: CommandEveKanbanPreflightResult['source']
): Pick<CommandEveKanbanPreflightResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_KANBAN_PREFLIGHT_BRIDGE_VERSION,
    source,
  };
}

function pythonBinary(hermesVenv: string): string {
  return process.platform === 'win32'
    ? path.join(hermesVenv, 'Scripts', 'python.exe')
    : path.join(hermesVenv, 'bin', 'python');
}

function nodeRuntimeForDispatch(): { executable: string; env: NodeJS.ProcessEnv } {
  const override = process.env.COMMAND_EVE_NODE_BINARY || process.env.NODE_BINARY;
  if (override) {
    return { executable: override, env: {} };
  }

  if (process.versions?.electron) {
    return {
      executable: process.execPath,
      env: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  return { executable: process.execPath, env: {} };
}

function compareSemver(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function defaultCommandRunner(
  request: CommandEveKanbanPreflightCommandRequest
): CommandEveKanbanPreflightCommandResult {
  const result = spawnSync(request.executable, request.args, {
    cwd: request.cwd,
    env: request.env,
    input: request.input,
    encoding: 'utf8',
    shell: false,
    timeout: request.timeoutMs,
    windowsHide: true,
    maxBuffer: 256 * 1024,
  });
  if (result.error) {
    return {
      ok: false,
      exitCode: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error.message,
    };
  }
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function emptyMarketingColumns(): CommandEveKanbanMarketingColumn[] {
  return MARKETING_BOARD_LANES.map((key) => ({ key, cards: [] as CommandEveKanbanMarketingCard[] }));
}

function marketingPolicy(): CommandEveKanbanMarketingBoardModel['policy'] {
  return {
    dispatcher_enabled: false,
    auto_decompose_enabled: false,
    card_mutation_requires_humangate: 'HG-2.5',
    delete_allowed: false,
    assign_dispatch_allowed: false,
  };
}

function marketingBoardBaseModel({
  boardSlug,
  dbPath,
  dbExists,
  tableCount,
  now,
  warnings = [],
}: {
  boardSlug: string;
  dbPath: string;
  dbExists: boolean;
  tableCount: number;
  now: () => Date;
  warnings?: string[];
}): CommandEveKanbanMarketingBoardModel {
  return {
    schema_version: 'command-eve-kanban-marketing-board/v0',
    generated_at: now().toISOString(),
    board: {
      slug: boardSlug,
      db_path: dbPath,
      db_exists: dbExists,
      table_count: tableCount,
    },
    policy: marketingPolicy(),
    summary: {
      total_cards: 0,
      audit_linked_cards: 0,
    },
    columns: emptyMarketingColumns(),
    warnings,
  };
}

function normalizeBoardSlug(value: string | undefined): string {
  const slug = String(value || 'marketing')
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) {
    throw new Error(`Invalid Hermes Kanban board slug: ${value || ''}`);
  }
  return slug;
}

function kanbanDbPath(hermesHome: string, boardSlug: string): string {
  return boardSlug === 'default'
    ? path.join(hermesHome, 'kanban.db')
    : path.join(hermesHome, 'kanban', 'boards', boardSlug, 'kanban.db');
}

function pythonForMarketingBoard(
  paths: ReturnType<typeof resolveCommandEveRuntimeBootstrapPaths>,
  fallback?: string
): string {
  const hermesPython = pythonBinary(paths.hermesVenv);
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

function runPythonJson(
  pythonPath: string,
  input: Record<string, unknown>,
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
  if (result.error) {
    return { ok: false, error: result.error.message };
  }
  if (result.status !== 0) {
    return { ok: false, error: result.stderr || result.stdout || `python exited with ${result.status}` };
  }
  try {
    const parsed = JSON.parse(result.stdout || '{}') as unknown;
    if (!isRecord(parsed)) return { ok: false, error: 'python returned non-object JSON' };
    return { ok: true, data: parsed };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'python JSON parse failed',
    };
  }
}

function laneForTask(status: string, stepKey: string | null): CommandEveKanbanMarketingLaneKey {
  if (stepKey && (MARKETING_BOARD_LANES as readonly string[]).includes(stepKey)) {
    return stepKey as CommandEveKanbanMarketingLaneKey;
  }
  if (status === 'triage') return 'research';
  if (status === 'todo') return 'draft';
  if (status === 'ready' || status === 'running' || status === 'scheduled') return 'assetGeneration';
  if (status === 'review' || status === 'blocked') return 'review';
  return 'readyToApprove';
}

function textField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nullableTextField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function parseMarketingCards(rows: unknown[]): CommandEveKanbanMarketingCard[] {
  return rows.map((row) => {
    const item = isRecord(row) ? row : {};
    const status = textField(item.status);
    const currentStepKey = nullableTextField(item.current_step_key);
    const linkedAuditEventId = nullableTextField(item.linked_audit_event_id);
    return {
      card_id: textField(item.id),
      card_title: textField(item.title),
      card_status: status,
      card_priority: numberField(item.priority),
      card_assignee: textField(item.assignee),
      lane_key: laneForTask(status, currentStepKey),
      created_at: numberField(item.created_at),
      updated_at: typeof item.updated_at === 'number' ? item.updated_at : null,
      linked_run_id: nullableTextField(item.linked_run_id),
      linked_audit_event_id: linkedAuditEventId,
      governance_state: linkedAuditEventId ? 'proof_write_recorded' : 'read_only',
    };
  });
}

function buildMarketingModelFromRows({
  boardSlug,
  dbPath,
  tableCount,
  rows,
  now,
  warnings = [],
}: {
  boardSlug: string;
  dbPath: string;
  tableCount: number;
  rows: unknown[];
  now: () => Date;
  warnings?: string[];
}): CommandEveKanbanMarketingBoardModel {
  const cards = parseMarketingCards(rows);
  const columns = emptyMarketingColumns();
  for (const card of cards) {
    columns.find((column) => column.key === card.lane_key)?.cards.push(card);
  }
  return {
    ...marketingBoardBaseModel({
      boardSlug,
      dbPath,
      dbExists: true,
      tableCount,
      now,
      warnings,
    }),
    summary: {
      total_cards: cards.length,
      audit_linked_cards: cards.filter((card) => card.linked_audit_event_id).length,
    },
    columns,
  };
}

function buildMarketingBoardReadScript(): string {
  return String.raw`
import json
import os
import sqlite3
import sys

request = json.loads(sys.stdin.read() or "{}")
db_path = request["db_path"]
tenant = request["tenant"]
workflow = request["workflow"]
if not os.path.isfile(db_path):
    print(json.dumps({"db_exists": False, "table_count": 0, "rows": []}))
    sys.exit(0)

conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
try:
    tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    if "tasks" not in tables:
        print(json.dumps({"db_exists": True, "table_count": len(tables), "rows": [], "warnings": ["tasks_table_missing"]}))
        sys.exit(0)
    rows = []
    for row in conn.execute(
        """
        SELECT
          t.id,
          t.title,
          t.body,
          COALESCE(t.assignee, '') AS assignee,
          t.status,
          COALESCE(t.priority, 0) AS priority,
          COALESCE(t.created_by, '') AS created_by,
          t.created_at,
          COALESCE(t.started_at, t.completed_at, t.created_at) AS updated_at,
          COALESCE(t.tenant, '') AS tenant,
          COALESCE(t.workflow_template_id, '') AS workflow_template_id,
          COALESCE(t.current_step_key, '') AS current_step_key,
          COALESCE(t.idempotency_key, '') AS idempotency_key,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.audit_event_id')
              FROM task_events e
              WHERE e.task_id = t.id AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS linked_audit_event_id,
          COALESCE(CAST(t.current_run_id AS TEXT), '') AS linked_run_id
        FROM tasks t
        WHERE COALESCE(t.tenant, '') = ?
           OR COALESCE(t.workflow_template_id, '') = ?
           OR COALESCE(t.idempotency_key, '') = ?
        ORDER BY COALESCE(t.priority, 0) DESC, t.created_at ASC, t.id ASC
        """,
        (tenant, workflow, request["proof_idempotency_key"]),
    ):
        rows.append(dict(row))
    print(json.dumps({"db_exists": True, "table_count": len(tables), "rows": rows}))
finally:
    conn.close()
`;
}

function buildMarketingBoardWriteScript(): string {
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
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT,
        assignee TEXT,
        status TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        workspace_kind TEXT NOT NULL DEFAULT 'scratch',
        workspace_path TEXT,
        branch_name TEXT,
        claim_lock TEXT,
        claim_expires INTEGER,
        tenant TEXT,
        result TEXT,
        idempotency_key TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        worker_pid INTEGER,
        last_failure_error TEXT,
        max_runtime_seconds INTEGER,
        last_heartbeat_at INTEGER,
        current_run_id INTEGER,
        workflow_template_id TEXT,
        current_step_key TEXT,
        skills TEXT,
        model_override TEXT,
        max_retries INTEGER,
        goal_mode INTEGER NOT NULL DEFAULT 0,
        goal_max_turns INTEGER,
        session_id TEXT
    );
    CREATE TABLE IF NOT EXISTS task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        run_id INTEGER,
        kind TEXT NOT NULL,
        payload TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_links (
        parent_id TEXT NOT NULL,
        child_id TEXT NOT NULL,
        PRIMARY KEY (parent_id, child_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_events_task ON task_events(task_id, created_at);
    """)
    existing = conn.execute(
        "SELECT id FROM tasks WHERE idempotency_key = ? AND status != 'archived' LIMIT 1",
        (request["idempotency_key"],),
    ).fetchone()
    if existing:
        conn.commit()
        print(json.dumps({"created": False, "card_id": existing[0]}))
        sys.exit(0)
    conn.execute(
        """
        INSERT INTO tasks (
          id, title, body, assignee, status, priority, created_by, created_at,
          workspace_kind, tenant, idempotency_key, workflow_template_id,
          current_step_key, skills, max_retries, goal_mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scratch', ?, ?, ?, ?, ?, ?, 0)
        """,
        (
          request["card_id"],
          request["title"],
          request["body"],
          request["assignee"],
          "triage",
          int(request["priority"]),
          "command-eve",
          int(request["created_at"]),
          request["tenant"],
          request["idempotency_key"],
          request["workflow"],
          "research",
          json.dumps(["company-os-marketing"]),
          1,
        ),
    )
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_proof_card_created",
          json.dumps({
            "audit_event_id": request["audit_event_id"],
            "human_gate": "HG-2.5",
            "dispatcher_enabled": False,
            "auto_decompose_enabled": False,
          }),
          int(request["created_at"]),
        ),
    )
    conn.commit()
    print(json.dumps({"created": True, "card_id": request["card_id"]}))
finally:
    conn.close()
`;
}

function buildMarketingCardCreateScript(): string {
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
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT,
        assignee TEXT,
        status TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        workspace_kind TEXT NOT NULL DEFAULT 'scratch',
        workspace_path TEXT,
        branch_name TEXT,
        claim_lock TEXT,
        claim_expires INTEGER,
        tenant TEXT,
        result TEXT,
        idempotency_key TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        worker_pid INTEGER,
        last_failure_error TEXT,
        max_runtime_seconds INTEGER,
        last_heartbeat_at INTEGER,
        current_run_id INTEGER,
        workflow_template_id TEXT,
        current_step_key TEXT,
        skills TEXT,
        model_override TEXT,
        max_retries INTEGER,
        goal_mode INTEGER NOT NULL DEFAULT 0,
        goal_max_turns INTEGER,
        session_id TEXT
    );
    CREATE TABLE IF NOT EXISTS task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        run_id INTEGER,
        kind TEXT NOT NULL,
        payload TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_links (
        parent_id TEXT NOT NULL,
        child_id TEXT NOT NULL,
        PRIMARY KEY (parent_id, child_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_events_task ON task_events(task_id, created_at);
    """)
    existing = conn.execute(
        "SELECT id FROM tasks WHERE idempotency_key = ? AND status != 'archived' LIMIT 1",
        (request["idempotency_key"],),
    ).fetchone()
    if existing:
        conn.commit()
        print(json.dumps({"created": False, "card_id": existing[0]}))
        sys.exit(0)
    conn.execute(
        """
        INSERT INTO tasks (
          id, title, body, assignee, status, priority, created_by, created_at,
          workspace_kind, tenant, idempotency_key, workflow_template_id,
          current_step_key, skills, max_retries, goal_mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scratch', ?, ?, ?, ?, ?, ?, 0)
        """,
        (
          request["card_id"],
          request["title"],
          request["body"],
          request["assignee"],
          request["status"],
          int(request["priority"]),
          "command-eve",
          int(request["created_at"]),
          request["tenant"],
          request["idempotency_key"],
          request["workflow"],
          request["lane_key"],
          json.dumps(["company-os-marketing"]),
          1,
        ),
    )
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_card_created",
          json.dumps({
            "audit_event_id": request["audit_event_id"],
            "lane_key": request["lane_key"],
            "client_token": request["idempotency_key"],
            "human_gate": "HG-2.5",
            "dispatcher_enabled": False,
            "auto_decompose_enabled": False,
          }),
          int(request["created_at"]),
        ),
    )
    conn.commit()
    print(json.dumps({"created": True, "card_id": request["card_id"]}))
finally:
    conn.close()
`;
}

function buildMarketingCardMoveScript(): string {
  return String.raw`
import json
import os
import sqlite3
import sys

request = json.loads(sys.stdin.read() or "{}")
db_path = request["db_path"]
if not os.path.isfile(db_path):
    print(json.dumps({"found": False}))
    sys.exit(0)
conn = sqlite3.connect(db_path)
try:
    conn.execute("PRAGMA journal_mode=WAL")
    row = conn.execute(
        "SELECT status, COALESCE(current_step_key, '') FROM tasks WHERE id = ? LIMIT 1",
        (request["card_id"],),
    ).fetchone()
    if row is None:
        conn.commit()
        print(json.dumps({"found": False}))
        sys.exit(0)
    from_step = row[1] or ""
    if from_step == request["to_lane_key"] and row[0] == request["to_status"]:
        conn.commit()
        print(json.dumps({"found": True, "moved": False, "from_step": from_step}))
        sys.exit(0)
    conn.execute(
        "UPDATE tasks SET status = ?, current_step_key = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
        (request["to_status"], request["to_lane_key"], int(request["moved_at"]), request["card_id"]),
    )
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_card_moved",
          json.dumps({
            "audit_event_id": request["audit_event_id"],
            "from_step": from_step,
            "to_lane_key": request["to_lane_key"],
            "human_gate": "HG-2.5",
            "dispatcher_enabled": False,
            "auto_decompose_enabled": False,
          }),
          int(request["moved_at"]),
        ),
    )
    conn.commit()
    print(json.dumps({"found": True, "moved": True, "from_step": from_step}))
finally:
    conn.close()
`;
}

function buildMarketingCardDispatchPlanScript(): string {
  return String.raw`
import json
import os
import sqlite3
import sys

request = json.loads(sys.stdin.read() or "{}")
db_path = request["db_path"]
if not os.path.isfile(db_path):
    print(json.dumps({"found": False}))
    sys.exit(0)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
try:
    row = conn.execute(
        """
        SELECT
          id,
          title,
          COALESCE(body, '') AS body,
          COALESCE(status, '') AS status,
          COALESCE(current_step_key, '') AS current_step_key,
          COALESCE(tenant, '') AS tenant,
          COALESCE(workflow_template_id, '') AS workflow_template_id
        FROM tasks
        WHERE id = ?
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if row is None:
        conn.commit()
        print(json.dumps({"found": False}))
        sys.exit(0)

    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_dispatch_plan_checked",
          json.dumps({
            "audit_event_id": request["audit_event_id"],
            "human_gate": "HG-2.5",
            "dispatcher_enabled": False,
            "auto_decompose_enabled": False,
            "nl5_gate_checked": bool(request.get("data_boundary_checked")),
            "subprocess_spawned": bool(request.get("subprocess_spawned")),
            "controller_approval_required": bool(request.get("controller_approval_required")),
            "release_blocked": bool(request.get("release_blocked")),
            "dispatch_status": request.get("dispatch_status"),
            "reason_codes": request.get("reason_codes") or [],
            "policy": request.get("policy") or {},
          }),
          int(request["checked_at"]),
        ),
    )
    conn.commit()
    print(json.dumps({"found": True, "task": dict(row)}))
finally:
    conn.close()
`;
}

function buildMarketingCardLookupScript(): string {
  return String.raw`
import json
import os
import sqlite3
import sys

request = json.loads(sys.stdin.read() or "{}")
db_path = request["db_path"]
if not os.path.isfile(db_path):
    print(json.dumps({"found": False}))
    sys.exit(0)

conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
try:
    row = conn.execute(
        """
        SELECT
          id,
          title,
          COALESCE(body, '') AS body,
          COALESCE(status, '') AS status,
          COALESCE(current_step_key, '') AS current_step_key,
          COALESCE(tenant, '') AS tenant,
          COALESCE(workflow_template_id, '') AS workflow_template_id
        FROM tasks
        WHERE id = ?
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if row is None:
        print(json.dumps({"found": False}))
        sys.exit(0)
    print(json.dumps({"found": True, "task": dict(row)}))
finally:
    conn.close()
`;
}

function sanitizeEventIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return undefined;
}

function resolveMarketingEventLedgerPath(
  paths: ReturnType<typeof resolveCommandEveRuntimeBootstrapPaths>,
  options: Pick<CommandEveKanbanMarketingBoardOptions, 'eventLedgerPath' | 'env'>
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

function appendMarketingAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
}): string {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_proof_card_created',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-proof-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-proof',
    role_owner: 'Controller',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-2.5',
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      action: 'proof_card_create',
    },
    artifact_paths: [dbPath],
    linear_comment_ids: [] as string[],
    human_gate_required: false,
    redaction_level: 'none',
  };
  fs.mkdirSync(path.dirname(eventLedgerPath), { recursive: true });
  fs.appendFileSync(eventLedgerPath, `${JSON.stringify(event)}\n`);
  return eventId;
}

function marketingAuditEventId(cardId: string, occurredAt: string): string {
  return ['command-eve-kanban-marketing-proof', sanitizeEventIdPart(cardId), sanitizeEventIdPart(occurredAt)].join('-');
}

function appendMarketingMutationAuditEvent({
  eventId,
  eventType,
  mode,
  action,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  extraPayload = {},
}: {
  eventId: string;
  eventType: 'kanban.marketing_board_card_created' | 'kanban.marketing_board_card_moved';
  mode: 'kanban-card-create' | 'kanban-card-move';
  action: 'card_create' | 'card_move';
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  extraPayload?: Record<string, unknown>;
}): string {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: eventType,
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-${action.replace(/_/g, '-')}-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode,
    role_owner: 'Controller',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-2.5',
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      action,
      ...extraPayload,
    },
    artifact_paths: [dbPath],
    linear_comment_ids: [] as string[],
    human_gate_required: false,
    redaction_level: 'none',
  };
  fs.mkdirSync(path.dirname(eventLedgerPath), { recursive: true });
  fs.appendFileSync(eventLedgerPath, `${JSON.stringify(event)}\n`);
  return eventId;
}

function appendMarketingDispatchPlanAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  companyOsRoot,
  dispatchPlan,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  companyOsRoot: string;
  dispatchPlan: JsonRecord;
}): string {
  const policy = isRecord(dispatchPlan.policy) ? dispatchPlan.policy : {};
  const subprocessSpawned = dispatchPlan.subprocess_spawned === true;
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_dispatch_plan_checked',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-dispatch-plan-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-dispatch-plan',
    role_owner: 'Controller',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      company_os_root: companyOsRoot,
      human_gate: 'HG-2.5',
      controller_approval_required: true,
      release_blocked: !subprocessSpawned,
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      action: 'dispatch_plan_check',
      dispatch_status: textField(dispatchPlan.status),
      subprocess_spawned: subprocessSpawned,
      reason_codes: Array.isArray(dispatchPlan.reason_codes) ? dispatchPlan.reason_codes : [],
      data_boundary_receipt: isRecord(policy.data_boundary_receipt) ? policy.data_boundary_receipt : {},
    },
    artifact_paths: [dbPath],
    linear_comment_ids: [] as string[],
    human_gate_required: true,
    redaction_level: 'none',
  };
  fs.mkdirSync(path.dirname(eventLedgerPath), { recursive: true });
  fs.appendFileSync(eventLedgerPath, `${JSON.stringify(event)}\n`);
  return eventId;
}

function marketingCardCreateAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-card-created',
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingCardMoveAuditEventId(cardId: string, occurredAt: string): string {
  return ['command-eve-kanban-marketing-card-moved', sanitizeEventIdPart(cardId), sanitizeEventIdPart(occurredAt)].join(
    '-'
  );
}

function marketingCardDispatchAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-dispatch-plan',
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingBoardResultBase(
  hermesHome: string
): Pick<CommandEveKanbanMarketingBoardResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_BOARD_BRIDGE_VERSION,
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingProofResultBase(
  hermesHome: string
): Pick<CommandEveKanbanMarketingProofCardResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_PROOF_CARD_BRIDGE_VERSION,
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingCardCreateResultBase(
  hermesHome: string
): Pick<CommandEveKanbanMarketingCardCreateResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_CARD_CREATE_BRIDGE_VERSION,
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingCardMoveResultBase(
  hermesHome: string
): Pick<CommandEveKanbanMarketingCardMoveResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_CARD_MOVE_BRIDGE_VERSION,
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingDispatchPlanResultBase(
  hermesHome: string,
  companyOsRoot?: string
): Pick<
  CommandEveKanbanMarketingDispatchPlanResult,
  | 'version'
  | 'source'
  | 'reason_codes'
  | 'subprocess_spawned'
  | 'data_boundary_checked'
  | 'controller_approval_required'
  | 'release_blocked'
  | 'human_gate'
> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_DISPATCH_PLAN_BRIDGE_VERSION,
    reason_codes: [],
    subprocess_spawned: false,
    data_boundary_checked: false,
    controller_approval_required: true,
    release_blocked: true,
    human_gate: 'HG-2.5',
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
      ...(companyOsRoot ? { company_os_root: companyOsRoot } : {}),
    },
  };
}

function normalizeMarketingLaneKey(value: string | undefined): CommandEveKanbanMarketingLaneKey | null {
  const lane = String(value || '').trim();
  return (MARKETING_BOARD_LANES as readonly string[]).includes(lane)
    ? (lane as CommandEveKanbanMarketingLaneKey)
    : null;
}

function resolveCompanyOsRootForDispatch(options: CommandEveKanbanMarketingDispatchPlanOptions): string | undefined {
  const env = options.env ?? process.env;
  return firstNonEmpty(
    options.companyOsRoot,
    env.COMMAND_EVE_NL5_COMPANY_OS_ROOT,
    env.COMMAND_EVE_COMPANY_OS_ROOT,
    env.COMPANY_OS_ROOT,
    env.COMMAND_EVE_SOURCE_ROOT
  );
}

function companyOsDispatchCliPath(companyOsRoot: string): string {
  return path.join(companyOsRoot, 'scripts', 'orchestration', 'hermes-pre-generation-dispatch.mjs');
}

function parseJsonRecord(value = ''): JsonRecord | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function reasonCodesFromDispatchPlan(plan: JsonRecord): string[] {
  return Array.isArray(plan.reason_codes)
    ? plan.reason_codes.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function buildMarketingDispatchRequest({
  task,
  cardId,
  command,
  companyOsRoot,
}: {
  task: JsonRecord;
  cardId: string;
  command: 'decompose' | 'specify';
  companyOsRoot: string;
}): JsonRecord {
  const title = textField(task.title);
  const body = textField(task.body);
  const laneKey = textField(task.current_step_key) || textField(task.status) || 'unknown';
  const payload = [
    `Command EVE marketing card: ${title}`,
    body ? `Description: ${body}` : '',
    `Lane: ${laneKey}`,
    `Task ID: ${cardId}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    command: `hermes kanban ${command}`,
    taskId: cardId,
    tenant: MARKETING_BOARD_TENANT,
    author: 'eve',
    critic: 'codex-controller',
    sourceRoot: companyOsRoot,
    requestedLane: 'local_only',
    payload,
    fields: {
      card_id: cardId,
      title,
      body,
      lane_key: laneKey,
      tenant: textField(task.tenant) || MARKETING_BOARD_TENANT,
      workflow_template_id: textField(task.workflow_template_id) || MARKETING_BOARD_WORKFLOW,
    },
    routeReceipt: {
      ok: true,
      status: 'local-only-pass',
      requested_lane: 'local_only',
      effective_lane: 'local_only',
      sensitivity: 'S1',
      sensitivity_score: 1,
      provider_execution_allowed: false,
      reason_codes: ['command_eve.local_dispatch_preview'],
    },
    auxiliaryLaneReceipt: {
      ok: true,
      status: 'local-only-pass',
      effective_lane: 'local_only',
      sensitivity: 'S1',
      sensitivity_score: 1,
      provider_execution_allowed: false,
      reason_codes: ['command_eve.no_external_auxiliary_lane'],
    },
    workerContract: {
      role: 'cmo',
      agent: 'hermes',
      mode: `kanban-${command}`,
      workspace: 'command-eve-local',
      dispatch: 'manual',
      source_of_truth: `Hermes kanban task ${cardId}`,
      acceptance_criteria:
        'NL-5 policy passes, HG-2.5 approval exists, and author/critic are separate before dispatch.',
      gates: 'NL-5 data boundary, route receipt, auxiliary receipt, HG-2.5, author-critic separation',
      human_gate: 'HG-2.5',
      reporting: 'Append task_events and agent-events receipts before any Hermes subprocess spawn.',
      author: 'eve',
      critic: 'codex-controller',
    },
    humanGate: 'HG-2.5',
    controllerApproval: {
      status: 'missing',
      reason: 'Command EVE UI only plans dispatch here; controller execution approval is a later explicit gate.',
    },
  };
}

function normalizeClientToken(value: string | undefined): string {
  return String(value || '')
    .trim()
    .slice(0, 128);
}

function marketingCardId(clientToken: string): string {
  return `t_command_eve_marketing_${sanitizeEventIdPart(clientToken).replace(/-/g, '_') || 'card'}`.slice(0, 96);
}

function readRuntimeReconciliation(filePath: string): {
  governance: CommandEveKanbanGovernanceStatus;
  warnings: string[];
} {
  const fallback: CommandEveKanbanGovernanceStatus = {
    runtime_reconciliation_path: filePath,
    dispatcher_disabled: false,
    auto_decompose_disabled: false,
    mcp_servers_disabled: false,
  };
  if (!fs.existsSync(filePath)) {
    return {
      governance: fallback,
      warnings: ['runtime_reconciliation_missing'],
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RuntimeReconciliationShape;
    if (!isRecord(raw) || raw.version !== RUNTIME_RECONCILIATION_VERSION || !isRecord(raw.hermes_config)) {
      return {
        governance: fallback,
        warnings: ['runtime_reconciliation_schema_mismatch'],
      };
    }
    const mcpServers = Array.isArray(raw.hermes_config.mcp_servers) ? raw.hermes_config.mcp_servers : [];
    return {
      governance: {
        runtime_reconciliation_path: filePath,
        dispatcher_disabled: raw.hermes_config.kanban_dispatch_in_gateway === false,
        auto_decompose_disabled: raw.hermes_config.kanban_auto_decompose === false,
        mcp_servers_disabled: mcpServers.length === 0,
      },
      warnings: [],
    };
  } catch {
    return {
      governance: fallback,
      warnings: ['runtime_reconciliation_json_invalid'],
    };
  }
}

function buildPythonProbe(): string {
  return String.raw`
import importlib
import importlib.metadata
import json
import os
import sqlite3
import sys

modules = json.loads(${JSON.stringify(JSON.stringify(KANBAN_MODULES))})
payload = {
    "installed_version": "",
    "modules": [],
    "board": {
        "slug": os.environ.get("HERMES_KANBAN_BOARD", "default") or "default",
        "db_path": "",
        "db_exists": False,
        "table_count": 0,
        "read_only_opened": False,
    },
}

try:
    payload["installed_version"] = importlib.metadata.version("hermes-agent")
except Exception as exc:
    payload["version_error"] = str(exc)

kanban_db = None
for module_spec in modules:
    module_name = module_spec["name"]
    try:
        module = importlib.import_module(module_name)
        payload["modules"].append({"name": module_name, "required": bool(module_spec.get("required")), "ok": True})
        if module_name == "hermes_cli.kanban_db":
            kanban_db = module
    except Exception as exc:
        payload["modules"].append({
            "name": module_name,
            "required": bool(module_spec.get("required")),
            "ok": False,
            "error": str(exc),
        })

if kanban_db is not None:
    try:
        db_path = str(kanban_db.kanban_db_path(payload["board"]["slug"]))
        payload["board"]["db_path"] = db_path
        payload["board"]["db_exists"] = os.path.isfile(db_path)
        if payload["board"]["db_exists"]:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            try:
                rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
                table_names = [row[0] for row in rows]
                payload["board"]["table_count"] = len(table_names)
                payload["board"]["read_only_opened"] = True
                if "tasks" in table_names:
                    payload["board"]["task_count"] = int(conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0])
            finally:
                conn.close()
    except Exception as exc:
        payload["board_error"] = str(exc)

print(json.dumps(payload))
if any(item.get("required") and not item.get("ok") for item in payload["modules"]) or not payload["installed_version"]:
    sys.exit(1)
sys.exit(0)
`;
}

function parseProbe(stdout = ''): {
  installedVersion: string;
  modules: CommandEveKanbanModuleCheck[];
  board: CommandEveKanbanBoardStatus;
  warnings: string[];
} {
  const parsed = JSON.parse(stdout) as unknown;
  if (
    !isRecord(parsed) ||
    typeof parsed.installed_version !== 'string' ||
    !Array.isArray(parsed.modules) ||
    !isRecord(parsed.board)
  ) {
    throw new Error('kanban probe returned an unexpected JSON shape');
  }
  const board = parsed.board;
  const warnings: string[] = [];
  if (typeof parsed.version_error === 'string') warnings.push('hermes_version_lookup_failed');
  if (typeof parsed.board_error === 'string') warnings.push('kanban_board_read_failed');
  return {
    installedVersion: parsed.installed_version,
    modules: parsed.modules.map((module) => {
      const item = isRecord(module) ? module : {};
      return {
        name: typeof item.name === 'string' ? item.name : 'unknown',
        required: item.required === true,
        ok: item.ok === true,
        ...(typeof item.error === 'string' ? { error: item.error } : {}),
      };
    }),
    board: {
      slug: typeof board.slug === 'string' ? board.slug : 'default',
      db_path: typeof board.db_path === 'string' ? board.db_path : '',
      db_exists: board.db_exists === true,
      table_count: typeof board.table_count === 'number' ? board.table_count : 0,
      ...(typeof board.task_count === 'number' ? { task_count: board.task_count } : {}),
      read_only_opened: board.read_only_opened === true,
    },
    warnings,
  };
}

export function runKanbanPreflight(options: CommandEveKanbanPreflightOptions): CommandEveKanbanPreflightResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const pythonPath = pythonBinary(paths.hermesVenv);
  const base = resultBase({
    generated_by: 'command-eve-kanban-preflight-core',
    hermes_home: paths.hermesHome,
    python_path: pythonPath,
  });

  if (!fs.existsSync(pythonPath)) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_PREFLIGHT_PYTHON_MISSING',
      message: 'Command EVE Hermes Python runtime is not installed yet.',
    };
  }

  const reconciliation = readRuntimeReconciliation(paths.runtimeReconciliation);
  const runner = options.commandRunner || defaultCommandRunner;
  const boardSlug = options.boardSlug || 'default';
  const result = runner({
    executable: pythonPath,
    args: ['-c', buildPythonProbe()],
    cwd: paths.hermesHome,
    env: {
      ...process.env,
      HERMES_HOME: paths.hermesHome,
      HERMES_KANBAN_HOME: paths.hermesHome,
      HERMES_KANBAN_BOARD: boardSlug,
      PYTHONNOUSERSITE: '1',
    },
    timeoutMs: 15_000,
    input: '',
  });

  try {
    const probe = parseProbe(result.stdout || '');
    const modulesOk =
      probe.modules.length === KANBAN_MODULES.length &&
      probe.modules.filter((module) => module.required).every((module) => module.ok);
    const versionOk = compareSemver(probe.installedVersion, MIN_HERMES_KANBAN_VERSION) >= 0;
    const governanceOk =
      reconciliation.governance.dispatcher_disabled &&
      reconciliation.governance.auto_decompose_disabled &&
      reconciliation.governance.mcp_servers_disabled;
    const warnings = [
      ...reconciliation.warnings,
      ...probe.warnings,
      ...(probe.modules.some((module) => !module.required && !module.ok)
        ? ['kanban_optional_dashboard_api_unavailable']
        : []),
      ...(probe.board.db_exists ? [] : ['kanban_board_db_missing_read_only_no_mutation']),
      ...(result.ok && modulesOk ? [] : ['kanban_python_probe_nonzero_exit']),
    ];

    const model: CommandEveKanbanPreflightModel = {
      schema_version: 'command-eve-kanban-preflight/v0',
      generated_at: (options.now ?? (() => new Date()))().toISOString(),
      read_only: true,
      hermes: {
        min_required_version: MIN_HERMES_KANBAN_VERSION,
        installed_version: probe.installedVersion,
        version_ok: versionOk,
      },
      modules: probe.modules,
      board: probe.board,
      governance: reconciliation.governance,
      warnings,
    };

    if (!versionOk) {
      return {
        ...base,
        ok: false,
        status: 'blocked',
        reason_code: 'KANBAN_HERMES_VERSION_TOO_OLD',
        message: `Hermes ${MIN_HERMES_KANBAN_VERSION} or newer is required for Command EVE Kanban adoption.`,
        model,
      };
    }
    if (!modulesOk) {
      return {
        ...base,
        ok: false,
        status: 'blocked',
        reason_code: 'KANBAN_MODULES_UNAVAILABLE',
        message: 'Hermes Kanban modules are not importable in the Command EVE runtime.',
        model,
      };
    }
    if (!governanceOk) {
      return {
        ...base,
        ok: false,
        status: 'blocked',
        reason_code: 'KANBAN_GOVERNANCE_NOT_LOCKED',
        message:
          'Kanban dispatcher, auto-decompose, and external MCP execution must stay disabled for read-first adoption.',
        model,
      };
    }

    return {
      ...base,
      ok: true,
      status: 'ready',
      reason_code: probe.board.db_exists ? 'KANBAN_PREFLIGHT_READY' : 'KANBAN_PREFLIGHT_READY_EMPTY_BOARD',
      model,
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_PREFLIGHT_FAILED',
      message: error instanceof Error ? error.message : 'Command EVE Kanban preflight failed.',
    };
  }
}

export function buildKanbanMarketingBoard(
  options: CommandEveKanbanMarketingBoardOptions
): CommandEveKanbanMarketingBoardResult {
  let boardSlug: string;
  try {
    boardSlug = normalizeBoardSlug(options.boardSlug);
  } catch (error) {
    const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
    return {
      ...marketingBoardResultBase(paths.hermesHome),
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_BOARD_SLUG_INVALID',
      message: error instanceof Error ? error.message : 'Invalid Hermes Kanban board slug.',
    };
  }

  const now = options.now ?? (() => new Date());
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const base = marketingBoardResultBase(paths.hermesHome);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const readResult = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      tenant: MARKETING_BOARD_TENANT,
      workflow: MARKETING_BOARD_WORKFLOW,
      proof_idempotency_key: MARKETING_PROOF_IDEMPOTENCY_KEY,
    },
    buildMarketingBoardReadScript(),
    paths.hermesHome
  );

  if (!readResult.ok || !readResult.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_BOARD_READ_FAILED',
      message: readResult.error || 'Command EVE marketing board could not be read.',
    };
  }

  const dbExists = readResult.data.db_exists === true;
  const tableCount = numberField(readResult.data.table_count);
  const warnings = Array.isArray(readResult.data.warnings)
    ? readResult.data.warnings.filter((item): item is string => typeof item === 'string')
    : [];

  if (!dbExists) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_BOARD_MISSING',
      message: 'Hermes marketing board has not been initialized yet.',
      model: marketingBoardBaseModel({
        boardSlug,
        dbPath,
        dbExists: false,
        tableCount: 0,
        now,
        warnings: ['no_marketing_board'],
      }),
    };
  }

  const rows = Array.isArray(readResult.data.rows) ? readResult.data.rows : [];
  const model = buildMarketingModelFromRows({
    boardSlug,
    dbPath,
    tableCount,
    rows,
    now,
    warnings,
  });

  return {
    ...base,
    ok: true,
    status: 'ready',
    reason_code: rows.length > 0 ? 'KANBAN_MARKETING_BOARD_READY' : 'KANBAN_MARKETING_BOARD_READY_EMPTY',
    model,
  };
}

export function createKanbanMarketingProofCard(
  options: CommandEveKanbanMarketingBoardOptions
): CommandEveKanbanMarketingProofCardResult {
  let boardSlug: string;
  try {
    boardSlug = normalizeBoardSlug(options.boardSlug);
  } catch (error) {
    const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
    return {
      ...marketingProofResultBase(paths.hermesHome),
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_BOARD_SLUG_INVALID',
      message: error instanceof Error ? error.message : 'Invalid Hermes Kanban board slug.',
    };
  }

  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingProofResultBase(paths.hermesHome);
  const reconciliation = readRuntimeReconciliation(paths.runtimeReconciliation);
  const governanceOk =
    reconciliation.governance.dispatcher_disabled &&
    reconciliation.governance.auto_decompose_disabled &&
    reconciliation.governance.mcp_servers_disabled;
  if (!governanceOk) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_GOVERNANCE_NOT_LOCKED',
      message: 'Proof-card writes require dispatcher, auto-decompose and external MCP execution to stay disabled.',
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const createdAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const cardId = MARKETING_PROOF_CARD_ID;
  const existingAuditEvents = fs.existsSync(eventLedgerPath) ? fs.readFileSync(eventLedgerPath, 'utf8') : '';
  const alreadyRecorded = existingAuditEvents.includes(`"issue_id":"${cardId}"`);
  const auditEventId = alreadyRecorded ? '' : marketingAuditEventId(cardId, occurredAt);

  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const writeResult = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: cardId,
      title: 'Command EVE Marketing Board proof card',
      body: 'Governance proof card created from Command EVE UI. No dispatcher, no auto-decompose, no worker dispatch.',
      assignee: 'cmo',
      priority: 10,
      created_at: createdAt,
      tenant: MARKETING_BOARD_TENANT,
      workflow: MARKETING_BOARD_WORKFLOW,
      idempotency_key: MARKETING_PROOF_IDEMPOTENCY_KEY,
      audit_event_id: auditEventId || `already-recorded:${cardId}`,
    },
    buildMarketingBoardWriteScript(),
    paths.hermesHome
  );

  if (!writeResult.ok || !writeResult.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_PROOF_CARD_WRITE_FAILED',
      message: writeResult.error || 'Command EVE marketing proof card could not be written.',
      audit_event_path: eventLedgerPath,
      ...(auditEventId ? { audit_event_id: auditEventId } : {}),
    };
  }

  const cardIdFromDb = textField(writeResult.data.card_id) || cardId;
  const created = writeResult.data.created === true;
  if (created && auditEventId) {
    appendMarketingAuditEvent({
      eventId: auditEventId,
      eventLedgerPath,
      occurredAt,
      cardId: cardIdFromDb,
      boardSlug,
      dbPath,
    });
  }
  const board = buildKanbanMarketingBoard({
    ...options,
    boardSlug,
    now,
    pythonPath,
  });

  return {
    ...base,
    ok: true,
    status: 'ready',
    reason_code: created ? 'KANBAN_MARKETING_PROOF_CARD_CREATED' : 'KANBAN_MARKETING_PROOF_CARD_EXISTS',
    card_id: cardIdFromDb,
    audit_event_path: eventLedgerPath,
    ...(auditEventId ? { audit_event_id: auditEventId } : {}),
    model: board.model,
  };
}

export function createKanbanMarketingCard(
  options: CommandEveKanbanMarketingCardCreateOptions
): CommandEveKanbanMarketingCardCreateResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingCardCreateResultBase(paths.hermesHome);

  let boardSlug: string;
  try {
    boardSlug = normalizeBoardSlug(options.boardSlug);
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_BOARD_SLUG_INVALID',
      message: error instanceof Error ? error.message : 'Invalid Hermes Kanban board slug.',
    };
  }

  const laneKey = normalizeMarketingLaneKey(options.lane_key);
  if (!laneKey) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_LANE_INVALID',
      message: `Unknown Command EVE marketing lane: ${String(options.lane_key || '')}`,
    };
  }

  const title = String(options.title || '').trim();
  if (!title) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_TITLE_REQUIRED',
      message: 'A non-empty card title is required to create a marketing card.',
      lane_key: laneKey,
    };
  }

  const clientToken = normalizeClientToken(options.client_token);
  if (!clientToken) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_CLIENT_TOKEN_REQUIRED',
      message: 'A client_token is required so card creation can dedupe idempotently.',
      lane_key: laneKey,
    };
  }

  const reconciliation = readRuntimeReconciliation(paths.runtimeReconciliation);
  const governanceOk =
    reconciliation.governance.dispatcher_disabled &&
    reconciliation.governance.auto_decompose_disabled &&
    reconciliation.governance.mcp_servers_disabled;
  if (!governanceOk) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_GOVERNANCE_NOT_LOCKED',
      message: 'Card creation requires dispatcher, auto-decompose and external MCP execution to stay disabled.',
      lane_key: laneKey,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const createdAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const cardId = marketingCardId(clientToken);
  const existingAuditEvents = fs.existsSync(eventLedgerPath) ? fs.readFileSync(eventLedgerPath, 'utf8') : '';
  const alreadyRecorded = existingAuditEvents.includes(`"issue_id":"${cardId}"`);
  const auditEventId = alreadyRecorded ? '' : marketingCardCreateAuditEventId(cardId, occurredAt);

  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const writeResult = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: cardId,
      title,
      body: String(options.description || ''),
      assignee: 'cmo',
      priority: 5,
      status: MARKETING_LANE_NATIVE_STATUS[laneKey],
      lane_key: laneKey,
      created_at: createdAt,
      tenant: MARKETING_BOARD_TENANT,
      workflow: MARKETING_BOARD_WORKFLOW,
      idempotency_key: clientToken,
      audit_event_id: auditEventId || `already-recorded:${cardId}`,
    },
    buildMarketingCardCreateScript(),
    paths.hermesHome
  );

  if (!writeResult.ok || !writeResult.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_CARD_CREATE_WRITE_FAILED',
      message: writeResult.error || 'Command EVE marketing card could not be written.',
      lane_key: laneKey,
      audit_event_path: eventLedgerPath,
      ...(auditEventId ? { audit_event_id: auditEventId } : {}),
    };
  }

  const cardIdFromDb = textField(writeResult.data.card_id) || cardId;
  const created = writeResult.data.created === true;
  if (created && auditEventId) {
    appendMarketingMutationAuditEvent({
      eventId: auditEventId,
      eventType: 'kanban.marketing_board_card_created',
      mode: 'kanban-card-create',
      action: 'card_create',
      eventLedgerPath,
      occurredAt,
      cardId: cardIdFromDb,
      boardSlug,
      dbPath,
      extraPayload: { lane_key: laneKey, client_token: clientToken },
    });
  }

  const board = buildKanbanMarketingBoard({
    ...options,
    boardSlug,
    now,
    pythonPath,
  });

  return {
    ...base,
    ok: true,
    status: 'ready',
    reason_code: created ? 'KANBAN_MARKETING_CARD_CREATED' : 'KANBAN_MARKETING_CARD_EXISTS',
    card_id: cardIdFromDb,
    lane_key: laneKey,
    audit_event_path: eventLedgerPath,
    ...(auditEventId ? { audit_event_id: auditEventId } : {}),
    model: board.model,
  };
}

export function moveKanbanMarketingCard(
  options: CommandEveKanbanMarketingCardMoveOptions
): CommandEveKanbanMarketingCardMoveResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingCardMoveResultBase(paths.hermesHome);

  let boardSlug: string;
  try {
    boardSlug = normalizeBoardSlug(options.boardSlug);
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_BOARD_SLUG_INVALID',
      message: error instanceof Error ? error.message : 'Invalid Hermes Kanban board slug.',
    };
  }

  const taskId = String(options.task_id || '').trim();
  if (!taskId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ID_REQUIRED',
      message: 'A task_id is required to move a marketing card.',
    };
  }

  const toLaneKey = normalizeMarketingLaneKey(options.to_lane_key);
  if (!toLaneKey) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_LANE_INVALID',
      message: `Unknown Command EVE marketing lane: ${String(options.to_lane_key || '')}`,
    };
  }

  const reconciliation = readRuntimeReconciliation(paths.runtimeReconciliation);
  const governanceOk =
    reconciliation.governance.dispatcher_disabled &&
    reconciliation.governance.auto_decompose_disabled &&
    reconciliation.governance.mcp_servers_disabled;
  if (!governanceOk) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_GOVERNANCE_NOT_LOCKED',
      message: 'Card moves require dispatcher, auto-decompose and external MCP execution to stay disabled.',
      to_lane_key: toLaneKey,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const movedAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardMoveAuditEventId(taskId, occurredAt);

  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const moveResult = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      to_lane_key: toLaneKey,
      to_status: MARKETING_LANE_NATIVE_STATUS[toLaneKey],
      moved_at: movedAt,
      audit_event_id: auditEventId,
    },
    buildMarketingCardMoveScript(),
    paths.hermesHome
  );

  if (!moveResult.ok || !moveResult.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_CARD_MOVE_WRITE_FAILED',
      message: moveResult.error || 'Command EVE marketing card could not be moved.',
      card_id: taskId,
      to_lane_key: toLaneKey,
      audit_event_path: eventLedgerPath,
    };
  }

  const found = moveResult.data.found === true;
  if (!found) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      to_lane_key: toLaneKey,
      audit_event_path: eventLedgerPath,
    };
  }

  const moved = moveResult.data.moved === true;
  const fromStep = textField(moveResult.data.from_step);
  const fromLaneKey = normalizeMarketingLaneKey(fromStep) ?? undefined;
  if (moved) {
    appendMarketingMutationAuditEvent({
      eventId: auditEventId,
      eventType: 'kanban.marketing_board_card_moved',
      mode: 'kanban-card-move',
      action: 'card_move',
      eventLedgerPath,
      occurredAt,
      cardId: taskId,
      boardSlug,
      dbPath,
      extraPayload: { from_lane_key: fromLaneKey ?? fromStep, to_lane_key: toLaneKey },
    });
  }

  const board = buildKanbanMarketingBoard({
    ...options,
    boardSlug,
    now,
    pythonPath,
  });

  return {
    ...base,
    ok: true,
    status: 'ready',
    reason_code: moved ? 'KANBAN_MARKETING_CARD_MOVED' : 'KANBAN_MARKETING_CARD_ALREADY_IN_LANE',
    card_id: taskId,
    ...(fromLaneKey ? { from_lane_key: fromLaneKey } : {}),
    to_lane_key: toLaneKey,
    moved,
    audit_event_path: eventLedgerPath,
    ...(moved ? { audit_event_id: auditEventId } : {}),
    model: board.model,
  };
}

export function planKanbanMarketingCardDispatch(
  options: CommandEveKanbanMarketingDispatchPlanOptions
): CommandEveKanbanMarketingDispatchPlanResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const companyOsRoot = resolveCompanyOsRootForDispatch(options);
  const base = marketingDispatchPlanResultBase(paths.hermesHome, companyOsRoot);

  let boardSlug: string;
  try {
    boardSlug = normalizeBoardSlug(options.boardSlug);
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_BOARD_SLUG_INVALID',
      reason_codes: ['KANBAN_BOARD_SLUG_INVALID'],
      message: error instanceof Error ? error.message : 'Invalid Hermes Kanban board slug.',
    };
  }

  const command = options.command === 'specify' ? 'specify' : 'decompose';
  const taskId = String(options.task_id || '').trim();
  if (!taskId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ID_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_CARD_ID_REQUIRED'],
      message: 'A task_id is required to plan a marketing card dispatch.',
      command,
    };
  }

  const reconciliation = readRuntimeReconciliation(paths.runtimeReconciliation);
  const governanceOk =
    reconciliation.governance.dispatcher_disabled &&
    reconciliation.governance.auto_decompose_disabled &&
    reconciliation.governance.mcp_servers_disabled;
  if (!governanceOk) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_GOVERNANCE_NOT_LOCKED',
      reason_codes: ['KANBAN_GOVERNANCE_NOT_LOCKED'],
      message: 'Dispatch planning requires dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
      command,
    };
  }

  if (!companyOsRoot) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'COMMAND_EVE_COMPANY_OS_ROOT_MISSING',
      reason_codes: ['COMMAND_EVE_COMPANY_OS_ROOT_MISSING'],
      message: 'Set COMMAND_EVE_NL5_COMPANY_OS_ROOT or COMMAND_EVE_COMPANY_OS_ROOT to run the NL-5 dispatch gate.',
      card_id: taskId,
      command,
    };
  }

  const dispatchCliPath = companyOsDispatchCliPath(companyOsRoot);
  if (!fs.existsSync(dispatchCliPath)) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'COMMAND_EVE_NL5_DISPATCH_CLI_MISSING',
      reason_codes: ['COMMAND_EVE_NL5_DISPATCH_CLI_MISSING'],
      message: `Company.OS NL-5 dispatch CLI not found: ${dispatchCliPath}`,
      card_id: taskId,
      command,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const checkedAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardDispatchAuditEventId(taskId, occurredAt);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const lookup = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
    },
    buildMarketingCardLookupScript(),
    paths.hermesHome
  );

  if (!lookup.ok || !lookup.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_CARD_LOOKUP_FAILED',
      reason_codes: ['KANBAN_MARKETING_CARD_LOOKUP_FAILED'],
      message: lookup.error || 'Command EVE marketing card could not be read before dispatch planning.',
      card_id: taskId,
      command,
      audit_event_path: eventLedgerPath,
    };
  }
  if (lookup.data.found !== true || !isRecord(lookup.data.task)) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      reason_codes: ['KANBAN_MARKETING_CARD_NOT_FOUND'],
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      command,
      audit_event_path: eventLedgerPath,
    };
  }

  const request = buildMarketingDispatchRequest({
    task: lookup.data.task,
    cardId: taskId,
    command,
    companyOsRoot,
  });
  const runner = options.commandRunner || defaultCommandRunner;
  const nodeRuntime = nodeRuntimeForDispatch();
  const dispatch = runner({
    executable: nodeRuntime.executable,
    args: [dispatchCliPath, '--stdin', '--cwd', companyOsRoot],
    cwd: companyOsRoot,
    env: {
      ...process.env,
      ...nodeRuntime.env,
      ...(options.env || {}),
    },
    timeoutMs: 30_000,
    input: `${JSON.stringify(request)}\n`,
  });
  const dispatchPlan = parseJsonRecord(dispatch.stdout || '');
  if (!dispatchPlan) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'COMMAND_EVE_NL5_DISPATCH_PLAN_PARSE_FAILED',
      reason_codes: ['COMMAND_EVE_NL5_DISPATCH_PLAN_PARSE_FAILED'],
      message: dispatch.stderr || dispatch.error || 'Company.OS NL-5 dispatch plan returned non-JSON output.',
      card_id: taskId,
      command,
      audit_event_path: eventLedgerPath,
    };
  }

  const policy = isRecord(dispatchPlan.policy) ? dispatchPlan.policy : {};
  const dataBoundaryChecked = isRecord(policy.data_boundary_receipt);
  const reasonCodes = reasonCodesFromDispatchPlan(dispatchPlan);
  const subprocessSpawned = dispatchPlan.subprocess_spawned === true;
  const controllerApprovalRequired = true;
  const releaseBlocked = !subprocessSpawned;
  const receiptWrite = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      audit_event_id: auditEventId,
      checked_at: checkedAt,
      dispatch_status: textField(dispatchPlan.status) || (dispatch.ok ? 'ready' : 'blocked'),
      reason_codes: reasonCodes,
      data_boundary_checked: dataBoundaryChecked,
      subprocess_spawned: subprocessSpawned,
      controller_approval_required: controllerApprovalRequired,
      release_blocked: releaseBlocked,
      policy,
    },
    buildMarketingCardDispatchPlanScript(),
    paths.hermesHome
  );

  if (!receiptWrite.ok || !receiptWrite.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_DISPATCH_RECEIPT_WRITE_FAILED',
      reason_codes: ['KANBAN_MARKETING_DISPATCH_RECEIPT_WRITE_FAILED'],
      message: receiptWrite.error || 'Command EVE dispatch-plan receipt could not be written.',
      card_id: taskId,
      command,
      audit_event_path: eventLedgerPath,
      dispatch_plan: dispatchPlan,
      policy,
      subprocess_spawned: subprocessSpawned,
      data_boundary_checked: dataBoundaryChecked,
      controller_approval_required: controllerApprovalRequired,
      release_blocked: releaseBlocked,
      human_gate: 'HG-2.5',
    };
  }

  appendMarketingDispatchPlanAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    cardId: taskId,
    boardSlug,
    dbPath,
    companyOsRoot,
    dispatchPlan,
  });

  const ready = dispatchPlan.status === 'ready' || dispatchPlan.status === 'dispatched';
  return {
    ...base,
    ok: dispatchPlan.ok === true && ready,
    status: ready ? 'ready' : dispatchPlan.status === 'failed' ? 'failed' : 'blocked',
    reason_code: ready
      ? 'KANBAN_MARKETING_DISPATCH_PLAN_READY'
      : reasonCodes[0] || 'KANBAN_MARKETING_DISPATCH_PLAN_BLOCKED',
    reason_codes: reasonCodes,
    message: ready
      ? 'NL-5 dispatch plan is ready, but execution still requires an explicit controller gate.'
      : 'NL-5 dispatch plan blocked execution before Hermes could spawn.',
    card_id: taskId,
    command,
    subprocess_spawned: subprocessSpawned,
    data_boundary_checked: dataBoundaryChecked,
    controller_approval_required: controllerApprovalRequired,
    release_blocked: releaseBlocked,
    human_gate: 'HG-2.5',
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    dispatch_plan: dispatchPlan,
    policy,
  };
}
