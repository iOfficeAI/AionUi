/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  applyKanbanMarketingCardAction,
  approveKanbanMarketingOutput,
  buildKanbanMarketingBoard,
  checkKanbanMarketingWorkerStartGate,
  createKanbanMarketingCard,
  createKanbanMarketingProofCard,
  generateKanbanMarketingDraft,
  moveKanbanMarketingCard,
  planKanbanMarketingCardDispatch,
  prepareKanbanMarketingWorkerDispatcher,
  promoteKanbanMarketingWorkerExecutor,
  recordKanbanMarketingDispatchApproval,
  recordKanbanMarketingDispatchDecision,
  requestKanbanMarketingWorkerDispatch,
  runKanbanMarketingWorkerObserved,
  runKanbanPreflight,
  type CommandEveKanbanPreflightCommandRunner,
} from '@/process/commandEve/kanbanPreflightCore';

const tempRoots: string[] = [];

const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-kanban-preflight-test-'));
  tempRoots.push(root);
  return root;
};

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const makePython = (root: string): string => {
  const pythonPath = path.join(root, 'command-eve-runtime', 'hermes', 'venv', 'bin', 'python');
  fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
  fs.writeFileSync(pythonPath, '#!/usr/bin/env python3\n', { mode: 0o700 });
  return pythonPath;
};

const writeLockedReconciliation = (root: string, overrides: Record<string, unknown> = {}): string => {
  const filePath = path.join(root, 'command-eve-runtime', 'capabilities', 'command-eve-runtime-reconciliation.json');
  writeJson(filePath, {
    version: 'command-eve-runtime-reconciliation/v0',
    hermes_config: {
      mcp_servers: [],
      kanban_dispatch_in_gateway: false,
      kanban_auto_decompose: false,
      ...overrides,
    },
  });
  return filePath;
};

const marketingBoardPath = (root: string): string =>
  path.join(root, 'command-eve-runtime', 'hermes', 'home', 'kanban', 'boards', 'marketing', 'kanban.db');

const makeCompanyOsDispatchCli = (root: string): string => {
  const cliPath = path.join(root, 'scripts', 'orchestration', 'hermes-pre-generation-dispatch.mjs');
  fs.mkdirSync(path.dirname(cliPath), { recursive: true });
  fs.writeFileSync(cliPath, '#!/usr/bin/env node\n', { mode: 0o700 });
  return cliPath;
};

const createNativeKanbanDb = (dbPath: string): void => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  execFileSync(
    'python3',
    [
      '-c',
      `
import sqlite3
import sys
conn = sqlite3.connect(sys.argv[1])
try:
    conn.executescript("""
      CREATE TABLE tasks (
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
      CREATE TABLE task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        run_id INTEGER,
        kind TEXT NOT NULL,
        payload TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE task_links (
        parent_id TEXT NOT NULL,
        child_id TEXT NOT NULL,
        PRIMARY KEY (parent_id, child_id)
      );
    """)
    conn.commit()
finally:
    conn.close()
`,
      dbPath,
    ],
    { encoding: 'utf8' }
  );
};

const readRows = (dbPath: string, sql: string): unknown[] => {
  const stdout = execFileSync(
    'python3',
    [
      '-c',
      `
import json
import sqlite3
import sys
conn = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
try:
    rows = [dict(row) for row in conn.execute(sys.argv[2]).fetchall()]
    print(json.dumps(rows))
finally:
    conn.close()
`,
      dbPath,
      sql,
    ],
    { encoding: 'utf8' }
  );
  return JSON.parse(stdout) as unknown[];
};

const readAuditEvents = (eventLedgerPath: string): Array<Record<string, unknown>> =>
  fs
    .readFileSync(eventLedgerPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const probePayload = (version = '0.16.0') => ({
  installed_version: version,
  modules: [
    { name: 'hermes_cli.kanban_db', required: true, ok: true },
    { name: 'hermes_cli.kanban', required: true, ok: true },
    { name: 'tools.kanban_tools', required: true, ok: true },
    { name: 'plugins.kanban.dashboard.plugin_api', required: false, ok: true },
  ],
  board: {
    slug: 'default',
    db_path: '/tmp/kanban.db',
    db_exists: false,
    table_count: 0,
    read_only_opened: false,
  },
});

const runnerWithPayload =
  (payload: unknown): CommandEveKanbanPreflightCommandRunner =>
  (_request) => ({
    ok: true,
    exitCode: 0,
    stdout: `${JSON.stringify(payload)}\n`,
    stderr: '',
  });

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Command EVE Kanban preflight core', () => {
  it('passes read-only with Hermes 0.16 modules and locked governance', () => {
    const root = makeRoot();
    makePython(root);
    const reconciliationPath = writeLockedReconciliation(root);

    const result = runKanbanPreflight({
      userDataPath: root,
      now: () => new Date('2026-06-11T08:00:00.000Z'),
      commandRunner: runnerWithPayload(probePayload()),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.reason_code).toBe('KANBAN_PREFLIGHT_READY_EMPTY_BOARD');
    expect(result.model?.hermes.installed_version).toBe('0.16.0');
    expect(result.model?.hermes.version_ok).toBe(true);
    expect(result.model?.modules.every((module) => module.ok)).toBe(true);
    expect(result.model?.board.db_exists).toBe(false);
    expect(result.model?.governance.runtime_reconciliation_path).toBe(reconciliationPath);
    expect(result.model?.governance.dispatcher_disabled).toBe(true);
    expect(result.model?.warnings).toContain('kanban_board_db_missing_read_only_no_mutation');
  });

  it('keeps optional Hermes dashboard API failures as visible warnings', () => {
    const root = makeRoot();
    makePython(root);
    writeLockedReconciliation(root);
    const payload = probePayload();
    payload.modules[3] = {
      name: 'plugins.kanban.dashboard.plugin_api',
      required: false,
      ok: false,
      error: 'python-multipart missing',
    };

    const result = runKanbanPreflight({
      userDataPath: root,
      commandRunner: runnerWithPayload(payload),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.model?.modules[3].required).toBe(false);
    expect(result.model?.warnings).toContain('kanban_optional_dashboard_api_unavailable');
  });

  it('blocks Hermes versions before the Kanban adoption floor', () => {
    const root = makeRoot();
    makePython(root);
    writeLockedReconciliation(root);

    const result = runKanbanPreflight({
      userDataPath: root,
      commandRunner: runnerWithPayload(probePayload('0.15.2')),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('KANBAN_HERMES_VERSION_TOO_OLD');
    expect(result.model?.hermes.version_ok).toBe(false);
  });

  it('blocks when Kanban governance is not locked read-first', () => {
    const root = makeRoot();
    makePython(root);
    writeLockedReconciliation(root, {
      kanban_auto_decompose: true,
    });

    const result = runKanbanPreflight({
      userDataPath: root,
      commandRunner: runnerWithPayload(probePayload()),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('KANBAN_GOVERNANCE_NOT_LOCKED');
    expect(result.model?.governance.auto_decompose_disabled).toBe(false);
  });

  it('blocks when the Hermes Python runtime is not installed', () => {
    const root = makeRoot();

    const result = runKanbanPreflight({
      userDataPath: root,
      commandRunner: runnerWithPayload(probePayload()),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('KANBAN_PREFLIGHT_PYTHON_MISSING');
    expect(result.source.python_path).toContain('command-eve-runtime/hermes/venv/bin/python');
  });

  it('blocks the marketing board read model when the Hermes board DB is missing', () => {
    const root = makeRoot();

    const result = buildKanbanMarketingBoard({
      userDataPath: root,
      boardSlug: 'marketing',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('KANBAN_MARKETING_BOARD_MISSING');
    expect(result.model?.board.db_exists).toBe(false);
    expect(result.model?.policy.dispatcher_enabled).toBe(false);
  });

  it('projects native Hermes tasks into Command EVE marketing lanes', () => {
    const root = makeRoot();
    const dbPath = marketingBoardPath(root);
    createNativeKanbanDb(dbPath);
    execFileSync(
      'python3',
      [
        '-c',
        `
import sqlite3
import sys
conn = sqlite3.connect(sys.argv[1])
try:
    conn.executemany(
        "INSERT INTO tasks (id, title, body, assignee, status, priority, created_by, created_at, workspace_kind, tenant, workflow_template_id, current_step_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scratch', ?, ?, ?)",
        [
            ('t_research', 'Research offer wedge', 'Gather proof points.', 'cmo', 'triage', 4, 'command-eve', 1812345600, 'command-eve-marketing', 'command-eve-marketing', 'research'),
            ('t_review', 'Review LinkedIn post', 'Needs founder pass.', 'cmo', 'review', 9, 'command-eve', 1812345700, 'command-eve-marketing', 'command-eve-marketing', 'review'),
        ],
    )
    conn.commit()
finally:
    conn.close()
`,
        dbPath,
      ],
      { encoding: 'utf8' }
    );

    const result = buildKanbanMarketingBoard({
      userDataPath: root,
      boardSlug: 'marketing',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.model?.columns.find((column) => column.key === 'research')?.cards[0].card_id).toBe('t_research');
    expect(result.model?.columns.find((column) => column.key === 'review')?.cards[0].card_id).toBe('t_review');
    expect(result.model?.summary.total_cards).toBe(2);
    expect(result.model?.summary.controller_review_pending_cards).toBe(0);
    expect(result.model?.policy.dispatcher_enabled).toBe(false);
    expect(result.model?.policy.auto_decompose_enabled).toBe(false);
  });

  it('creates one governed proof card and one linked append-only audit event', () => {
    const root = makeRoot();
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const result = createKanbanMarketingProofCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      now: () => new Date('2026-06-11T10:00:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.reason_code).toBe('KANBAN_MARKETING_PROOF_CARD_CREATED');
    expect(result.audit_event_path).toBe(eventLedgerPath);
    expect(result.audit_event_id).toContain(result.card_id || 'missing-card');

    const dbPath = marketingBoardPath(root);
    const tasks = readRows(dbPath, 'SELECT id, title, tenant, status, idempotency_key FROM tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: result.card_id,
      title: 'Command EVE Marketing Board proof card',
      tenant: 'command-eve-marketing',
      status: 'triage',
      idempotency_key: 'command-eve-marketing-board-proof-v0',
    });

    const taskEvents = readRows(dbPath, 'SELECT task_id, kind, payload FROM task_events');
    expect(taskEvents).toHaveLength(1);
    expect(taskEvents[0]).toMatchObject({
      task_id: result.card_id,
      kind: 'command_eve_proof_card_created',
    });
    expect(String((taskEvents[0] as { payload: string }).payload)).toContain(String(result.audit_event_id));

    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      event_type: 'kanban.marketing_board_proof_card_created',
      producer: 'command-eve-desktop',
      agent: 'eve',
      mode: 'kanban-proof',
    });
  });

  it('keeps the proof card action idempotent', () => {
    const root = makeRoot();
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const first = createKanbanMarketingProofCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      now: () => new Date('2026-06-11T10:00:00.000Z'),
    });
    const second = createKanbanMarketingProofCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      now: () => new Date('2026-06-11T10:05:00.000Z'),
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.reason_code).toBe('KANBAN_MARKETING_PROOF_CARD_EXISTS');
    expect(second.card_id).toBe(first.card_id);
    expect(readRows(marketingBoardPath(root), 'SELECT id FROM tasks')).toHaveLength(1);
    expect(readAuditEvents(eventLedgerPath)).toHaveLength(1);
  });

  it('blocks proof card writes unless Kanban governance stays locked', () => {
    const root = makeRoot();
    writeLockedReconciliation(root, {
      kanban_auto_decompose: true,
    });

    const result = createKanbanMarketingProofCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath: path.join(root, 'agent-events.jsonl'),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('KANBAN_GOVERNANCE_NOT_LOCKED');
    expect(fs.existsSync(marketingBoardPath(root))).toBe(false);
  });
});

describe('Command EVE Kanban marketing-board mutations', () => {
  it('creates a native card row, a created receipt, and one linked audit event', () => {
    const root = makeRoot();
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const result = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      title: 'Draft launch teaser',
      description: 'Short LinkedIn teaser for the alpha.',
      lane_key: 'draft',
      client_token: 'teaser-001',
      now: () => new Date('2026-06-12T09:00:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.reason_code).toBe('KANBAN_MARKETING_CARD_CREATED');
    expect(result.lane_key).toBe('draft');
    expect(result.audit_event_path).toBe(eventLedgerPath);
    expect(result.audit_event_id).toContain(result.card_id || 'missing-card');

    const dbPath = marketingBoardPath(root);
    const tasks = readRows(dbPath, 'SELECT id, title, tenant, status, current_step_key, idempotency_key FROM tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: result.card_id,
      title: 'Draft launch teaser',
      tenant: 'command-eve-marketing',
      status: 'todo',
      current_step_key: 'draft',
      idempotency_key: 'teaser-001',
    });

    const taskEvents = readRows(dbPath, 'SELECT task_id, kind, payload FROM task_events');
    expect(taskEvents).toHaveLength(1);
    expect(taskEvents[0]).toMatchObject({
      task_id: result.card_id,
      kind: 'command_eve_card_created',
    });
    expect(String((taskEvents[0] as { payload: string }).payload)).toContain(String(result.audit_event_id));

    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      event_type: 'kanban.marketing_board_card_created',
      producer: 'command-eve-desktop',
      agent: 'eve',
      mode: 'kanban-card-create',
    });

    expect(result.model?.columns.find((column) => column.key === 'draft')?.cards[0].card_id).toBe(result.card_id);
  });

  it('dedupes card creation on the client_token', () => {
    const root = makeRoot();
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const first = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      title: 'Research wedge',
      lane_key: 'research',
      client_token: 'wedge-007',
      now: () => new Date('2026-06-12T09:00:00.000Z'),
    });
    const second = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      title: 'Research wedge (retry)',
      lane_key: 'research',
      client_token: 'wedge-007',
      now: () => new Date('2026-06-12T09:05:00.000Z'),
    });

    expect(first.ok).toBe(true);
    expect(first.reason_code).toBe('KANBAN_MARKETING_CARD_CREATED');
    expect(second.ok).toBe(true);
    expect(second.reason_code).toBe('KANBAN_MARKETING_CARD_EXISTS');
    expect(second.card_id).toBe(first.card_id);
    expect(readRows(marketingBoardPath(root), 'SELECT id FROM tasks')).toHaveLength(1);
    expect(readAuditEvents(eventLedgerPath)).toHaveLength(1);
  });

  it('rejects card creation with an invalid lane (fail-closed, no write)', () => {
    const root = makeRoot();
    writeLockedReconciliation(root);

    const result = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath: path.join(root, 'agent-events.jsonl'),
      title: 'Bad lane card',
      lane_key: 'shipped',
      client_token: 'bad-lane-1',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('KANBAN_MARKETING_LANE_INVALID');
    expect(fs.existsSync(marketingBoardPath(root))).toBe(false);
  });

  it('blocks card creation fail-closed when governance is not locked', () => {
    const root = makeRoot();
    writeLockedReconciliation(root, {
      kanban_auto_decompose: true,
    });

    const result = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath: path.join(root, 'agent-events.jsonl'),
      title: 'Ungated card',
      lane_key: 'draft',
      client_token: 'ungated-1',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('KANBAN_GOVERNANCE_NOT_LOCKED');
    expect(fs.existsSync(marketingBoardPath(root))).toBe(false);
  });

  it('moves a card so the board projection changes and records a moved receipt + audit', () => {
    const root = makeRoot();
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const created = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      title: 'Move me forward',
      lane_key: 'research',
      client_token: 'move-me-1',
      now: () => new Date('2026-06-12T09:00:00.000Z'),
    });
    expect(created.ok).toBe(true);

    const moved = moveKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: created.card_id || '',
      to_lane_key: 'review',
      now: () => new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(moved.ok).toBe(true);
    expect(moved.status).toBe('ready');
    expect(moved.reason_code).toBe('KANBAN_MARKETING_CARD_MOVED');
    expect(moved.moved).toBe(true);
    expect(moved.from_lane_key).toBe('research');
    expect(moved.to_lane_key).toBe('review');
    expect(moved.audit_event_id).toBeTruthy();

    const dbPath = marketingBoardPath(root);
    const tasks = readRows(dbPath, 'SELECT id, status, current_step_key FROM tasks');
    expect(tasks[0]).toMatchObject({
      id: created.card_id,
      status: 'review',
      current_step_key: 'review',
    });

    const moveEvents = readRows(
      dbPath,
      "SELECT task_id, kind, payload FROM task_events WHERE kind = 'command_eve_card_moved'"
    );
    expect(moveEvents).toHaveLength(1);
    expect(String((moveEvents[0] as { payload: string }).payload)).toContain('research');
    expect(String((moveEvents[0] as { payload: string }).payload)).toContain('review');

    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents[1]).toMatchObject({
      event_type: 'kanban.marketing_board_card_moved',
      mode: 'kanban-card-move',
    });

    // Board projection moved from research to review.
    expect(moved.model?.columns.find((column) => column.key === 'research')?.cards).toHaveLength(0);
    expect(moved.model?.columns.find((column) => column.key === 'review')?.cards[0].card_id).toBe(created.card_id);
  });

  it('treats a move to the current lane as a no-op success (no extra receipt or audit)', () => {
    const root = makeRoot();
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const created = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      title: 'Stay put',
      lane_key: 'review',
      client_token: 'stay-1',
      now: () => new Date('2026-06-12T09:00:00.000Z'),
    });
    expect(created.ok).toBe(true);

    const noop = moveKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: created.card_id || '',
      to_lane_key: 'review',
      now: () => new Date('2026-06-12T10:00:00.000Z'),
    });

    expect(noop.ok).toBe(true);
    expect(noop.status).toBe('ready');
    expect(noop.reason_code).toBe('KANBAN_MARKETING_CARD_ALREADY_IN_LANE');
    expect(noop.moved).toBe(false);
    expect(noop.audit_event_id).toBeUndefined();

    const moveEvents = readRows(
      marketingBoardPath(root),
      "SELECT id FROM task_events WHERE kind = 'command_eve_card_moved'"
    );
    expect(moveEvents).toHaveLength(0);
    // Only the create audit event exists; the no-op move appended nothing.
    expect(readAuditEvents(eventLedgerPath)).toHaveLength(1);
  });

  it('blocks a card move fail-closed when governance is not locked', () => {
    const root = makeRoot();
    writeLockedReconciliation(root, {
      kanban_dispatch_in_gateway: true,
    });

    const result = moveKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath: path.join(root, 'agent-events.jsonl'),
      task_id: 't_command_eve_marketing_anything',
      to_lane_key: 'review',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('KANBAN_GOVERNANCE_NOT_LOCKED');
  });

  it('records comment, block, unblock and complete actions with receipts and audit events', () => {
    const root = makeRoot();
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const created = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      title: 'Action me',
      lane_key: 'draft',
      client_token: 'action-me-1',
      now: () => new Date('2026-06-14T09:00:00.000Z'),
    });
    expect(created.ok).toBe(true);
    const cardId = created.card_id || '';

    const commented = applyKanbanMarketingCardAction({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      action: 'comment',
      comment: 'Founder approved local draft direction.',
      now: () => new Date('2026-06-14T09:05:00.000Z'),
    });
    expect(commented.ok).toBe(true);
    expect(commented.reason_code).toBe('KANBAN_MARKETING_CARD_COMMENTED');

    const blocked = applyKanbanMarketingCardAction({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      action: 'block',
      now: () => new Date('2026-06-14T09:10:00.000Z'),
    });
    expect(blocked.ok).toBe(true);
    expect(blocked.to_status).toBe('blocked');
    expect(blocked.to_lane_key).toBe('review');

    const unblocked = applyKanbanMarketingCardAction({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      action: 'unblock',
      now: () => new Date('2026-06-14T09:15:00.000Z'),
    });
    expect(unblocked.ok).toBe(true);
    expect(unblocked.to_status).toBe('review');
    expect(unblocked.to_lane_key).toBe('review');

    const completed = applyKanbanMarketingCardAction({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      action: 'complete',
      now: () => new Date('2026-06-14T09:20:00.000Z'),
    });
    expect(completed.ok).toBe(true);
    expect(completed.reason_code).toBe('KANBAN_MARKETING_CARD_COMPLETED');
    expect(completed.to_status).toBe('completed');
    expect(completed.to_lane_key).toBe('readyToApprove');

    const dbPath = marketingBoardPath(root);
    const comments = readRows(dbPath, 'SELECT task_id, author, body FROM task_comments');
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      task_id: cardId,
      author: 'eve',
      body: 'Founder approved local draft direction.',
    });

    const tasks = readRows(dbPath, 'SELECT id, status, current_step_key, completed_at FROM tasks');
    expect(tasks[0]).toMatchObject({
      id: cardId,
      status: 'completed',
      current_step_key: 'readyToApprove',
      completed_at: 1781428800,
    });

    const actionEvents = readRows(
      dbPath,
      "SELECT kind, payload FROM task_events WHERE kind IN ('command_eve_card_commented', 'command_eve_card_blocked', 'command_eve_card_unblocked', 'command_eve_card_completed') ORDER BY id"
    );
    expect(actionEvents.map((event) => (event as { kind: string }).kind)).toEqual([
      'command_eve_card_commented',
      'command_eve_card_blocked',
      'command_eve_card_unblocked',
      'command_eve_card_completed',
    ]);
    for (const event of actionEvents) {
      const payload = JSON.parse(String((event as { payload: string }).payload)) as { subprocess_spawned?: boolean };
      expect(payload.subprocess_spawned).toBe(false);
    }

    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents.map((event) => event.event_type)).toEqual([
      'kanban.marketing_board_card_created',
      'kanban.marketing_board_card_commented',
      'kanban.marketing_board_card_blocked',
      'kanban.marketing_board_card_unblocked',
      'kanban.marketing_board_card_completed',
    ]);
    expect(completed.model?.columns.find((column) => column.key === 'readyToApprove')?.cards[0].card_id).toBe(cardId);
  });

  it('blocks card actions fail-closed when governance is not locked', () => {
    const root = makeRoot();
    writeLockedReconciliation(root, {
      kanban_dispatch_in_gateway: true,
    });

    const result = applyKanbanMarketingCardAction({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath: path.join(root, 'agent-events.jsonl'),
      task_id: 't_command_eve_marketing_anything',
      action: 'block',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('KANBAN_GOVERNANCE_NOT_LOCKED');
  });

  it('routes dispatch planning through the NL-5 gate and records a blocked receipt without spawning Hermes', () => {
    const root = makeRoot();
    const companyOsRoot = makeRoot();
    makeCompanyOsDispatchCli(companyOsRoot);
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const created = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      title: 'Dispatch me only after gates',
      description: 'Contains customer-facing marketing work, not a worker launch.',
      lane_key: 'draft',
      client_token: 'dispatch-plan-1',
      now: () => new Date('2026-06-13T09:00:00.000Z'),
    });
    expect(created.ok).toBe(true);

    const requests: unknown[] = [];
    const commandRunner: CommandEveKanbanPreflightCommandRunner = (request) => {
      requests.push(JSON.parse(request.input));
      return {
        ok: false,
        exitCode: 78,
        stdout: `${JSON.stringify({
          version: 'hermes-pre-generation-dispatch/v0',
          ok: false,
          status: 'blocked',
          subprocess_spawned: false,
          reason_codes: ['hermes.pre_generation.controller_approval_missing'],
          policy: {
            status: 'blocked',
            data_boundary_receipt: {
              ok: true,
              status: 'local-only-pass',
              sensitivity: 'S1',
              sensitivity_score: 1,
              effective_lane: 'local_only',
            },
          },
        })}\n`,
        stderr: '',
      };
    };

    const result = planKanbanMarketingCardDispatch({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: created.card_id || '',
      command: 'decompose',
      companyOsRoot,
      commandRunner,
      now: () => new Date('2026-06-13T10:00:00.000Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('hermes.pre_generation.controller_approval_missing');
    expect(result.subprocess_spawned).toBe(false);
    expect(result.data_boundary_checked).toBe(true);
    expect(result.controller_approval_required).toBe(true);
    expect(result.release_blocked).toBe(true);
    expect(result.human_gate).toBe('HG-2.5');
    expect(result.dispatch_handoff_packet).toMatchObject({
      version: 'command-eve-local-dispatch-handoff/v0',
      status: 'dispatch_ready_waiting_for_controller',
      dispatch: 'manual',
      role_label: 'role:cmo',
      human_gate: 'HG-2.5',
      safety: expect.objectContaining({
        nl5_gate_checked: true,
        subprocess_spawned: false,
        provider_execution_allowed: false,
        release_blocked: true,
      }),
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      command: 'hermes kanban decompose',
      taskId: created.card_id,
      requestedLane: 'local_only',
      humanGate: 'HG-2.5',
    });

    const dispatchEvents = readRows(
      marketingBoardPath(root),
      "SELECT task_id, kind, payload FROM task_events WHERE kind = 'command_eve_dispatch_plan_checked'"
    );
    expect(dispatchEvents).toHaveLength(1);
    expect(dispatchEvents[0]).toMatchObject({
      task_id: created.card_id,
      kind: 'command_eve_dispatch_plan_checked',
    });
    const payload = JSON.parse(String((dispatchEvents[0] as { payload: string }).payload)) as {
      nl5_gate_checked?: boolean;
      subprocess_spawned?: boolean;
      controller_approval_required?: boolean;
      release_blocked?: boolean;
      reason_codes?: string[];
      dispatch_handoff_packet?: {
        version?: string;
        dispatch?: string;
        role_label?: string;
      };
    };
    expect(payload.nl5_gate_checked).toBe(true);
    expect(payload.subprocess_spawned).toBe(false);
    expect(payload.controller_approval_required).toBe(true);
    expect(payload.release_blocked).toBe(true);
    expect(payload.reason_codes).toContain('hermes.pre_generation.controller_approval_missing');
    expect(payload.dispatch_handoff_packet).toMatchObject({
      version: 'command-eve-local-dispatch-handoff/v0',
      dispatch: 'manual',
      role_label: 'role:cmo',
    });

    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents[1]).toMatchObject({
      event_type: 'kanban.marketing_board_dispatch_plan_checked',
      producer: 'command-eve-desktop',
      agent: 'eve',
      mode: 'kanban-dispatch-plan',
      human_gate_required: true,
      payload: expect.objectContaining({
        controller_approval_required: true,
        release_blocked: true,
        subprocess_spawned: false,
        dispatch_handoff_packet: expect.objectContaining({
          version: 'command-eve-local-dispatch-handoff/v0',
          dispatch: 'manual',
          role_label: 'role:cmo',
        }),
      }),
    });

    const approval = recordKanbanMarketingDispatchApproval({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: created.card_id || '',
      dispatch_handoff_packet: result.dispatch_handoff_packet,
      review_note: 'Controller sees this handoff and keeps execution blocked.',
      now: () => new Date('2026-06-13T10:05:00.000Z'),
    });

    expect(approval.ok).toBe(true);
    expect(approval.status).toBe('ready');
    expect(approval.reason_code).toBe('KANBAN_MARKETING_CONTROLLER_APPROVAL_PENDING_RECORDED');
    expect(approval.approval_event_kind).toBe('command_eve_controller_approval_pending');
    expect(approval.controller_approval_status).toBe('pending');
    expect(approval.subprocess_spawned).toBe(false);
    expect(approval.release_blocked).toBe(true);
    expect(approval.human_gate).toBe('HG-2.5');
    expect(approval.dispatch_handoff_packet).toMatchObject({
      version: 'command-eve-local-dispatch-handoff/v0',
      dispatch: 'manual',
      role_label: 'role:cmo',
    });
    expect(approval.model?.summary.controller_review_pending_cards).toBe(1);
    const projectedCard = approval.model?.columns
      .flatMap((column) => column.cards)
      .find((card) => card.card_id === created.card_id);
    expect(projectedCard).toMatchObject({
      controller_review_status: 'pending',
      controller_review_audit_event_id: approval.audit_event_id,
      controller_review_handoff_role: 'role:cmo',
      controller_review_handoff_dispatch: 'manual',
    });

    const approvalEvents = readRows(
      marketingBoardPath(root),
      "SELECT task_id, kind, payload FROM task_events WHERE kind = 'command_eve_controller_approval_pending'"
    );
    expect(approvalEvents).toHaveLength(1);
    const approvalPayload = JSON.parse(String((approvalEvents[0] as { payload: string }).payload)) as {
      controller_approval_status?: string;
      controller_approved?: boolean;
      release_blocked?: boolean;
      subprocess_spawned?: boolean;
      reason_codes?: string[];
      dispatch_handoff_packet?: {
        dispatch?: string;
        role_label?: string;
      };
    };
    expect(approvalPayload.controller_approval_status).toBe('pending');
    expect(approvalPayload.controller_approved).toBe(false);
    expect(approvalPayload.release_blocked).toBe(true);
    expect(approvalPayload.subprocess_spawned).toBe(false);
    expect(approvalPayload.reason_codes).toContain('command_eve.controller_approval_pending');
    expect(approvalPayload.dispatch_handoff_packet).toMatchObject({
      dispatch: 'manual',
      role_label: 'role:cmo',
    });

    const nextAuditEvents = readAuditEvents(eventLedgerPath);
    expect(nextAuditEvents).toHaveLength(3);
    expect(nextAuditEvents[2]).toMatchObject({
      event_type: 'kanban.marketing_board_controller_approval_pending',
      producer: 'command-eve-desktop',
      agent: 'eve',
      mode: 'kanban-controller-approval',
      human_gate_required: true,
      payload: expect.objectContaining({
        controller_approval_status: 'pending',
        controller_approved: false,
        release_blocked: true,
        subprocess_spawned: false,
        dispatch_handoff_packet: expect.objectContaining({
          dispatch: 'manual',
          role_label: 'role:cmo',
        }),
      }),
    });

    const decision = recordKanbanMarketingDispatchDecision({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: created.card_id || '',
      decision: 'approved',
      dispatch_handoff_packet: result.dispatch_handoff_packet,
      decision_note: 'Controller approves the handoff as a receipt only; execution stays blocked.',
      now: () => new Date('2026-06-13T10:06:00.000Z'),
    });

    expect(decision.ok).toBe(true);
    expect(decision.status).toBe('ready');
    expect(decision.reason_code).toBe('KANBAN_MARKETING_CONTROLLER_APPROVAL_RECORDED_NO_SPAWN');
    expect(decision.decision_event_kind).toBe('command_eve_controller_decision_recorded');
    expect(decision.controller_approval_status).toBe('approved');
    expect(decision.controller_approved).toBe(true);
    expect(decision.subprocess_spawned).toBe(false);
    expect(decision.release_blocked).toBe(true);
    expect(decision.human_gate).toBe('HG-2.5');
    expect(decision.model?.summary.controller_decision_recorded_cards).toBe(1);
    expect(decision.model?.summary.controller_decision_approved_cards).toBe(1);
    expect(decision.model?.summary.controller_decision_rejected_cards).toBe(0);
    const decidedCard = decision.model?.columns
      .flatMap((column) => column.cards)
      .find((card) => card.card_id === created.card_id);
    expect(decidedCard).toMatchObject({
      controller_decision_status: 'approved',
      controller_decision_audit_event_id: decision.audit_event_id,
      controller_decision_handoff_role: 'role:cmo',
      controller_decision_handoff_dispatch: 'manual',
    });

    const decisionEvents = readRows(
      marketingBoardPath(root),
      "SELECT task_id, kind, payload FROM task_events WHERE kind = 'command_eve_controller_decision_recorded'"
    );
    expect(decisionEvents).toHaveLength(1);
    const decisionPayload = JSON.parse(String((decisionEvents[0] as { payload: string }).payload)) as {
      controller_approval_status?: string;
      controller_approved?: boolean;
      release_blocked?: boolean;
      subprocess_spawned?: boolean;
      reason_codes?: string[];
    };
    expect(decisionPayload.controller_approval_status).toBe('approved');
    expect(decisionPayload.controller_approved).toBe(true);
    expect(decisionPayload.release_blocked).toBe(true);
    expect(decisionPayload.subprocess_spawned).toBe(false);
    expect(decisionPayload.reason_codes).toContain('command_eve.controller_approval_recorded_no_spawn');

    const finalAuditEvents = readAuditEvents(eventLedgerPath);
    expect(finalAuditEvents).toHaveLength(4);
    expect(finalAuditEvents[3]).toMatchObject({
      event_type: 'kanban.marketing_board_controller_decision_recorded',
      producer: 'command-eve-desktop',
      agent: 'eve',
      mode: 'kanban-controller-decision',
      human_gate_required: true,
      payload: expect.objectContaining({
        controller_approval_status: 'approved',
        controller_approved: true,
        release_blocked: true,
        subprocess_spawned: false,
        dispatch_handoff_packet: expect.objectContaining({
          dispatch: 'manual',
          role_label: 'role:cmo',
        }),
      }),
    });

    const draft = generateKanbanMarketingDraft({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: created.card_id || '',
      dispatch_handoff_packet: result.dispatch_handoff_packet,
      generation_note: 'Generate the first local marketing loop output.',
      now: () => new Date('2026-06-13T10:07:00.000Z'),
    });

    expect(draft.ok).toBe(true);
    expect(draft.status).toBe('ready');
    expect(draft.reason_code).toBe('KANBAN_MARKETING_DRAFT_GENERATED');
    expect(draft.draft_event_kind).toBe('command_eve_marketing_draft_generated');
    expect(draft.data_boundary_checked).toBe(true);
    expect(draft.controller_approved).toBe(true);
    expect(draft.release_blocked).toBe(false);
    expect(draft.subprocess_spawned).toBe(false);
    expect(draft.draft_text).toContain('Dispatch me only after gates');
    expect(draft.model?.summary.generated_draft_cards).toBe(1);
    const generatedCard = draft.model?.columns
      .flatMap((column) => column.cards)
      .find((card) => card.card_id === created.card_id);
    expect(generatedCard).toMatchObject({
      lane_key: 'review',
      generated_draft_status: 'generated',
      generated_draft_audit_event_id: draft.audit_event_id,
      generated_draft_source: 'command-eve-local-marketing-draft-generator/v0',
    });
    expect(generatedCard?.generated_draft_text).toContain('Dispatch me only after gates');

    const draftEvents = readRows(
      marketingBoardPath(root),
      "SELECT task_id, kind, payload FROM task_events WHERE kind = 'command_eve_marketing_draft_generated'"
    );
    expect(draftEvents).toHaveLength(1);
    const draftPayload = JSON.parse(String((draftEvents[0] as { payload: string }).payload)) as {
      controller_approval_status?: string;
      controller_approved?: boolean;
      release_blocked?: boolean;
      subprocess_spawned?: boolean;
      nl5_gate_checked?: boolean;
      draft_status?: string;
      draft_text?: string;
      reason_codes?: string[];
    };
    expect(draftPayload.controller_approval_status).toBe('approved');
    expect(draftPayload.controller_approved).toBe(true);
    expect(draftPayload.release_blocked).toBe(false);
    expect(draftPayload.subprocess_spawned).toBe(false);
    expect(draftPayload.nl5_gate_checked).toBe(true);
    expect(draftPayload.draft_status).toBe('generated');
    expect(draftPayload.draft_text).toContain('Dispatch me only after gates');
    expect(draftPayload.reason_codes).toContain('command_eve.marketing_draft_generated_local');

    const comments = readRows(marketingBoardPath(root), 'SELECT task_id, author, body FROM task_comments');
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      task_id: created.card_id,
      author: 'eve',
    });
    expect(String((comments[0] as { body: string }).body)).toContain('Dispatch me only after gates');

    const draftAuditEvents = readAuditEvents(eventLedgerPath);
    expect(draftAuditEvents).toHaveLength(5);
    expect(draftAuditEvents[4]).toMatchObject({
      event_type: 'kanban.marketing_board_marketing_draft_generated',
      producer: 'command-eve-desktop',
      agent: 'eve',
      mode: 'kanban-marketing-draft-generate',
      human_gate_required: true,
      payload: expect.objectContaining({
        controller_approval_status: 'approved',
        controller_approved: true,
        release_blocked: false,
        subprocess_spawned: false,
        external_calls: false,
        draft_status: 'generated',
      }),
    });
  });

  it('blocks local marketing draft generation before a controller approval decision exists', () => {
    const root = makeRoot();
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const created = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      title: 'Do not draft before approval',
      description: 'A draft must wait for the local HG-2.5 controller decision receipt.',
      lane_key: 'draft',
      client_token: 'draft-before-approval-1',
      now: () => new Date('2026-06-15T11:00:00.000Z'),
    });
    expect(created.ok).toBe(true);

    const draft = generateKanbanMarketingDraft({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: created.card_id || '',
      dispatch_handoff_packet: {
        version: 'command-eve-local-dispatch-handoff/v0',
        dispatch: 'manual',
        role_label: 'role:cmo',
        card_id: created.card_id,
      },
      now: () => new Date('2026-06-15T11:03:00.000Z'),
    });

    expect(draft.ok).toBe(false);
    expect(draft.status).toBe('blocked');
    expect(draft.reason_code).toBe('KANBAN_MARKETING_CONTROLLER_APPROVAL_REQUIRED');
    expect(draft.data_boundary_checked).toBe(true);
    expect(draft.controller_approved).toBe(false);
    expect(draft.release_blocked).toBe(true);
    expect(draft.subprocess_spawned).toBe(false);

    const draftEvents = readRows(
      marketingBoardPath(root),
      "SELECT kind FROM task_events WHERE kind = 'command_eve_marketing_draft_generated'"
    );
    expect(draftEvents).toHaveLength(0);
    const comments = readRows(marketingBoardPath(root), 'SELECT body FROM task_comments');
    expect(comments).toHaveLength(0);
    const auditEvents = readAuditEvents(eventLedgerPath);
    expect(auditEvents.map((event) => event.event_type)).not.toContain(
      'kanban.marketing_board_marketing_draft_generated'
    );
  });

  it('uses the embedded NL-5 gate when the Company.OS dispatch CLI is unavailable', () => {
    const root = makeRoot();
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const created = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      title: 'Embedded NL-5 check',
      description: 'Prospect phone +49 30 12345678 must still be gated before Hermes.',
      lane_key: 'draft',
      client_token: 'embedded-nl5-1',
      now: () => new Date('2026-06-15T09:00:00.000Z'),
    });
    expect(created.ok).toBe(true);

    const result = planKanbanMarketingCardDispatch({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: created.card_id || '',
      command: 'decompose',
      now: () => new Date('2026-06-15T09:30:00.000Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('hermes.pre_generation.controller_approval_missing');
    expect(result.subprocess_spawned).toBe(false);
    expect(result.data_boundary_checked).toBe(true);
    expect(result.controller_approval_required).toBe(true);
    expect(result.release_blocked).toBe(true);
    expect(result.dispatch_handoff_packet).toMatchObject({
      version: 'command-eve-local-dispatch-handoff/v0',
      dispatch: 'manual',
      role_label: 'role:cmo',
      safety: expect.objectContaining({
        dispatch_source: 'command-eve-embedded-nl5',
        subprocess_spawned: false,
      }),
    });
    const policy = result.policy as { data_boundary_receipt?: { finding_count?: number } } | undefined;
    expect(policy?.data_boundary_receipt?.finding_count ?? 0).toBeGreaterThanOrEqual(1);
    expect(result.policy).toMatchObject({
      implementation: 'command-eve-embedded-nl5',
      status: 'blocked',
      controller_approved: false,
      data_boundary_receipt: expect.objectContaining({
        ok: true,
        status: 'local-only-pass',
        raw_text_stored: false,
      }),
    });

    const dispatchEvents = readRows(
      marketingBoardPath(root),
      "SELECT kind, payload FROM task_events WHERE kind = 'command_eve_dispatch_plan_checked'"
    );
    expect(dispatchEvents).toHaveLength(1);
    const payload = JSON.parse(String((dispatchEvents[0] as { payload: string }).payload)) as {
      nl5_gate_checked?: boolean;
      subprocess_spawned?: boolean;
      controller_approval_required?: boolean;
      release_blocked?: boolean;
      reason_codes?: string[];
      dispatch_handoff_packet?: {
        version?: string;
        dispatch?: string;
        role_label?: string;
        safety?: { dispatch_source?: string };
      };
    };
    expect(payload.nl5_gate_checked).toBe(true);
    expect(payload.subprocess_spawned).toBe(false);
    expect(payload.controller_approval_required).toBe(true);
    expect(payload.release_blocked).toBe(true);
    expect(payload.reason_codes).toContain('hermes.pre_generation.controller_approval_missing');
    expect(payload.dispatch_handoff_packet).toMatchObject({
      version: 'command-eve-local-dispatch-handoff/v0',
      dispatch: 'manual',
      role_label: 'role:cmo',
      safety: expect.objectContaining({ dispatch_source: 'command-eve-embedded-nl5' }),
    });
  });
});

describe('Command EVE Kanban marketing-executor LADDER (v15 gated, additive)', () => {
  // Valid observed-local runtime executor profile accepted by the start gate.
  const validExecutorProfile = {
    version: 'command-eve-runtime-executor-profile/v0',
    executor_kind: 'hermes-local-observed',
    execution_mode: 'observed',
    transport: 'local',
    data_boundary_enforced: true,
    external_calls_allowed: false,
    subprocess_spawn_allowed: false,
    hg3_approved: true,
    approved_by: 'cao',
    approved_at: '2026-06-13T11:00:00.000Z',
  };

  // Drives a fresh card through dispatch-plan -> controller-approval -> decision
  // -> draft-generated, returning the shared context the ladder builds on.
  const driveToGeneratedDraft = (): {
    root: string;
    eventLedgerPath: string;
    cardId: string;
    handoff: Record<string, unknown>;
  } => {
    const root = makeRoot();
    const companyOsRoot = makeRoot();
    makeCompanyOsDispatchCli(companyOsRoot);
    writeLockedReconciliation(root);
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');

    const created = createKanbanMarketingCard({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      title: 'Dispatch me only after gates',
      description: 'Customer-facing marketing work with prospect phone +49 30 12345678, not a worker launch.',
      lane_key: 'draft',
      client_token: 'ladder-1',
      now: () => new Date('2026-06-13T09:00:00.000Z'),
    });
    expect(created.ok).toBe(true);
    const cardId = created.card_id || '';

    const commandRunner: CommandEveKanbanPreflightCommandRunner = () => ({
      ok: false,
      exitCode: 78,
      stdout: `${JSON.stringify({
        version: 'hermes-pre-generation-dispatch/v0',
        ok: false,
        status: 'blocked',
        subprocess_spawned: false,
        reason_codes: ['hermes.pre_generation.controller_approval_missing'],
        policy: {
          status: 'blocked',
          data_boundary_receipt: {
            ok: true,
            status: 'local-only-pass',
            sensitivity: 'S1',
            sensitivity_score: 1,
            effective_lane: 'local_only',
          },
        },
      })}\n`,
      stderr: '',
    });

    const plan = planKanbanMarketingCardDispatch({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      command: 'decompose',
      companyOsRoot,
      commandRunner,
      now: () => new Date('2026-06-13T10:00:00.000Z'),
    });
    expect(plan.ok).toBe(false);
    const handoff = (plan.dispatch_handoff_packet || {}) as Record<string, unknown>;

    const approval = recordKanbanMarketingDispatchApproval({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      review_note: 'Controller sees the handoff and keeps execution blocked.',
      now: () => new Date('2026-06-13T10:05:00.000Z'),
    });
    expect(approval.ok).toBe(true);

    const decision = recordKanbanMarketingDispatchDecision({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      decision: 'approved',
      dispatch_handoff_packet: handoff,
      decision_note: 'Controller approves the handoff as a receipt only; execution stays blocked.',
      now: () => new Date('2026-06-13T10:06:00.000Z'),
    });
    expect(decision.ok).toBe(true);

    const draft = generateKanbanMarketingDraft({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      generation_note: 'Generate the first local marketing loop output.',
      now: () => new Date('2026-06-13T10:07:00.000Z'),
    });
    expect(draft.ok).toBe(true);
    expect(draft.subprocess_spawned).toBe(false);

    return { root, eventLedgerPath, cardId, handoff };
  };

  const lastEventPayload = (root: string, kind: string): Record<string, unknown> => {
    const rows = readRows(
      marketingBoardPath(root),
      `SELECT payload FROM task_events WHERE kind = '${kind}' ORDER BY created_at DESC, id DESC LIMIT 1`
    );
    expect(rows).toHaveLength(1);
    return JSON.parse(String((rows[0] as { payload: string }).payload)) as Record<string, unknown>;
  };

  it('runs the full monotonic ladder to in-process executor promotion with no spawn', () => {
    const { root, eventLedgerPath, cardId, handoff } = driveToGeneratedDraft();

    const output = approveKanbanMarketingOutput({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      approval_note: 'Approve the first local marketing loop output.',
      now: () => new Date('2026-06-13T10:08:00.000Z'),
    });
    expect(output.ok).toBe(true);
    expect(output.status).toBe('ready');
    expect(output.reason_code).toBe('KANBAN_MARKETING_OUTPUT_APPROVED');
    expect(output.subprocess_spawned).toBe(false);
    expect(output.worker_dispatch_status).toBe('prepared');
    expect(output.worker_contract_yaml).toContain('role: role:cmo');
    expect(lastEventPayload(root, 'command_eve_marketing_output_approved').subprocess_spawned).toBe(false);

    const dispatchRequest = requestKanbanMarketingWorkerDispatch({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      request_note: 'Request the manual worker dispatch.',
      now: () => new Date('2026-06-13T10:09:00.000Z'),
    });
    expect(dispatchRequest.ok).toBe(true);
    expect(dispatchRequest.worker_dispatch_request_status).toBe('blocked');
    expect(dispatchRequest.release_blocked).toBe(true);
    expect(dispatchRequest.subprocess_spawned).toBe(false);
    expect(lastEventPayload(root, 'command_eve_marketing_worker_dispatch_requested').subprocess_spawned).toBe(false);

    const observedRun = runKanbanMarketingWorkerObserved({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      observed_note: 'Observe the local worker run.',
      now: () => new Date('2026-06-13T10:10:00.000Z'),
    });
    expect(observedRun.ok).toBe(true);
    expect(observedRun.worker_observed_run_status).toBe('completed');
    expect(observedRun.subprocess_spawned).toBe(false);
    expect(observedRun.external_calls).toBe(false);
    expect(observedRun.release_blocked).toBe(true);
    expect(lastEventPayload(root, 'command_eve_marketing_worker_observed_run_completed').external_calls).toBe(false);

    const startGate = checkKanbanMarketingWorkerStartGate({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      gate_note: 'Check the worker start gate with a valid observed executor profile.',
      executor_enabled: true,
      executor_profile: validExecutorProfile,
      now: () => new Date('2026-06-13T10:11:00.000Z'),
    });
    expect(startGate.ok).toBe(true);
    expect(startGate.worker_start_gate_status).toBe('ready');
    expect(startGate.human_gate).toBe('HG-3');
    expect(startGate.subprocess_spawned).toBe(false);
    expect(startGate.external_calls).toBe(false);
    expect(startGate.release_blocked).toBe(true);
    expect(lastEventPayload(root, 'command_eve_marketing_worker_start_gate_checked').subprocess_spawned).toBe(false);

    const dispatcherPrepare = prepareKanbanMarketingWorkerDispatcher({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      prepare_note: 'Prepare the gated dispatcher.',
      now: () => new Date('2026-06-13T10:12:00.000Z'),
    });
    expect(dispatcherPrepare.ok).toBe(true);
    expect(dispatcherPrepare.worker_dispatcher_prepare_status).toBe('ready');
    expect(dispatcherPrepare.human_gate).toBe('HG-3.5');
    expect(dispatcherPrepare.data_boundary_checked).toBe(true);
    expect(dispatcherPrepare.subprocess_spawned).toBe(false);
    expect(dispatcherPrepare.external_calls).toBe(false);
    expect(dispatcherPrepare.release_blocked).toBe(true);
    expect(lastEventPayload(root, 'command_eve_marketing_worker_dispatcher_prepared').subprocess_spawned).toBe(false);

    const promotion = promoteKanbanMarketingWorkerExecutor({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      promotion_note: 'Promote the in-process local executor after all gates pass.',
      cao_gate_approved: true,
      now: () => new Date('2026-06-13T10:13:00.000Z'),
    });
    expect(promotion.ok).toBe(true);
    expect(promotion.status).toBe('ready');
    expect(promotion.reason_code).toBe('KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTED');
    expect(promotion.worker_executor_promotion_status).toBe('completed');
    expect(promotion.human_gate).toBe('HG-3.5');
    expect(promotion.subprocess_spawned).toBe(false);
    expect(promotion.external_calls).toBe(false);
    expect(promotion.data_boundary_checked).toBe(true);
    expect(promotion.release_blocked).toBe(true);
    expect(promotion.executor_promotion_packet).toMatchObject({
      version: 'command-eve-worker-executor-promotion-packet/v0',
      cao_gate_approved: true,
      subprocess_spawned: false,
      external_calls: false,
      release_blocked: true,
      publish_blocked: true,
      blocked_actions: ['subprocess_spawn', 'external_call', 'publish', 'schedule', 'outreach'],
    });
    expect(promotion.worker_report).toContain('subprocess_spawned: false');
    expect(promotion.worker_report).toContain('external_calls: false');

    // worker.reported executor receipt is persisted with the structural no-spawn invariant.
    const promotionPayload = lastEventPayload(root, 'command_eve_marketing_worker_executor_promoted');
    expect(promotionPayload.subprocess_spawned).toBe(false);
    expect(promotionPayload.external_calls).toBe(false);
    expect(promotionPayload.release_blocked).toBe(true);
    expect(promotionPayload.cao_gate_approved).toBe(true);

    // Every persisted ladder payload carries subprocess_spawned === false.
    for (const kind of [
      'command_eve_marketing_output_approved',
      'command_eve_marketing_worker_dispatch_requested',
      'command_eve_marketing_worker_observed_run_completed',
      'command_eve_marketing_worker_start_gate_checked',
      'command_eve_marketing_worker_dispatcher_prepared',
      'command_eve_marketing_worker_executor_promoted',
    ]) {
      expect(lastEventPayload(root, kind).subprocess_spawned).toBe(false);
    }
  });

  it('hard-fails each ladder stage when the prior persisted receipt is absent (monotonic gate)', () => {
    const { root, eventLedgerPath, cardId, handoff } = driveToGeneratedDraft();

    // dispatch-request before output-approve -> blocked (no output_approved receipt).
    const dispatchBeforeOutput = requestKanbanMarketingWorkerDispatch({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      now: () => new Date('2026-06-13T10:09:00.000Z'),
    });
    expect(dispatchBeforeOutput.ok).toBe(false);
    expect(dispatchBeforeOutput.reason_code).toBe('KANBAN_MARKETING_OUTPUT_APPROVAL_REQUIRED');
    expect(dispatchBeforeOutput.release_blocked).toBe(true);
    expect(dispatchBeforeOutput.subprocess_spawned).toBe(false);

    // observed-run before dispatch-request -> blocked.
    const observedBeforeRequest = runKanbanMarketingWorkerObserved({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      now: () => new Date('2026-06-13T10:10:00.000Z'),
    });
    expect(observedBeforeRequest.ok).toBe(false);
    expect(observedBeforeRequest.reason_code).toBe('KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_REQUIRED');
    expect(observedBeforeRequest.release_blocked).toBe(true);

    // start-gate before observed-run -> blocked.
    const gateBeforeObserved = checkKanbanMarketingWorkerStartGate({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      executor_enabled: true,
      executor_profile: validExecutorProfile,
      now: () => new Date('2026-06-13T10:11:00.000Z'),
    });
    expect(gateBeforeObserved.ok).toBe(false);
    expect(gateBeforeObserved.reason_code).toBe('KANBAN_MARKETING_WORKER_OBSERVED_RUN_REQUIRED');
    expect(gateBeforeObserved.release_blocked).toBe(true);

    // dispatcher-prepare before start-gate -> blocked.
    const prepareBeforeGate = prepareKanbanMarketingWorkerDispatcher({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      now: () => new Date('2026-06-13T10:12:00.000Z'),
    });
    expect(prepareBeforeGate.ok).toBe(false);
    expect(prepareBeforeGate.reason_code).toBe('KANBAN_MARKETING_WORKER_START_GATE_REQUIRED');
    expect(prepareBeforeGate.release_blocked).toBe(true);

    // executor-promotion before dispatcher-prepare (even WITH cao gate) -> blocked.
    const promoteBeforePrepare = promoteKanbanMarketingWorkerExecutor({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      cao_gate_approved: true,
      now: () => new Date('2026-06-13T10:13:00.000Z'),
    });
    expect(promoteBeforePrepare.ok).toBe(false);
    expect(promoteBeforePrepare.reason_code).toBe('KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_REQUIRED');
    expect(promoteBeforePrepare.release_blocked).toBe(true);
    expect(promoteBeforePrepare.subprocess_spawned).toBe(false);

    // No ladder receipt should have been written by any blocked stage.
    for (const kind of [
      'command_eve_marketing_output_approved',
      'command_eve_marketing_worker_dispatch_requested',
      'command_eve_marketing_worker_observed_run_completed',
      'command_eve_marketing_worker_start_gate_checked',
      'command_eve_marketing_worker_dispatcher_prepared',
      'command_eve_marketing_worker_executor_promoted',
    ]) {
      expect(
        readRows(marketingBoardPath(root), `SELECT id FROM task_events WHERE kind = '${kind}'`)
      ).toHaveLength(0);
    }
  });

  it('blocks executor promotion unless cao_gate_approved === true even after all prior gates pass', () => {
    const { root, eventLedgerPath, cardId, handoff } = driveToGeneratedDraft();

    approveKanbanMarketingOutput({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      now: () => new Date('2026-06-13T10:08:00.000Z'),
    });
    requestKanbanMarketingWorkerDispatch({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      now: () => new Date('2026-06-13T10:09:00.000Z'),
    });
    runKanbanMarketingWorkerObserved({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      now: () => new Date('2026-06-13T10:10:00.000Z'),
    });
    checkKanbanMarketingWorkerStartGate({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      executor_enabled: true,
      executor_profile: validExecutorProfile,
      now: () => new Date('2026-06-13T10:11:00.000Z'),
    });
    prepareKanbanMarketingWorkerDispatcher({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      now: () => new Date('2026-06-13T10:12:00.000Z'),
    });

    // cao_gate_approved omitted (undefined) -> must NOT default to true; blocked at the input boundary.
    const promotionNoCao = promoteKanbanMarketingWorkerExecutor({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      now: () => new Date('2026-06-13T10:13:00.000Z'),
    });
    expect(promotionNoCao.ok).toBe(false);
    expect(promotionNoCao.reason_code).toBe('KANBAN_MARKETING_EXECUTOR_PROMOTION_CAO_GATE_REQUIRED');
    expect(promotionNoCao.release_blocked).toBe(true);
    expect(promotionNoCao.subprocess_spawned).toBe(false);
    expect(
      readRows(marketingBoardPath(root), "SELECT id FROM task_events WHERE kind = 'command_eve_marketing_worker_executor_promoted'")
    ).toHaveLength(0);

    // cao_gate_approved explicitly false -> still blocked.
    const promotionFalseCao = promoteKanbanMarketingWorkerExecutor({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      cao_gate_approved: false,
      now: () => new Date('2026-06-13T10:13:30.000Z'),
    });
    expect(promotionFalseCao.ok).toBe(false);
    expect(promotionFalseCao.reason_code).toBe('KANBAN_MARKETING_EXECUTOR_PROMOTION_CAO_GATE_REQUIRED');

    // cao_gate_approved === true -> finally promotes.
    const promotionOk = promoteKanbanMarketingWorkerExecutor({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      cao_gate_approved: true,
      now: () => new Date('2026-06-13T10:14:00.000Z'),
    });
    expect(promotionOk.ok).toBe(true);
    expect(promotionOk.worker_executor_promotion_status).toBe('completed');
    expect(promotionOk.subprocess_spawned).toBe(false);
    expect(promotionOk.release_blocked).toBe(true);
  });

  it('keeps the worker start gate blocked when no runtime executor profile is configured', () => {
    const { root, eventLedgerPath, cardId, handoff } = driveToGeneratedDraft();

    approveKanbanMarketingOutput({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      now: () => new Date('2026-06-13T10:08:00.000Z'),
    });
    requestKanbanMarketingWorkerDispatch({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      dispatch_handoff_packet: handoff,
      now: () => new Date('2026-06-13T10:09:00.000Z'),
    });
    runKanbanMarketingWorkerObserved({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      now: () => new Date('2026-06-13T10:10:00.000Z'),
    });

    // executor_enabled omitted -> gate is recorded but BLOCKED, and a later dispatcher-prepare fails.
    const startGate = checkKanbanMarketingWorkerStartGate({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      now: () => new Date('2026-06-13T10:11:00.000Z'),
    });
    expect(startGate.ok).toBe(true);
    expect(startGate.worker_start_gate_status).toBe('blocked');
    expect(startGate.release_blocked).toBe(true);
    expect(startGate.subprocess_spawned).toBe(false);
    expect(startGate.worker_start_gate_reason_codes).toContain('runtime_executor_not_configured');

    const prepare = prepareKanbanMarketingWorkerDispatcher({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: cardId,
      now: () => new Date('2026-06-13T10:12:00.000Z'),
    });
    expect(prepare.ok).toBe(false);
    expect(prepare.reason_code).toBe('KANBAN_MARKETING_WORKER_START_GATE_NOT_READY');
    expect(prepare.release_blocked).toBe(true);
  });

  it('blocks the entire ladder fail-closed when Kanban governance is not locked', () => {
    const root = makeRoot();
    writeLockedReconciliation(root, { kanban_dispatch_in_gateway: true });
    const eventLedgerPath = path.join(root, 'agent-events.jsonl');
    createNativeKanbanDb(marketingBoardPath(root));

    const promotion = promoteKanbanMarketingWorkerExecutor({
      userDataPath: root,
      boardSlug: 'marketing',
      eventLedgerPath,
      task_id: 'governance-not-locked',
      cao_gate_approved: true,
      now: () => new Date('2026-06-13T10:13:00.000Z'),
    });
    expect(promotion.ok).toBe(false);
    expect(promotion.reason_code).toBe('KANBAN_GOVERNANCE_NOT_LOCKED');
    expect(promotion.subprocess_spawned).toBe(false);
    expect(promotion.release_blocked).toBe(true);
    expect(
      readRows(marketingBoardPath(root), "SELECT id FROM task_events WHERE kind = 'command_eve_marketing_worker_executor_promoted'")
    ).toHaveLength(0);
  });
});
