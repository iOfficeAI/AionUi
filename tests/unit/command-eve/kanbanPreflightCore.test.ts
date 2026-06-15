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
  buildKanbanMarketingBoard,
  createKanbanMarketingCard,
  createKanbanMarketingProofCard,
  moveKanbanMarketingCard,
  planKanbanMarketingCardDispatch,
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
