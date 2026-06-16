/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { detectCommandEveSensitiveEgress } from '../../common/api/egressBoundaryCore';
import { resolveCommandEveRuntimeBootstrapPaths } from './runtimeBootstrapCore';

export const COMMAND_EVE_KANBAN_PREFLIGHT_BRIDGE_VERSION = 'command-eve-kanban-preflight/v0';
export const COMMAND_EVE_KANBAN_MARKETING_BOARD_BRIDGE_VERSION = 'command-eve-kanban-marketing-board/v0';
export const COMMAND_EVE_KANBAN_MARKETING_PROOF_CARD_BRIDGE_VERSION = 'command-eve-kanban-marketing-proof-card/v0';
export const COMMAND_EVE_KANBAN_MARKETING_CARD_CREATE_BRIDGE_VERSION = 'command-eve-kanban-marketing-card-create/v0';
export const COMMAND_EVE_KANBAN_MARKETING_CARD_MOVE_BRIDGE_VERSION = 'command-eve-kanban-marketing-card-move/v0';
export const COMMAND_EVE_KANBAN_MARKETING_CARD_ACTION_BRIDGE_VERSION = 'command-eve-kanban-marketing-card-action/v0';
export const COMMAND_EVE_KANBAN_MARKETING_DISPATCH_PLAN_BRIDGE_VERSION =
  'command-eve-kanban-marketing-dispatch-plan/v0';
export const COMMAND_EVE_KANBAN_MARKETING_DISPATCH_APPROVAL_BRIDGE_VERSION =
  'command-eve-kanban-marketing-dispatch-approval/v0';
export const COMMAND_EVE_KANBAN_MARKETING_DISPATCH_DECISION_BRIDGE_VERSION =
  'command-eve-kanban-marketing-dispatch-decision/v0';
export const COMMAND_EVE_KANBAN_MARKETING_DRAFT_GENERATE_BRIDGE_VERSION =
  'command-eve-kanban-marketing-draft-generate/v0';

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
export type CommandEveKanbanMarketingCardAction = 'comment' | 'block' | 'unblock' | 'complete';

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
  controller_review_status: 'pending' | null;
  controller_review_audit_event_id: string | null;
  controller_review_handoff_role: string | null;
  controller_review_handoff_dispatch: string | null;
  controller_decision_status: CommandEveKanbanMarketingDispatchDecision | null;
  controller_decision_audit_event_id: string | null;
  controller_decision_handoff_role: string | null;
  controller_decision_handoff_dispatch: string | null;
  generated_draft_status: 'generated' | null;
  generated_draft_audit_event_id: string | null;
  generated_draft_source: string | null;
  generated_draft_text: string | null;
  generated_draft_at: number | null;
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
    controller_review_pending_cards: number;
    controller_decision_recorded_cards: number;
    controller_decision_approved_cards: number;
    controller_decision_rejected_cards: number;
    generated_draft_cards: number;
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

export type CommandEveKanbanMarketingCardActionResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_CARD_ACTION_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  message?: string;
  card_id?: string;
  action?: CommandEveKanbanMarketingCardAction;
  action_applied?: boolean;
  from_status?: string;
  to_status?: string;
  from_lane_key?: CommandEveKanbanMarketingLaneKey;
  to_lane_key?: CommandEveKanbanMarketingLaneKey;
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
  dispatch_handoff_packet?: JsonRecord;
  dispatch_source?: string;
  dispatch_source_reason?: string;
  policy?: JsonRecord;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
    company_os_root?: string;
  };
};

export type CommandEveKanbanMarketingDispatchApprovalResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_DISPATCH_APPROVAL_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  approval_event_kind?: 'command_eve_controller_approval_pending';
  controller_approval_status?: 'pending';
  subprocess_spawned: false;
  release_blocked: true;
  human_gate: 'HG-2.5';
  dispatch_handoff_packet?: JsonRecord;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingDispatchDecision = 'approved' | 'rejected';

export type CommandEveKanbanMarketingDispatchDecisionResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_DISPATCH_DECISION_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  decision_event_kind?: 'command_eve_controller_decision_recorded';
  controller_approval_status?: CommandEveKanbanMarketingDispatchDecision;
  controller_approved: boolean;
  subprocess_spawned: false;
  release_blocked: true;
  human_gate: 'HG-2.5';
  dispatch_handoff_packet?: JsonRecord;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingDraftGenerateResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_DRAFT_GENERATE_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  reason_codes: string[];
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  draft_event_kind?: 'command_eve_marketing_draft_generated';
  draft_text?: string;
  draft_source?: string;
  subprocess_spawned: false;
  data_boundary_checked: boolean;
  controller_approval_status?: CommandEveKanbanMarketingDispatchDecision;
  controller_approved: boolean;
  release_blocked: boolean;
  human_gate: 'HG-2.5';
  dispatch_handoff_packet?: JsonRecord;
  policy?: JsonRecord;
  model?: CommandEveKanbanMarketingBoardModel;
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

export type CommandEveKanbanMarketingCardActionOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  action: CommandEveKanbanMarketingCardAction;
  comment?: string;
};

export type CommandEveKanbanMarketingDispatchPlanOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  command?: 'decompose' | 'specify';
  companyOsRoot?: string;
  commandRunner?: CommandEveKanbanPreflightCommandRunner;
};

export type CommandEveKanbanMarketingDispatchApprovalOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  dispatch_handoff_packet?: JsonRecord;
  review_note?: string;
};

export type CommandEveKanbanMarketingDispatchDecisionOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  decision: CommandEveKanbanMarketingDispatchDecision;
  dispatch_handoff_packet?: JsonRecord;
  decision_note?: string;
};

export type CommandEveKanbanMarketingDraftGenerateOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  dispatch_handoff_packet?: JsonRecord;
  generation_note?: string;
  companyOsRoot?: string;
  commandRunner?: CommandEveKanbanPreflightCommandRunner;
  /**
   * When 'embedded', forces the external Company.OS NL-5 dispatch CLI OFF and uses the
   * in-process embedded Hermes pre-generation gate even if the external CLI exists on disk.
   * This is the structural no-external-spawn default for the local-first marketing loop.
   */
  dispatchMode?: 'embedded' | 'cli';
};

type JsonRecord = Record<string, unknown>;

type EmbeddedHermesPreGenerationPolicy = JsonRecord & {
  allowed: boolean;
  status: 'pass' | 'blocked';
  reason_codes: string[];
  data_boundary_receipt: JsonRecord;
};

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
      controller_review_pending_cards: 0,
      controller_decision_recorded_cards: 0,
      controller_decision_approved_cards: 0,
      controller_decision_rejected_cards: 0,
      generated_draft_cards: 0,
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
    const controllerReviewStatus = textField(item.controller_review_status) === 'pending' ? ('pending' as const) : null;
    const rawControllerDecision = textField(item.controller_decision_status);
    const controllerDecisionStatus =
      rawControllerDecision === 'approved' || rawControllerDecision === 'rejected' ? rawControllerDecision : null;
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
      controller_review_status: controllerReviewStatus,
      controller_review_audit_event_id: nullableTextField(item.controller_review_audit_event_id),
      controller_review_handoff_role: nullableTextField(item.controller_review_handoff_role),
      controller_review_handoff_dispatch: nullableTextField(item.controller_review_handoff_dispatch),
      controller_decision_status: controllerDecisionStatus,
      controller_decision_audit_event_id: nullableTextField(item.controller_decision_audit_event_id),
      controller_decision_handoff_role: nullableTextField(item.controller_decision_handoff_role),
      controller_decision_handoff_dispatch: nullableTextField(item.controller_decision_handoff_dispatch),
      generated_draft_status: textField(item.generated_draft_status) === 'generated' ? ('generated' as const) : null,
      generated_draft_audit_event_id: nullableTextField(item.generated_draft_audit_event_id),
      generated_draft_source: nullableTextField(item.generated_draft_source),
      generated_draft_text: nullableTextField(item.generated_draft_text),
      generated_draft_at: typeof item.generated_draft_at === 'number' ? item.generated_draft_at : null,
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
      controller_review_pending_cards: cards.filter((card) => card.controller_review_status === 'pending').length,
      controller_decision_recorded_cards: cards.filter((card) => card.controller_decision_status).length,
      controller_decision_approved_cards: cards.filter((card) => card.controller_decision_status === 'approved').length,
      controller_decision_rejected_cards: cards.filter((card) => card.controller_decision_status === 'rejected').length,
      generated_draft_cards: cards.filter((card) => card.generated_draft_status === 'generated').length,
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
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.controller_approval_status')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_controller_approval_pending'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS controller_review_status,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.audit_event_id')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_controller_approval_pending'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS controller_review_audit_event_id,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.dispatch_handoff_packet.role_label')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_controller_approval_pending'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS controller_review_handoff_role,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.dispatch_handoff_packet.dispatch')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_controller_approval_pending'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS controller_review_handoff_dispatch,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.controller_approval_status')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_controller_decision_recorded'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS controller_decision_status,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.audit_event_id')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_controller_decision_recorded'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS controller_decision_audit_event_id,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.dispatch_handoff_packet.role_label')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_controller_decision_recorded'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS controller_decision_handoff_role,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.dispatch_handoff_packet.dispatch')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_controller_decision_recorded'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS controller_decision_handoff_dispatch,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.draft_status')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_marketing_draft_generated'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS generated_draft_status,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.audit_event_id')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_marketing_draft_generated'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS generated_draft_audit_event_id,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.draft_source')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_marketing_draft_generated'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS generated_draft_source,
          COALESCE(
            (
              SELECT json_extract(e.payload, '$.draft_text')
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_marketing_draft_generated'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            ''
          ) AS generated_draft_text,
          COALESCE(
            (
              SELECT e.created_at
              FROM task_events e
              WHERE e.task_id = t.id
                AND e.kind = 'command_eve_marketing_draft_generated'
                AND json_valid(e.payload)
              ORDER BY e.created_at DESC, e.id DESC
              LIMIT 1
            ),
            0
          ) AS generated_draft_at,
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

function buildMarketingCardActionScript(): string {
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

    from_status = row[0] or ""
    from_step = row[1] or ""
    action = request["action"]
    to_status = from_status
    to_step = from_step
    completed_at = None

    if action == "comment":
        conn.execute(
            "INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)",
            (request["card_id"], "eve", request["comment"], int(request["action_at"])),
        )
    elif action == "block":
        to_status = "blocked"
        to_step = "review"
        conn.execute(
            "UPDATE tasks SET status = ?, current_step_key = ? WHERE id = ?",
            (to_status, to_step, request["card_id"]),
        )
    elif action == "unblock":
        to_status = "review"
        to_step = "review"
        conn.execute(
            "UPDATE tasks SET status = ?, current_step_key = ? WHERE id = ?",
            (to_status, to_step, request["card_id"]),
        )
    elif action == "complete":
        to_status = "completed"
        to_step = "readyToApprove"
        completed_at = int(request["action_at"])
        conn.execute(
            "UPDATE tasks SET status = ?, current_step_key = ?, completed_at = ? WHERE id = ?",
            (to_status, to_step, completed_at, request["card_id"]),
        )
    else:
        print(json.dumps({"found": True, "applied": False, "invalid_action": True}))
        sys.exit(0)

    event_payload = {
        "audit_event_id": request["audit_event_id"],
        "action": action,
        "from_status": from_status,
        "to_status": to_status,
        "from_step": from_step,
        "to_step": to_step,
        "human_gate": "HG-2.5",
        "dispatcher_enabled": False,
        "auto_decompose_enabled": False,
        "subprocess_spawned": False,
        "external_calls": False,
    }
    if action == "comment":
        event_payload["comment_length"] = len(request["comment"])
    if completed_at is not None:
        event_payload["completed_at"] = completed_at

    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          request["event_kind"],
          json.dumps(event_payload),
          int(request["action_at"]),
        ),
    )
    conn.commit()
    print(json.dumps({
        "found": True,
        "applied": True,
        "from_status": from_status,
        "to_status": to_status,
        "from_step": from_step,
        "to_step": to_step,
    }))
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
            "dispatch_source": request.get("dispatch_source"),
            "dispatch_source_reason": request.get("dispatch_source_reason"),
            "reason_codes": request.get("reason_codes") or [],
            "dispatch_handoff_packet": request.get("dispatch_handoff_packet") or {},
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

function buildMarketingDispatchApprovalScript(): string {
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

    review_note = request.get("review_note") or ""
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_controller_approval_pending",
          json.dumps({
            "audit_event_id": request["audit_event_id"],
            "human_gate": "HG-2.5",
            "controller_approval_status": "pending",
            "controller_approved": False,
            "release_blocked": True,
            "dispatcher_enabled": False,
            "auto_decompose_enabled": False,
            "subprocess_spawned": False,
            "dispatch_handoff_packet": request.get("dispatch_handoff_packet") or {},
            "review_note_length": len(review_note),
            "reason_codes": ["command_eve.controller_approval_pending"],
          }),
          int(request["recorded_at"]),
        ),
    )
    conn.commit()
    print(json.dumps({"found": True, "task": dict(row)}))
finally:
    conn.close()
`;
}

function buildMarketingDispatchDecisionScript(): string {
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

    decision = request.get("decision")
    decision_note = request.get("decision_note") or ""
    reason_code = (
        "command_eve.controller_approval_recorded_no_spawn"
        if decision == "approved"
        else "command_eve.controller_rejection_recorded"
    )
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_controller_decision_recorded",
          json.dumps({
            "audit_event_id": request["audit_event_id"],
            "human_gate": "HG-2.5",
            "controller_approval_status": decision,
            "controller_approved": decision == "approved",
            "release_blocked": True,
            "dispatcher_enabled": False,
            "auto_decompose_enabled": False,
            "subprocess_spawned": False,
            "dispatch_handoff_packet": request.get("dispatch_handoff_packet") or {},
            "decision_note_length": len(decision_note),
            "reason_codes": [reason_code],
          }),
          int(request["recorded_at"]),
        ),
    )
    conn.commit()
    print(json.dumps({"found": True, "task": dict(row)}))
finally:
    conn.close()
`;
}

function buildMarketingDraftGenerateScript(): string {
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
    conn.execute("PRAGMA journal_mode=WAL")
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

    decision_row = conn.execute(
        """
        SELECT payload
        FROM task_events
        WHERE task_id = ?
          AND kind = 'command_eve_controller_decision_recorded'
          AND json_valid(payload)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if decision_row is None:
        conn.commit()
        print(json.dumps({"found": True, "approved": False, "approval_status": ""}))
        sys.exit(0)

    try:
        decision_payload = json.loads(decision_row["payload"] or "{}")
    except Exception:
        decision_payload = {}
    approval_status = decision_payload.get("controller_approval_status") or ""
    controller_approved = bool(decision_payload.get("controller_approved")) and approval_status == "approved"
    if not controller_approved:
        conn.commit()
        print(json.dumps({"found": True, "approved": False, "approval_status": approval_status}))
        sys.exit(0)

    generated_at = int(request["generated_at"])
    dispatch_handoff_packet = request.get("dispatch_handoff_packet") or decision_payload.get("dispatch_handoff_packet") or {}
    event_payload = {
        "audit_event_id": request["audit_event_id"],
        "human_gate": "HG-2.5",
        "controller_approval_status": "approved",
        "controller_approved": True,
        "release_blocked": False,
        "dispatcher_enabled": False,
        "auto_decompose_enabled": False,
        "subprocess_spawned": False,
        "external_calls": False,
        "nl5_gate_checked": bool(request.get("data_boundary_checked")),
        "data_boundary_receipt": request.get("data_boundary_receipt") or {},
        "dispatch_status": request.get("dispatch_status") or "ready",
        "dispatch_source": request.get("dispatch_source") or "",
        "dispatch_source_reason": request.get("dispatch_source_reason") or "",
        "reason_codes": ["command_eve.marketing_draft_generated_local"],
        "dispatch_handoff_packet": dispatch_handoff_packet,
        "draft_status": "generated",
        "draft_source": request["draft_source"],
        "draft_text": request["draft_text"],
        "generation_note_length": len(request.get("generation_note") or ""),
    }
    conn.execute(
        "UPDATE tasks SET status = ?, current_step_key = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
        ("review", "review", generated_at, request["card_id"]),
    )
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_marketing_draft_generated",
          json.dumps(event_payload),
          generated_at,
        ),
    )
    conn.execute(
        "INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)",
        (
          request["card_id"],
          "eve",
          request["draft_text"],
          generated_at,
        ),
    )
    conn.commit()
    print(json.dumps({
        "found": True,
        "approved": True,
        "approval_status": "approved",
        "task": dict(row),
        "draft_status": "generated",
        "dispatch_handoff_packet": dispatch_handoff_packet,
    }))
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
  eventType:
    | 'kanban.marketing_board_card_created'
    | 'kanban.marketing_board_card_moved'
    | 'kanban.marketing_board_card_commented'
    | 'kanban.marketing_board_card_blocked'
    | 'kanban.marketing_board_card_unblocked'
    | 'kanban.marketing_board_card_completed';
  mode:
    | 'kanban-card-create'
    | 'kanban-card-move'
    | 'kanban-card-comment'
    | 'kanban-card-block'
    | 'kanban-card-unblock'
    | 'kanban-card-complete';
  action: 'card_create' | 'card_move' | 'card_comment' | 'card_block' | 'card_unblock' | 'card_complete';
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
  const handoffPacket = isRecord(dispatchPlan.dispatch_handoff_packet) ? dispatchPlan.dispatch_handoff_packet : {};
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
      dispatch_source: textField(dispatchPlan.dispatch_source),
      dispatch_source_reason: textField(dispatchPlan.dispatch_source_reason),
      subprocess_spawned: subprocessSpawned,
      reason_codes: Array.isArray(dispatchPlan.reason_codes) ? dispatchPlan.reason_codes : [],
      data_boundary_receipt: isRecord(policy.data_boundary_receipt) ? policy.data_boundary_receipt : {},
      dispatch_handoff_packet: handoffPacket,
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

function appendMarketingDispatchApprovalAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  dispatchHandoffPacket,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  dispatchHandoffPacket: JsonRecord;
}): string {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_controller_approval_pending',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-controller-approval-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-controller-approval',
    role_owner: 'Controller',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-2.5',
      controller_approval_status: 'pending',
      controller_approved: false,
      release_blocked: true,
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      subprocess_spawned: false,
      action: 'controller_approval_pending',
      reason_codes: ['command_eve.controller_approval_pending'],
      dispatch_handoff_packet: dispatchHandoffPacket,
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

function appendMarketingDispatchDecisionAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  decision,
  dispatchHandoffPacket,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  decision: CommandEveKanbanMarketingDispatchDecision;
  dispatchHandoffPacket: JsonRecord;
}): string {
  const controllerApproved = decision === 'approved';
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_controller_decision_recorded',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-controller-decision-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-controller-decision',
    role_owner: 'Controller',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-2.5',
      controller_approval_status: decision,
      controller_approved: controllerApproved,
      release_blocked: true,
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      subprocess_spawned: false,
      action: 'controller_decision_recorded',
      reason_codes: [
        controllerApproved
          ? 'command_eve.controller_approval_recorded_no_spawn'
          : 'command_eve.controller_rejection_recorded',
      ],
      dispatch_handoff_packet: dispatchHandoffPacket,
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

function appendMarketingDraftGeneratedAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  dispatchHandoffPacket,
  draftSource,
  draftText,
  dispatchSource,
  dispatchSourceReason,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  dispatchHandoffPacket: JsonRecord;
  draftSource: string;
  draftText: string;
  dispatchSource: string;
  dispatchSourceReason: string;
}): string {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_marketing_draft_generated',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-marketing-draft-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-marketing-draft-generate',
    role_owner: 'CMO',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-2.5',
      controller_approval_status: 'approved',
      controller_approved: true,
      release_blocked: false,
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      subprocess_spawned: false,
      external_calls: false,
      action: 'marketing_draft_generated',
      reason_codes: ['command_eve.marketing_draft_generated_local'],
      dispatch_handoff_packet: dispatchHandoffPacket,
      draft_status: 'generated',
      draft_source: draftSource,
      draft_preview: draftText.slice(0, 600),
      draft_length: draftText.length,
      dispatch_source: dispatchSource,
      dispatch_source_reason: dispatchSourceReason,
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

function marketingCardActionAuditEventId(
  cardId: string,
  action: CommandEveKanbanMarketingCardAction,
  occurredAt: string
): string {
  return [
    `command-eve-kanban-marketing-card-${action}`,
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingCardDispatchAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-dispatch-plan',
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingCardDispatchApprovalAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-controller-approval-pending',
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingCardDispatchDecisionAuditEventId(
  cardId: string,
  decision: CommandEveKanbanMarketingDispatchDecision,
  occurredAt: string
): string {
  return [
    `command-eve-kanban-marketing-controller-${decision}`,
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingCardDraftGenerateAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-draft-generated',
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

function marketingCardActionResultBase(
  hermesHome: string
): Pick<CommandEveKanbanMarketingCardActionResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_CARD_ACTION_BRIDGE_VERSION,
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

function marketingDispatchApprovalResultBase(
  hermesHome: string
): Pick<
  CommandEveKanbanMarketingDispatchApprovalResult,
  'version' | 'source' | 'subprocess_spawned' | 'release_blocked' | 'human_gate'
> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_DISPATCH_APPROVAL_BRIDGE_VERSION,
    subprocess_spawned: false,
    release_blocked: true,
    human_gate: 'HG-2.5',
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingDispatchDecisionResultBase(
  hermesHome: string
): Pick<
  CommandEveKanbanMarketingDispatchDecisionResult,
  'version' | 'source' | 'subprocess_spawned' | 'release_blocked' | 'human_gate' | 'controller_approved'
> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_DISPATCH_DECISION_BRIDGE_VERSION,
    subprocess_spawned: false,
    release_blocked: true,
    human_gate: 'HG-2.5',
    controller_approved: false,
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingDraftGenerateResultBase(
  hermesHome: string,
  companyOsRoot?: string
): Pick<
  CommandEveKanbanMarketingDraftGenerateResult,
  | 'version'
  | 'source'
  | 'reason_codes'
  | 'subprocess_spawned'
  | 'data_boundary_checked'
  | 'controller_approved'
  | 'release_blocked'
  | 'human_gate'
> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_DRAFT_GENERATE_BRIDGE_VERSION,
    reason_codes: [],
    subprocess_spawned: false,
    data_boundary_checked: false,
    controller_approved: false,
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

function resolveCompanyOsRootForDispatch(
  options: Pick<CommandEveKanbanMarketingDispatchPlanOptions, 'companyOsRoot' | 'env'>
): string | undefined {
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
  companyOsRoot?: string;
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
    sourceRoot: companyOsRoot || 'command-eve-local',
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

function buildLocalMarketingDraftText({
  task,
  cardId,
  handoff,
}: {
  task: JsonRecord;
  cardId: string;
  handoff: JsonRecord;
}): string {
  const title = textField(task.title) || `Marketing card ${cardId}`;
  const body = textField(task.body);
  const role = textField(handoff.role_label) || 'role:cmo';
  const angle = body || `Turn "${title}" into a concise founder-led marketing post.`;
  return [
    `# ${title}`,
    '',
    `Generated by Command EVE after NL-5 data-boundary check and HG-2.5 controller approval.`,
    '',
    `Intent`,
    angle,
    '',
    `Hook`,
    `Most teams do not need another isolated AI chat. They need a governed loop that turns intent into reviewed work.`,
    '',
    `Draft`,
    `Command EVE gives founders and agencies a local-first operating layer: capture the goal, route it through explicit gates, create the working draft, and keep the human approval point visible before anything ships.`,
    '',
    `Why it matters`,
    `The system is not just a prompt box. It records the data-boundary receipt, the controller decision, and the generated artifact in the local ledger so the team can review what happened instead of guessing.`,
    '',
    `CTA`,
    `Start with one governed marketing loop: goal in, draft out, approval recorded.`,
    '',
    `Review note`,
    `Source card: ${cardId}. Role: ${role}. Local draft generation only; no external call or worker subprocess was spawned.`,
  ].join('\n');
}

function buildMarketingDispatchHandoffPacket({
  request,
  dispatchPlan,
  policy,
  cardId,
  command,
  companyOsRoot,
  occurredAt,
}: {
  request: JsonRecord;
  dispatchPlan: JsonRecord;
  policy: JsonRecord;
  cardId: string;
  command: 'decompose' | 'specify';
  companyOsRoot?: string;
  occurredAt: string;
}): JsonRecord {
  const workerContract = isRecord(request.workerContract || request.worker_contract || request.contract)
    ? ((request.workerContract || request.worker_contract || request.contract) as JsonRecord)
    : {};
  const fields = isRecord(request.fields) ? (request.fields as JsonRecord) : {};
  const title = textField(fields.title) || `Command EVE marketing card ${cardId}`;

  return {
    version: 'command-eve-local-dispatch-handoff/v0',
    status: 'dispatch_ready_waiting_for_controller',
    dispatch: 'manual',
    target_runtime: 'hermes-kanban',
    proposed_command: `hermes kanban ${command}`,
    card_id: cardId,
    tenant: textField(request.tenant) || MARKETING_BOARD_TENANT,
    role_label: `role:${textField(workerContract.role) || 'cmo'}`,
    agent: textField(workerContract.agent) || 'hermes',
    mode: textField(workerContract.mode) || `kanban-${command}`,
    workspace: companyOsRoot || textField(workerContract.workspace) || 'command-eve-local',
    source_of_truth: textField(workerContract.source_of_truth) || `Hermes kanban task ${cardId}`,
    title,
    acceptance_criteria: textField(workerContract.acceptance_criteria),
    gates: [
      'NL-5 data boundary',
      'route receipt',
      'auxiliary receipt',
      'HG-2.5 controller approval',
      'author-critic separation',
      'no subprocess spawn before controller approval',
    ],
    human_gate: 'HG-2.5',
    controller_approval: {
      required: true,
      status: 'missing',
      reason: 'Local Command EVE UI can prepare the handoff, but controller approval is required before spawn.',
    },
    safety: {
      nl5_gate_checked: isRecord(policy.data_boundary_receipt),
      subprocess_spawned: dispatchPlan.subprocess_spawned === true,
      provider_execution_allowed: false,
      release_blocked: dispatchPlan.subprocess_spawned !== true,
      dispatch_source: textField(dispatchPlan.dispatch_source),
      dispatch_source_reason: textField(dispatchPlan.dispatch_source_reason),
      reason_codes: Array.isArray(dispatchPlan.reason_codes) ? dispatchPlan.reason_codes : [],
    },
    reporting: [
      'task_events.command_eve_dispatch_plan_checked',
      'agent-events.kanban.marketing_board_dispatch_plan_checked',
    ],
    created_at: occurredAt,
  };
}

function receiptOk(receipt: JsonRecord): boolean {
  const status = textField(receipt.status).toLowerCase();
  return (
    receipt.ok === true ||
    receipt.allowed === true ||
    ['pass', 'passed', 'redacted-pass', 'rerouted-pass', 'local-only-pass'].includes(status)
  );
}

function receiptFailed(receipt: JsonRecord): boolean {
  const status = textField(receipt.status).toLowerCase();
  return (
    receipt.ok === false ||
    receipt.allowed === false ||
    ['fail', 'failed', 'block', 'blocked', 'reject', 'rejected'].includes(status)
  );
}

function parseableWorkerContract(contract: JsonRecord): boolean {
  if (contract.parseable === true || contract.valid === true || contract.status === 'pass') return true;
  return [
    'role',
    'agent',
    'mode',
    'workspace',
    'dispatch',
    'source_of_truth',
    'acceptance_criteria',
    'gates',
    'human_gate',
    'reporting',
  ].every((key) => textField(contract[key]).length > 0);
}

function controllerApproved(approval: unknown): boolean {
  if (approval === true) return true;
  if (!isRecord(approval)) return false;
  const status = textField(approval.status || approval.verdict || approval.decision).toLowerCase();
  return ['approved', 'pass', 'controller_pass', 'hg-2.5-pass', 'accepted'].includes(status);
}

function authorsSeparate(request: JsonRecord, workerContract: JsonRecord): boolean {
  const author = textField(request.author || workerContract.author).toLowerCase();
  const critic = textField(request.critic || workerContract.critic).toLowerCase();
  return Boolean(author && critic && author !== critic);
}

function normalizeDispatchCommand(command: unknown): string {
  const parts = textField(command).toLowerCase().split(/\s+/).filter(Boolean);
  if (parts[0] === 'hermes') parts.shift();
  if (parts[0] === 'kanban') parts.shift();
  return parts[0] || '';
}

function embeddedDataBoundaryReceipt(request: JsonRecord): JsonRecord {
  const payload = [
    typeof request.payload === 'string' ? request.payload : '',
    isRecord(request.fields) ? JSON.stringify(request.fields) : '',
  ]
    .filter(Boolean)
    .join('\n');
  const findings = detectCommandEveSensitiveEgress(payload);
  const findingCount = findings.reduce((sum, finding) => sum + finding.count, 0);
  const requestedLane = textField(request.requestedLane || request.requested_lane || request.lane || 'local_only');
  const localOnly = ['local_only', 'local', 'lane_local_only'].includes(requestedLane.toLowerCase());
  const sensitivityScore = findingCount > 0 ? 2 : 1;
  const ok = localOnly || findingCount === 0;

  return {
    ok,
    status: ok ? (localOnly ? 'local-only-pass' : 'pass') : 'blocked',
    sensitivity: `S${sensitivityScore}`,
    sensitivity_score: sensitivityScore,
    effective_sensitivity: `S${sensitivityScore}`,
    effective_sensitivity_score: sensitivityScore,
    requested_lane: requestedLane,
    effective_lane: localOnly ? 'local_only' : requestedLane,
    finding_count: findingCount,
    findings: findings.map((finding) => ({
      kind: finding.kind,
      rule_id: finding.rule_id,
      count: finding.count,
    })),
    raw_text_stored: false,
    provider_execution_allowed: false,
    reason_codes: ok
      ? ['command_eve.embedded_nl5_data_boundary_pass']
      : ['command_eve.embedded_nl5_data_boundary_blocked'],
  };
}

function buildEmbeddedHermesPreGenerationPolicy(request: JsonRecord): EmbeddedHermesPreGenerationPolicy {
  const command = normalizeDispatchCommand(request.command || request.proposedCommand);
  const routeReceipt = isRecord(request.routeReceipt || request.route_receipt)
    ? ((request.routeReceipt || request.route_receipt) as JsonRecord)
    : {};
  const auxiliaryReceipt = isRecord(request.auxiliaryLaneReceipt || request.auxiliary_lane_receipt)
    ? ((request.auxiliaryLaneReceipt || request.auxiliary_lane_receipt) as JsonRecord)
    : {};
  const workerContract = isRecord(request.workerContract || request.worker_contract || request.contract)
    ? ((request.workerContract || request.worker_contract || request.contract) as JsonRecord)
    : {};
  const dataBoundaryReceipt = embeddedDataBoundaryReceipt(request);
  const failures: string[] = [];

  if (!['specify', 'decompose'].includes(command)) failures.push('hermes.pre_generation.unsupported_command');
  if (!dataBoundaryReceipt.ok) failures.push('hermes.pre_generation.data_boundary_failed');
  if (!Object.keys(routeReceipt).length) failures.push('hermes.pre_generation.route_receipt_missing');
  else if (receiptFailed(routeReceipt) || !receiptOk(routeReceipt))
    failures.push('hermes.pre_generation.route_receipt_failed');
  if (!Object.keys(auxiliaryReceipt).length) failures.push('hermes.pre_generation.auxiliary_receipt_missing');
  else if (receiptFailed(auxiliaryReceipt) || !receiptOk(auxiliaryReceipt)) {
    failures.push('hermes.pre_generation.auxiliary_receipt_failed');
  }
  if (!parseableWorkerContract(workerContract)) failures.push('hermes.pre_generation.worker_contract_unparseable');
  if (!textField(request.humanGate || request.human_gate || workerContract.human_gate)) {
    failures.push('hermes.pre_generation.human_gate_missing');
  }
  if (!controllerApproved(request.controllerApproval ?? request.controller_approval)) {
    failures.push('hermes.pre_generation.controller_approval_missing');
  }
  if (!authorsSeparate(request, workerContract)) failures.push('hermes.pre_generation.author_critic_not_separate');

  const reasonCodes = [...new Set(failures)];
  return {
    version: 'hermes-pre-generation-policy/v0',
    id: 'hermes.pre_generation_policy',
    implementation: 'command-eve-embedded-nl5',
    command,
    applies: ['specify', 'decompose'].includes(command),
    allowed: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? 'pass' : 'blocked',
    data_boundary_receipt: dataBoundaryReceipt,
    route_receipt: routeReceipt,
    auxiliary_lane_receipt: auxiliaryReceipt,
    worker_contract_parseable: parseableWorkerContract(workerContract),
    human_gate: textField(request.humanGate || request.human_gate || workerContract.human_gate),
    controller_approved: controllerApproved(request.controllerApproval ?? request.controller_approval),
    author_critic_separate: authorsSeparate(request, workerContract),
    reason_codes: reasonCodes,
  };
}

function buildEmbeddedHermesPreGenerationDispatchPlan({
  request,
  reason,
}: {
  request: JsonRecord;
  reason: string;
}): JsonRecord {
  const policy = buildEmbeddedHermesPreGenerationPolicy(request);
  return {
    version: 'hermes-pre-generation-dispatch/v0',
    ok: false,
    status: 'blocked',
    subprocess_spawned: false,
    reason_codes: policy.reason_codes.length
      ? policy.reason_codes
      : ['hermes.pre_generation.controller_approval_missing'],
    policy,
    dispatch_source: 'command-eve-embedded-nl5',
    dispatch_source_reason: reason,
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

function marketingCardActionEventKind(action: CommandEveKanbanMarketingCardAction): string {
  return `command_eve_card_${action === 'comment' ? 'commented' : `${action}ed`}`.replace('completeed', 'completed');
}

function marketingCardActionAuditType(
  action: CommandEveKanbanMarketingCardAction
): Parameters<typeof appendMarketingMutationAuditEvent>[0]['eventType'] {
  if (action === 'comment') return 'kanban.marketing_board_card_commented';
  if (action === 'block') return 'kanban.marketing_board_card_blocked';
  if (action === 'unblock') return 'kanban.marketing_board_card_unblocked';
  return 'kanban.marketing_board_card_completed';
}

function marketingCardActionMode(
  action: CommandEveKanbanMarketingCardAction
): Parameters<typeof appendMarketingMutationAuditEvent>[0]['mode'] {
  return `kanban-card-${action}` as Parameters<typeof appendMarketingMutationAuditEvent>[0]['mode'];
}

function marketingCardActionPayloadName(
  action: CommandEveKanbanMarketingCardAction
): Parameters<typeof appendMarketingMutationAuditEvent>[0]['action'] {
  if (action === 'comment') return 'card_comment';
  if (action === 'block') return 'card_block';
  if (action === 'unblock') return 'card_unblock';
  return 'card_complete';
}

export function applyKanbanMarketingCardAction(
  options: CommandEveKanbanMarketingCardActionOptions
): CommandEveKanbanMarketingCardActionResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingCardActionResultBase(paths.hermesHome);

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
      action: options.action,
    };
  }

  const taskId = String(options.task_id || '').trim();
  if (!taskId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ID_REQUIRED',
      message: 'A task_id is required to mutate a marketing card.',
      action: options.action,
    };
  }

  const action = options.action;
  if (!['comment', 'block', 'unblock', 'complete'].includes(action)) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ACTION_INVALID',
      message: `Unsupported Command EVE marketing card action: ${String(action || '')}`,
      card_id: taskId,
    };
  }

  const comment = String(options.comment || '').trim();
  if (action === 'comment' && !comment) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_COMMENT_REQUIRED',
      message: 'A non-empty comment is required to append a marketing card comment.',
      card_id: taskId,
      action,
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
      message: 'Card actions require dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
      action,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const actionAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardActionAuditEventId(taskId, action, occurredAt);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const actionResult = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      action,
      comment,
      action_at: actionAt,
      event_kind: marketingCardActionEventKind(action),
      audit_event_id: auditEventId,
    },
    buildMarketingCardActionScript(),
    paths.hermesHome
  );

  if (!actionResult.ok || !actionResult.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_CARD_ACTION_WRITE_FAILED',
      message: actionResult.error || 'Command EVE marketing card action could not be written.',
      card_id: taskId,
      action,
      audit_event_path: eventLedgerPath,
    };
  }

  const found = actionResult.data.found === true;
  if (!found) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      action,
      audit_event_path: eventLedgerPath,
    };
  }

  const applied = actionResult.data.applied === true;
  const fromStatus = textField(actionResult.data.from_status);
  const toStatus = textField(actionResult.data.to_status);
  const fromStep = textField(actionResult.data.from_step);
  const toStep = textField(actionResult.data.to_step);
  const fromLaneKey = normalizeMarketingLaneKey(fromStep) ?? undefined;
  const toLaneKey = normalizeMarketingLaneKey(toStep) ?? undefined;

  if (applied) {
    appendMarketingMutationAuditEvent({
      eventId: auditEventId,
      eventType: marketingCardActionAuditType(action),
      mode: marketingCardActionMode(action),
      action: marketingCardActionPayloadName(action),
      eventLedgerPath,
      occurredAt,
      cardId: taskId,
      boardSlug,
      dbPath,
      extraPayload: {
        from_status: fromStatus,
        to_status: toStatus,
        from_lane_key: fromLaneKey ?? fromStep,
        to_lane_key: toLaneKey ?? toStep,
        subprocess_spawned: false,
        external_calls: false,
        ...(action === 'comment' ? { comment_length: comment.length } : {}),
      },
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
    reason_code: `KANBAN_MARKETING_CARD_${action.toUpperCase()}ED`.replace('COMPLETEED', 'COMPLETED'),
    card_id: taskId,
    action,
    action_applied: applied,
    ...(fromStatus ? { from_status: fromStatus } : {}),
    ...(toStatus ? { to_status: toStatus } : {}),
    ...(fromLaneKey ? { from_lane_key: fromLaneKey } : {}),
    ...(toLaneKey ? { to_lane_key: toLaneKey } : {}),
    audit_event_path: eventLedgerPath,
    ...(applied ? { audit_event_id: auditEventId } : {}),
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
  const dispatchCliPath = companyOsRoot ? companyOsDispatchCliPath(companyOsRoot) : '';
  const hasExternalDispatchCli = Boolean(companyOsRoot && fs.existsSync(dispatchCliPath));
  const runner = options.commandRunner || defaultCommandRunner;
  let dispatch: CommandEveKanbanPreflightCommandResult = {
    ok: false,
    exitCode: 78,
    stdout: '',
    stderr: '',
  };
  let dispatchPlan: JsonRecord | null = null;

  if (hasExternalDispatchCli && companyOsRoot) {
    const nodeRuntime = nodeRuntimeForDispatch();
    dispatch = runner({
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
    dispatchPlan = parseJsonRecord(dispatch.stdout || '');
  } else {
    dispatchPlan = buildEmbeddedHermesPreGenerationDispatchPlan({
      request,
      reason: companyOsRoot
        ? `Company.OS NL-5 dispatch CLI not found: ${dispatchCliPath}`
        : 'Company.OS root not configured; using embedded Command EVE NL-5 gate.',
    });
    dispatch = {
      ok: false,
      exitCode: 78,
      stdout: `${JSON.stringify(dispatchPlan)}\n`,
      stderr: '',
    };
  }

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
  const dispatchSource =
    textField(dispatchPlan.dispatch_source) || (hasExternalDispatchCli ? 'company-os-nl5-cli' : '');
  const dispatchSourceReason = textField(dispatchPlan.dispatch_source_reason);
  const receiptPolicy = {
    ...policy,
    ...(dispatchSource ? { dispatch_source: dispatchSource } : {}),
    ...(dispatchSourceReason ? { dispatch_source_reason: dispatchSourceReason } : {}),
  };
  const dispatchHandoffPacket = buildMarketingDispatchHandoffPacket({
    request,
    dispatchPlan,
    policy: receiptPolicy,
    cardId: taskId,
    command,
    companyOsRoot,
    occurredAt,
  });
  dispatchPlan = {
    ...dispatchPlan,
    dispatch_handoff_packet: dispatchHandoffPacket,
  };
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
      policy: receiptPolicy,
      dispatch_handoff_packet: dispatchHandoffPacket,
      dispatch_source: dispatchSource,
      dispatch_source_reason: dispatchSourceReason,
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
      dispatch_handoff_packet: dispatchHandoffPacket,
      policy: receiptPolicy,
      subprocess_spawned: subprocessSpawned,
      data_boundary_checked: dataBoundaryChecked,
      controller_approval_required: controllerApprovalRequired,
      release_blocked: releaseBlocked,
      human_gate: 'HG-2.5',
      ...(dispatchSource ? { dispatch_source: dispatchSource } : {}),
      ...(dispatchSourceReason ? { dispatch_source_reason: dispatchSourceReason } : {}),
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
    dispatch_handoff_packet: dispatchHandoffPacket,
    ...(dispatchSource ? { dispatch_source: dispatchSource } : {}),
    ...(dispatchSourceReason ? { dispatch_source_reason: dispatchSourceReason } : {}),
    policy: receiptPolicy,
  };
}

export function recordKanbanMarketingDispatchApproval(
  options: CommandEveKanbanMarketingDispatchApprovalOptions
): CommandEveKanbanMarketingDispatchApprovalResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingDispatchApprovalResultBase(paths.hermesHome);

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
      message: 'A task_id is required to record a controller review receipt.',
    };
  }

  const dispatchHandoffPacket = isRecord(options.dispatch_handoff_packet) ? options.dispatch_handoff_packet : {};
  if (!isRecord(dispatchHandoffPacket) || Object.keys(dispatchHandoffPacket).length === 0) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_DISPATCH_HANDOFF_REQUIRED',
      message: 'Controller review receipt requires a dispatch handoff packet.',
      card_id: taskId,
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
      message:
        'Controller review receipts require dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
      dispatch_handoff_packet: dispatchHandoffPacket,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const recordedAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardDispatchApprovalAuditEventId(taskId, occurredAt);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const receiptWrite = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      audit_event_id: auditEventId,
      recorded_at: recordedAt,
      dispatch_handoff_packet: dispatchHandoffPacket,
      review_note: options.review_note || '',
    },
    buildMarketingDispatchApprovalScript(),
    paths.hermesHome
  );

  if (!receiptWrite.ok || !receiptWrite.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_CONTROLLER_APPROVAL_RECEIPT_WRITE_FAILED',
      message: receiptWrite.error || 'Command EVE controller-review receipt could not be written.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      dispatch_handoff_packet: dispatchHandoffPacket,
    };
  }
  if (receiptWrite.data.found !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      dispatch_handoff_packet: dispatchHandoffPacket,
    };
  }

  appendMarketingDispatchApprovalAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    cardId: taskId,
    boardSlug,
    dbPath,
    dispatchHandoffPacket,
  });

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
    reason_code: 'KANBAN_MARKETING_CONTROLLER_APPROVAL_PENDING_RECORDED',
    message: 'Controller review receipt recorded; worker execution remains blocked.',
    card_id: taskId,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    approval_event_kind: 'command_eve_controller_approval_pending',
    controller_approval_status: 'pending',
    subprocess_spawned: false,
    release_blocked: true,
    human_gate: 'HG-2.5',
    dispatch_handoff_packet: dispatchHandoffPacket,
    model: board.model,
  };
}

export function recordKanbanMarketingDispatchDecision(
  options: CommandEveKanbanMarketingDispatchDecisionOptions
): CommandEveKanbanMarketingDispatchDecisionResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingDispatchDecisionResultBase(paths.hermesHome);

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
      message: 'A task_id is required to record a controller decision receipt.',
    };
  }

  const decision = options.decision;
  if (decision !== 'approved' && decision !== 'rejected') {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CONTROLLER_DECISION_INVALID',
      message: 'Controller decision must be approved or rejected.',
      card_id: taskId,
    };
  }

  const dispatchHandoffPacket = isRecord(options.dispatch_handoff_packet) ? options.dispatch_handoff_packet : {};
  if (!isRecord(dispatchHandoffPacket) || Object.keys(dispatchHandoffPacket).length === 0) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_DISPATCH_HANDOFF_REQUIRED',
      message: 'Controller decision receipt requires a dispatch handoff packet.',
      card_id: taskId,
      controller_approval_status: decision,
      controller_approved: decision === 'approved',
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
      message:
        'Controller decision receipts require dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
      controller_approval_status: decision,
      controller_approved: decision === 'approved',
      dispatch_handoff_packet: dispatchHandoffPacket,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const recordedAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardDispatchDecisionAuditEventId(taskId, decision, occurredAt);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const receiptWrite = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      audit_event_id: auditEventId,
      recorded_at: recordedAt,
      decision,
      dispatch_handoff_packet: dispatchHandoffPacket,
      decision_note: options.decision_note || '',
    },
    buildMarketingDispatchDecisionScript(),
    paths.hermesHome
  );

  if (!receiptWrite.ok || !receiptWrite.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_CONTROLLER_DECISION_RECEIPT_WRITE_FAILED',
      message: receiptWrite.error || 'Command EVE controller-decision receipt could not be written.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      controller_approval_status: decision,
      controller_approved: decision === 'approved',
      dispatch_handoff_packet: dispatchHandoffPacket,
    };
  }
  if (receiptWrite.data.found !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      controller_approval_status: decision,
      controller_approved: decision === 'approved',
      dispatch_handoff_packet: dispatchHandoffPacket,
    };
  }

  appendMarketingDispatchDecisionAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    cardId: taskId,
    boardSlug,
    dbPath,
    decision,
    dispatchHandoffPacket,
  });

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
    reason_code:
      decision === 'approved'
        ? 'KANBAN_MARKETING_CONTROLLER_APPROVAL_RECORDED_NO_SPAWN'
        : 'KANBAN_MARKETING_CONTROLLER_REJECTION_RECORDED',
    message:
      decision === 'approved'
        ? 'Controller approval receipt recorded; worker execution still remains blocked.'
        : 'Controller rejection receipt recorded; worker execution remains blocked.',
    card_id: taskId,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    decision_event_kind: 'command_eve_controller_decision_recorded',
    controller_approval_status: decision,
    controller_approved: decision === 'approved',
    subprocess_spawned: false,
    release_blocked: true,
    human_gate: 'HG-2.5',
    dispatch_handoff_packet: dispatchHandoffPacket,
    model: board.model,
  };
}

export function generateKanbanMarketingDraft(
  options: CommandEveKanbanMarketingDraftGenerateOptions
): CommandEveKanbanMarketingDraftGenerateResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const companyOsRoot = resolveCompanyOsRootForDispatch(options);
  const base = marketingDraftGenerateResultBase(paths.hermesHome, companyOsRoot);

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

  const taskId = String(options.task_id || '').trim();
  if (!taskId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ID_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_CARD_ID_REQUIRED'],
      message: 'A task_id is required to generate a marketing draft.',
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
      message:
        'Marketing draft generation requires dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const generatedAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardDraftGenerateAuditEventId(taskId, occurredAt);
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
      message: lookup.error || 'Command EVE marketing card could not be read before draft generation.',
      card_id: taskId,
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
      audit_event_path: eventLedgerPath,
    };
  }

  const command = 'specify' as const;
  const request = buildMarketingDispatchRequest({
    task: lookup.data.task,
    cardId: taskId,
    command,
    companyOsRoot,
  });
  request.controllerApproval = {
    status: 'approved',
    reason: 'HG-2.5 controller decision receipt exists in the local Kanban ledger.',
  };

  const dispatchCliPath = companyOsRoot ? companyOsDispatchCliPath(companyOsRoot) : '';
  const hasExternalDispatchCli =
    options.dispatchMode !== 'embedded' && Boolean(companyOsRoot && fs.existsSync(dispatchCliPath));
  const runner = options.commandRunner || defaultCommandRunner;
  let dispatch: CommandEveKanbanPreflightCommandResult = {
    ok: false,
    exitCode: 78,
    stdout: '',
    stderr: '',
  };
  let dispatchPlan: JsonRecord | null = null;

  if (hasExternalDispatchCli && companyOsRoot) {
    const nodeRuntime = nodeRuntimeForDispatch();
    dispatch = runner({
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
    dispatchPlan = parseJsonRecord(dispatch.stdout || '');
  } else {
    const policy = buildEmbeddedHermesPreGenerationPolicy(request);
    dispatchPlan = {
      version: 'hermes-pre-generation-dispatch/v0',
      ok: policy.allowed,
      status: policy.allowed ? 'ready' : 'blocked',
      subprocess_spawned: false,
      reason_codes: policy.reason_codes.length ? policy.reason_codes : ['command_eve.embedded_nl5_ready'],
      policy,
      dispatch_source: 'command-eve-embedded-nl5',
      dispatch_source_reason: companyOsRoot
        ? `Company.OS NL-5 dispatch CLI not found: ${dispatchCliPath}`
        : 'Company.OS root not configured; using embedded Command EVE NL-5 gate.',
    };
    dispatch = {
      ok: policy.allowed,
      exitCode: policy.allowed ? 0 : 78,
      stdout: `${JSON.stringify(dispatchPlan)}\n`,
      stderr: '',
    };
  }

  if (!dispatchPlan) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'COMMAND_EVE_NL5_DISPATCH_PLAN_PARSE_FAILED',
      reason_codes: ['COMMAND_EVE_NL5_DISPATCH_PLAN_PARSE_FAILED'],
      message: dispatch.stderr || dispatch.error || 'Company.OS NL-5 dispatch plan returned non-JSON output.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }

  const policy = isRecord(dispatchPlan.policy) ? dispatchPlan.policy : {};
  const dataBoundaryReceipt = isRecord(policy.data_boundary_receipt)
    ? (policy.data_boundary_receipt as JsonRecord)
    : {};
  const dataBoundaryChecked = Object.keys(dataBoundaryReceipt).length > 0;
  const reasonCodes = reasonCodesFromDispatchPlan(dispatchPlan);
  const dispatchSource =
    textField(dispatchPlan.dispatch_source) || (hasExternalDispatchCli ? 'company-os-nl5-cli' : '');
  const dispatchSourceReason = textField(dispatchPlan.dispatch_source_reason);
  const ready = dispatchPlan.ok === true && dispatchPlan.status === 'ready' && dataBoundaryChecked;

  if (!ready) {
    return {
      ...base,
      ok: false,
      status: dispatchPlan.status === 'failed' ? 'failed' : 'blocked',
      reason_code: reasonCodes[0] || 'KANBAN_MARKETING_DRAFT_NL5_BLOCKED',
      reason_codes: reasonCodes,
      message: 'NL-5 blocked marketing draft generation before any output was written.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      data_boundary_checked: dataBoundaryChecked,
      controller_approval_status: 'approved',
      controller_approved: true,
      release_blocked: true,
      dispatch_handoff_packet: isRecord(options.dispatch_handoff_packet) ? options.dispatch_handoff_packet : {},
      policy,
    };
  }

  const dispatchHandoffPacket = isRecord(options.dispatch_handoff_packet) ? options.dispatch_handoff_packet : {};
  const draftSource = 'command-eve-local-marketing-draft-generator/v0';
  const draftText = buildLocalMarketingDraftText({
    task: lookup.data.task,
    cardId: taskId,
    handoff: dispatchHandoffPacket,
  });
  const receiptWrite = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      audit_event_id: auditEventId,
      generated_at: generatedAt,
      data_boundary_checked: dataBoundaryChecked,
      data_boundary_receipt: dataBoundaryReceipt,
      dispatch_status: textField(dispatchPlan.status) || 'ready',
      dispatch_source: dispatchSource,
      dispatch_source_reason: dispatchSourceReason,
      dispatch_handoff_packet: dispatchHandoffPacket,
      draft_source: draftSource,
      draft_text: draftText,
      generation_note: options.generation_note || '',
    },
    buildMarketingDraftGenerateScript(),
    paths.hermesHome
  );

  if (!receiptWrite.ok || !receiptWrite.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_DRAFT_WRITE_FAILED',
      reason_codes: ['KANBAN_MARKETING_DRAFT_WRITE_FAILED'],
      message: receiptWrite.error || 'Command EVE marketing draft could not be written.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      data_boundary_checked: dataBoundaryChecked,
      controller_approval_status: 'approved',
      controller_approved: true,
      release_blocked: true,
      dispatch_handoff_packet: dispatchHandoffPacket,
      policy,
    };
  }
  if (receiptWrite.data.found !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      reason_codes: ['KANBAN_MARKETING_CARD_NOT_FOUND'],
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      data_boundary_checked: dataBoundaryChecked,
      controller_approval_status: 'approved',
      controller_approved: true,
      release_blocked: true,
      dispatch_handoff_packet: dispatchHandoffPacket,
      policy,
    };
  }
  if (receiptWrite.data.approved !== true) {
    const approvalStatus = textField(receiptWrite.data.approval_status);
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CONTROLLER_APPROVAL_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_CONTROLLER_APPROVAL_REQUIRED'],
      message: 'Marketing draft generation requires an approved HG-2.5 controller decision in the local ledger.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      data_boundary_checked: dataBoundaryChecked,
      controller_approval_status:
        approvalStatus === 'rejected' || approvalStatus === 'approved' ? approvalStatus : undefined,
      controller_approved: false,
      release_blocked: true,
      dispatch_handoff_packet: dispatchHandoffPacket,
      policy,
    };
  }

  const persistedHandoff = isRecord(receiptWrite.data.dispatch_handoff_packet)
    ? (receiptWrite.data.dispatch_handoff_packet as JsonRecord)
    : dispatchHandoffPacket;
  appendMarketingDraftGeneratedAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    cardId: taskId,
    boardSlug,
    dbPath,
    dispatchHandoffPacket: persistedHandoff,
    draftSource,
    draftText,
    dispatchSource,
    dispatchSourceReason,
  });

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
    reason_code: 'KANBAN_MARKETING_DRAFT_GENERATED',
    reason_codes: ['command_eve.marketing_draft_generated_local'],
    message: 'Local marketing draft generated after NL-5 and HG-2.5 approval.',
    card_id: taskId,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    draft_event_kind: 'command_eve_marketing_draft_generated',
    draft_text: draftText,
    draft_source: draftSource,
    subprocess_spawned: false,
    data_boundary_checked: dataBoundaryChecked,
    controller_approval_status: 'approved',
    controller_approved: true,
    release_blocked: false,
    human_gate: 'HG-2.5',
    dispatch_handoff_packet: persistedHandoff,
    policy,
    model: board.model,
  };
}

/* ============================================================================
 * v15 gated marketing-executor LADDER (additive)
 * Re-implemented on the houston/compa-591 integration from Codex reference
 * mathias/codex/command-eve-v15-executor-gate (logic re-applied, not merged).
 * Monotonic stages: output-approve -> dispatch-request -> observed-run ->
 * start-gate -> dispatcher-prepare -> executor-promotion. Each stage re-derives
 * the prior stage's persisted task_events receipt and HARD-fails if absent.
 * No subprocess / external call / publish / schedule / outreach is ever spawned.
 * ========================================================================== */

export const COMMAND_EVE_KANBAN_MARKETING_OUTPUT_APPROVE_BRIDGE_VERSION =
  'command-eve-kanban-marketing-output-approve/v0';
export const COMMAND_EVE_KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_BRIDGE_VERSION =
  'command-eve-kanban-marketing-worker-dispatch-request/v0';
export const COMMAND_EVE_KANBAN_MARKETING_WORKER_OBSERVED_RUN_BRIDGE_VERSION =
  'command-eve-kanban-marketing-worker-observed-run/v0';
export const COMMAND_EVE_KANBAN_MARKETING_WORKER_START_GATE_BRIDGE_VERSION =
  'command-eve-kanban-marketing-worker-start-gate/v0';
export const COMMAND_EVE_KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_BRIDGE_VERSION =
  'command-eve-kanban-marketing-worker-dispatcher-prepare/v0';
export const COMMAND_EVE_KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTION_BRIDGE_VERSION =
  'command-eve-kanban-marketing-worker-executor-promotion/v0';

// --- ladder result types ---
export type CommandEveKanbanMarketingOutputApproveResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_OUTPUT_APPROVE_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  reason_codes: string[];
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  output_event_kind?: 'command_eve_marketing_output_approved';
  output_text?: string;
  output_source?: string;
  worker_dispatch_status?: 'prepared';
  worker_contract_yaml?: string;
  worker_prompt?: string;
  subprocess_spawned: false;
  data_boundary_checked: boolean;
  controller_approval_status?: CommandEveKanbanMarketingDispatchDecision;
  controller_approved: boolean;
  release_blocked: boolean;
  human_gate: 'HG-2.5';
  dispatch_handoff_packet?: JsonRecord;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingWorkerDispatchRequestResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  reason_codes: string[];
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  request_event_kind?: 'command_eve_marketing_worker_dispatch_requested';
  worker_dispatch_request_status?: 'blocked';
  worker_contract_yaml?: string;
  worker_prompt?: string;
  subprocess_spawned: false;
  data_boundary_checked: boolean;
  controller_approval_status?: CommandEveKanbanMarketingDispatchDecision;
  controller_approved: boolean;
  release_blocked: true;
  human_gate: 'HG-2.5';
  dispatch_handoff_packet?: JsonRecord;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingWorkerObservedRunResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_WORKER_OBSERVED_RUN_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  reason_codes: string[];
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  observed_event_kind?: 'command_eve_marketing_worker_observed_run_completed';
  worker_observed_run_status?: 'completed';
  worker_observed_output?: string;
  worker_contract_yaml?: string;
  worker_prompt?: string;
  subprocess_spawned: false;
  external_calls: false;
  data_boundary_checked: boolean;
  controller_approval_status?: CommandEveKanbanMarketingDispatchDecision;
  controller_approved: boolean;
  release_blocked: true;
  human_gate: 'HG-2.5';
  dispatch_handoff_packet?: JsonRecord;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingWorkerStartGateResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_WORKER_START_GATE_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  reason_codes: string[];
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  gate_event_kind?: 'command_eve_marketing_worker_start_gate_checked';
  worker_start_gate_status?: 'blocked' | 'ready';
  worker_start_gate_reason_codes?: string[];
  worker_start_packet?: JsonRecord;
  worker_contract_yaml?: string;
  worker_prompt?: string;
  subprocess_spawned: false;
  external_calls: false;
  data_boundary_checked: boolean;
  controller_approval_status?: CommandEveKanbanMarketingDispatchDecision;
  controller_approved: boolean;
  release_blocked: true;
  human_gate: 'HG-3';
  dispatch_handoff_packet?: JsonRecord;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingWorkerDispatcherPrepareResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  reason_codes: string[];
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  prepare_event_kind?: 'command_eve_marketing_worker_dispatcher_prepared';
  worker_dispatcher_prepare_status?: 'ready';
  worker_start_gate_status?: 'ready';
  dispatcher_prepare_packet?: JsonRecord;
  worker_start_packet?: JsonRecord;
  worker_contract_yaml?: string;
  worker_prompt?: string;
  subprocess_spawned: false;
  external_calls: false;
  data_boundary_checked: boolean;
  controller_approval_status?: CommandEveKanbanMarketingDispatchDecision;
  controller_approved: boolean;
  release_blocked: true;
  human_gate: 'HG-3.5';
  dispatch_handoff_packet?: JsonRecord;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

export type CommandEveKanbanMarketingWorkerExecutorPromotionResult = {
  version: typeof COMMAND_EVE_KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTION_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveKanbanMarketingBoardStatus;
  reason_code?: string;
  reason_codes: string[];
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  promotion_event_kind?: 'command_eve_marketing_worker_executor_promoted';
  worker_executor_promotion_status?: 'completed';
  worker_dispatcher_prepare_status?: 'ready';
  executor_promotion_packet?: JsonRecord;
  worker_report?: string;
  worker_contract_yaml?: string;
  worker_prompt?: string;
  subprocess_spawned: false;
  external_calls: false;
  data_boundary_checked: boolean;
  controller_approval_status?: CommandEveKanbanMarketingDispatchDecision;
  controller_approved: boolean;
  release_blocked: true;
  human_gate: 'HG-3.5';
  dispatch_handoff_packet?: JsonRecord;
  model?: CommandEveKanbanMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
};

// --- ladder options types ---
export type CommandEveKanbanMarketingOutputApproveOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  dispatch_handoff_packet?: JsonRecord;
  approval_note?: string;
};

export type CommandEveKanbanMarketingWorkerDispatchRequestOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  dispatch_handoff_packet?: JsonRecord;
  request_note?: string;
};

export type CommandEveKanbanMarketingWorkerObservedRunOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  dispatch_handoff_packet?: JsonRecord;
  observed_note?: string;
};

export type CommandEveKanbanMarketingWorkerStartGateOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  dispatch_handoff_packet?: JsonRecord;
  gate_note?: string;
  executor_enabled?: boolean;
  executor_profile?: JsonRecord;
};

export type CommandEveKanbanMarketingWorkerDispatcherPrepareOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  dispatch_handoff_packet?: JsonRecord;
  prepare_note?: string;
};

export type CommandEveKanbanMarketingWorkerExecutorPromotionOptions = CommandEveKanbanMarketingBoardOptions & {
  task_id: string;
  dispatch_handoff_packet?: JsonRecord;
  promotion_note?: string;
  cao_gate_approved?: boolean;
};

// --- ladder audit-event-id generators ---
function marketingCardOutputApproveAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-output-approved',
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingCardWorkerDispatchRequestAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-worker-dispatch-requested',
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingCardWorkerObservedRunAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-worker-observed-run',
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingCardWorkerStartGateAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-worker-start-gate',
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingCardWorkerDispatcherPrepareAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-worker-dispatcher-prepare',
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

function marketingCardWorkerExecutorPromotionAuditEventId(cardId: string, occurredAt: string): string {
  return [
    'command-eve-kanban-marketing-worker-executor-promotion',
    sanitizeEventIdPart(cardId),
    sanitizeEventIdPart(occurredAt),
  ].join('-');
}

// --- ladder result-base helpers (6 net-new) ---
function marketingWorkerStartGateResultBase(
  hermesHome: string
): Pick<CommandEveKanbanMarketingWorkerStartGateResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_WORKER_START_GATE_BRIDGE_VERSION,
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingWorkerDispatcherPrepareResultBase(
  hermesHome: string
): Pick<
  CommandEveKanbanMarketingWorkerDispatcherPrepareResult,
  | 'version'
  | 'source'
  | 'reason_codes'
  | 'subprocess_spawned'
  | 'external_calls'
  | 'data_boundary_checked'
  | 'controller_approved'
  | 'release_blocked'
  | 'human_gate'
> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_BRIDGE_VERSION,
    reason_codes: [],
    subprocess_spawned: false,
    external_calls: false,
    data_boundary_checked: false,
    controller_approved: false,
    release_blocked: true,
    human_gate: 'HG-3.5',
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingWorkerExecutorPromotionResultBase(
  hermesHome: string
): Pick<
  CommandEveKanbanMarketingWorkerExecutorPromotionResult,
  | 'version'
  | 'source'
  | 'reason_codes'
  | 'subprocess_spawned'
  | 'external_calls'
  | 'data_boundary_checked'
  | 'controller_approved'
  | 'release_blocked'
  | 'human_gate'
> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTION_BRIDGE_VERSION,
    reason_codes: [],
    subprocess_spawned: false,
    external_calls: false,
    data_boundary_checked: false,
    controller_approved: false,
    release_blocked: true,
    human_gate: 'HG-3.5',
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingOutputApproveResultBase(
  hermesHome: string
): Pick<
  CommandEveKanbanMarketingOutputApproveResult,
  | 'version'
  | 'source'
  | 'reason_codes'
  | 'subprocess_spawned'
  | 'data_boundary_checked'
  | 'controller_approved'
  | 'release_blocked'
  | 'human_gate'
> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_OUTPUT_APPROVE_BRIDGE_VERSION,
    reason_codes: [],
    subprocess_spawned: false,
    data_boundary_checked: false,
    controller_approved: false,
    release_blocked: true,
    human_gate: 'HG-2.5',
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingWorkerDispatchRequestResultBase(
  hermesHome: string
): Pick<
  CommandEveKanbanMarketingWorkerDispatchRequestResult,
  | 'version'
  | 'source'
  | 'reason_codes'
  | 'subprocess_spawned'
  | 'data_boundary_checked'
  | 'controller_approved'
  | 'release_blocked'
  | 'human_gate'
> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_BRIDGE_VERSION,
    reason_codes: [],
    subprocess_spawned: false,
    data_boundary_checked: false,
    controller_approved: false,
    release_blocked: true,
    human_gate: 'HG-2.5',
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}

function marketingWorkerObservedRunResultBase(
  hermesHome: string
): Pick<
  CommandEveKanbanMarketingWorkerObservedRunResult,
  | 'version'
  | 'source'
  | 'reason_codes'
  | 'subprocess_spawned'
  | 'external_calls'
  | 'data_boundary_checked'
  | 'controller_approved'
  | 'release_blocked'
  | 'human_gate'
> {
  return {
    version: COMMAND_EVE_KANBAN_MARKETING_WORKER_OBSERVED_RUN_BRIDGE_VERSION,
    reason_codes: [],
    subprocess_spawned: false,
    external_calls: false,
    data_boundary_checked: false,
    controller_approved: false,
    release_blocked: true,
    human_gate: 'HG-2.5',
    source: {
      generated_by: 'command-eve-kanban-marketing-board-core',
      hermes_home: hermesHome,
    },
  };
}


// --- ladder audit-event appenders (6 net-new) ---
function appendMarketingOutputApprovedAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  dispatchHandoffPacket,
  outputSource,
  outputText,
  workerContractYaml,
  workerPrompt,
  dataBoundaryChecked,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  dispatchHandoffPacket: JsonRecord;
  outputSource: string;
  outputText: string;
  workerContractYaml: string;
  workerPrompt: string;
  dataBoundaryChecked: boolean;
}): string {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_marketing_output_approved',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-marketing-output-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-marketing-output-approve',
    role_owner: 'Founder',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-2.5',
      controller_approval_status: 'approved',
      controller_approved: true,
      release_blocked: false,
      publishing_enabled: false,
      publish_blocked: true,
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      subprocess_spawned: false,
      external_calls: false,
      nl5_gate_checked: dataBoundaryChecked,
      action: 'marketing_output_approved',
      reason_codes: ['command_eve.marketing_output_approved_local'],
      dispatch_handoff_packet: dispatchHandoffPacket,
      output_approval_status: 'approved',
      output_source: outputSource,
      output_preview: outputText.slice(0, 600),
      output_length: outputText.length,
      worker_dispatch_status: 'prepared',
      worker_dispatch_mode: 'manual',
      worker_contract_yaml: workerContractYaml,
      worker_prompt_preview: workerPrompt.slice(0, 600),
      worker_prompt_length: workerPrompt.length,
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

function appendMarketingWorkerDispatchRequestedAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  dispatchHandoffPacket,
  workerContractYaml,
  workerPrompt,
  dataBoundaryChecked,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  dispatchHandoffPacket: JsonRecord;
  workerContractYaml: string;
  workerPrompt: string;
  dataBoundaryChecked: boolean;
}): string {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_worker_dispatch_requested',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-marketing-worker-dispatch-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-marketing-worker-dispatch-request',
    role_owner: 'Controller',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-2.5',
      controller_approval_status: 'approved',
      controller_approved: true,
      release_blocked: true,
      publishing_enabled: false,
      publish_blocked: true,
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      subprocess_spawned: false,
      external_calls: false,
      nl5_gate_checked: dataBoundaryChecked,
      action: 'worker_dispatch_requested_no_spawn',
      reason_codes: ['command_eve.marketing_worker_dispatch_requested_no_spawn'],
      dispatch_handoff_packet: dispatchHandoffPacket,
      worker_dispatch_status: 'prepared',
      worker_dispatch_request_status: 'blocked',
      worker_dispatch_request_mode: 'manual',
      worker_contract_yaml: workerContractYaml,
      worker_prompt_preview: workerPrompt.slice(0, 600),
      worker_prompt_length: workerPrompt.length,
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

function appendMarketingWorkerObservedRunAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  dispatchHandoffPacket,
  workerContractYaml,
  workerPrompt,
  workerObservedOutput,
  dataBoundaryChecked,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  dispatchHandoffPacket: JsonRecord;
  workerContractYaml: string;
  workerPrompt: string;
  workerObservedOutput: string;
  dataBoundaryChecked: boolean;
}): string {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_worker_observed_run_completed',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-marketing-worker-observed-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-marketing-worker-observed-run',
    role_owner: 'CMO',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-2.5',
      controller_approval_status: 'approved',
      controller_approved: true,
      release_blocked: true,
      publishing_enabled: false,
      publish_blocked: true,
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      subprocess_spawned: false,
      external_calls: false,
      worker_execution_mode: 'observed_local',
      worker_observed_run_status: 'completed',
      nl5_gate_checked: dataBoundaryChecked,
      action: 'worker_observed_run_completed_no_spawn',
      reason_codes: ['command_eve.marketing_worker_observed_run_completed_local_no_spawn'],
      dispatch_handoff_packet: dispatchHandoffPacket,
      worker_contract_yaml: workerContractYaml,
      worker_prompt_preview: workerPrompt.slice(0, 600),
      worker_prompt_length: workerPrompt.length,
      worker_observed_output_preview: workerObservedOutput.slice(0, 800),
      worker_observed_output_length: workerObservedOutput.length,
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

function appendMarketingWorkerStartGateAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  dispatchHandoffPacket,
  workerContractYaml,
  workerPrompt,
  workerStartPacket,
  gateStatus,
  gateReasonCodes,
  dataBoundaryChecked,
  sourceNl5GateChecked,
  workerStartNl5Checked,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  dispatchHandoffPacket: JsonRecord;
  workerContractYaml: string;
  workerPrompt: string;
  workerStartPacket: JsonRecord;
  gateStatus: 'blocked' | 'ready';
  gateReasonCodes: string[];
  dataBoundaryChecked: boolean;
  sourceNl5GateChecked: boolean;
  workerStartNl5Checked: boolean;
}): string {
  const executorProfileReceipt = isRecord(workerStartPacket.executor_profile_receipt)
    ? (workerStartPacket.executor_profile_receipt as JsonRecord)
    : {};
  const executorProfileReasonCodes = Array.isArray(executorProfileReceipt.reason_codes)
    ? executorProfileReceipt.reason_codes.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  const eventReasonCodes = ['command_eve.marketing_worker_start_gate_checked_no_spawn', ...executorProfileReasonCodes];
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_worker_start_gate_checked',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-marketing-worker-start-gate-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-marketing-worker-start-gate',
    role_owner: 'Controller',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-3',
      controller_approval_status: 'approved',
      controller_approved: true,
      release_blocked: true,
      publishing_enabled: false,
      publish_blocked: true,
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      subprocess_spawned: false,
      external_calls: false,
      worker_start_gate_status: gateStatus,
      worker_start_gate_reason_codes: gateReasonCodes,
      source_nl5_gate_checked: sourceNl5GateChecked,
      worker_start_nl5_checked: workerStartNl5Checked,
      action: 'worker_start_gate_checked_no_spawn',
      reason_codes: eventReasonCodes,
      dispatch_handoff_packet: dispatchHandoffPacket,
      worker_start_packet: workerStartPacket,
      worker_start_data_boundary_receipt: isRecord(workerStartPacket.worker_start_data_boundary_receipt)
        ? workerStartPacket.worker_start_data_boundary_receipt
        : {},
      worker_contract_yaml: workerContractYaml,
      worker_prompt_preview: workerPrompt.slice(0, 600),
      worker_prompt_length: workerPrompt.length,
      nl5_gate_checked: dataBoundaryChecked,
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

function appendMarketingWorkerDispatcherPrepareAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  dispatchHandoffPacket,
  workerContractYaml,
  workerPrompt,
  dispatcherPreparePacket,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  dispatchHandoffPacket: JsonRecord;
  workerContractYaml: string;
  workerPrompt: string;
  dispatcherPreparePacket: JsonRecord;
}): string {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_worker_dispatcher_prepared',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-marketing-worker-dispatcher-prepare-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-marketing-worker-dispatcher-prepare',
    role_owner: 'Controller',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-3.5',
      controller_approval_status: 'approved',
      controller_approved: true,
      dispatcher_prepare_status: 'ready',
      worker_start_gate_status: 'ready',
      release_blocked: true,
      publishing_enabled: false,
      publish_blocked: true,
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: true,
      source_nl5_gate_checked: true,
      worker_start_nl5_checked: true,
      action: 'worker_dispatcher_prepared_no_spawn',
      reason_codes: [
        'command_eve.marketing_worker_dispatcher_prepared_no_spawn',
        'command_eve.worker_start_gate_ready_verified',
      ],
      dispatch_handoff_packet: dispatchHandoffPacket,
      dispatcher_prepare_packet: dispatcherPreparePacket,
      worker_start_packet: isRecord(dispatcherPreparePacket.worker_start_packet)
        ? dispatcherPreparePacket.worker_start_packet
        : {},
      worker_contract_yaml: workerContractYaml,
      worker_prompt_preview: workerPrompt.slice(0, 600),
      worker_prompt_length: workerPrompt.length,
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

function appendMarketingWorkerExecutorPromotionAuditEvent({
  eventId,
  eventLedgerPath,
  occurredAt,
  cardId,
  boardSlug,
  dbPath,
  dispatchHandoffPacket,
  workerContractYaml,
  workerPrompt,
  executorPromotionPacket,
  workerReport,
}: {
  eventId: string;
  eventLedgerPath: string;
  occurredAt: string;
  cardId: string;
  boardSlug: string;
  dbPath: string;
  dispatchHandoffPacket: JsonRecord;
  workerContractYaml: string;
  workerPrompt: string;
  executorPromotionPacket: JsonRecord;
  workerReport: string;
}): string {
  const event = {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'kanban.marketing_board_worker_executor_promoted',
    occurred_at: occurredAt,
    producer: 'command-eve-desktop',
    workspace: 'command-eve-local',
    workspace_path: dbPath,
    issue_id: cardId,
    parent_issue_id: '',
    run_id: `kanban-marketing-worker-executor-promotion-${cardId}`,
    session_id: '',
    agent: 'eve',
    mode: 'kanban-marketing-worker-executor-promotion',
    role_owner: 'Controller',
    department: 'Marketing',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      board_slug: boardSlug,
      card_id: cardId,
      db_path: dbPath,
      human_gate: 'HG-3.5',
      controller_approval_status: 'approved',
      controller_approved: true,
      cao_gate_approved: true,
      worker_executor_promotion_status: 'completed',
      dispatcher_prepare_status: 'ready',
      release_blocked: true,
      publishing_enabled: false,
      publish_blocked: true,
      dispatcher_enabled: false,
      auto_decompose_enabled: false,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: true,
      nl5_gate_checked: true,
      action: 'worker_executor_promoted_local_in_process',
      reason_codes: [
        'command_eve.marketing_worker_executor_promoted_local_in_process',
        'command_eve.worker_dispatcher_prepare_verified',
        'command_eve.nl5_no_bypass_verified',
      ],
      dispatch_handoff_packet: dispatchHandoffPacket,
      executor_promotion_packet: executorPromotionPacket,
      worker_contract_yaml: workerContractYaml,
      worker_prompt_preview: workerPrompt.slice(0, 600),
      worker_prompt_length: workerPrompt.length,
      worker_report_preview: workerReport.slice(0, 800),
      worker_report_length: workerReport.length,
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

// --- ladder python (json/os/sqlite3/sys[/re]) SQLite script builders (6) ---
function buildMarketingOutputApproveScript(): string {
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
    conn.execute("PRAGMA journal_mode=WAL")
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

    draft_row = conn.execute(
        """
        SELECT payload
        FROM task_events
        WHERE task_id = ?
          AND kind = 'command_eve_marketing_draft_generated'
          AND json_valid(payload)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if draft_row is None:
        conn.commit()
        print(json.dumps({"found": True, "draft_found": False}))
        sys.exit(0)

    try:
        draft_payload = json.loads(draft_row["payload"] or "{}")
    except Exception:
        draft_payload = {}
    draft_text = draft_payload.get("draft_text") or ""
    draft_status = draft_payload.get("draft_status") or ""
    if draft_status != "generated" or not draft_text:
        conn.commit()
        print(json.dumps({"found": True, "draft_found": False, "draft_status": draft_status}))
        sys.exit(0)

    approved_at = int(request["approved_at"])
    output_source = request["output_source"]
    output_text = draft_text
    dispatch_handoff_packet = request.get("dispatch_handoff_packet") or draft_payload.get("dispatch_handoff_packet") or {}
    if not isinstance(dispatch_handoff_packet, dict):
        dispatch_handoff_packet = {}
    role_label = dispatch_handoff_packet.get("role_label") or "role:cmo"
    agent = dispatch_handoff_packet.get("agent") or "hermes"
    mode = "marketing-output-review"
    workspace = dispatch_handoff_packet.get("workspace") or "command-eve-local"
    source_of_truth = dispatch_handoff_packet.get("source_of_truth") or ("Hermes kanban task " + request["card_id"])
    title = row["title"] or ("Command EVE marketing card " + request["card_id"])
    worker_contract_yaml = "\\n".join([
        "role: " + role_label,
        "parent_seat: role:ceo",
        "agent: " + agent,
        "mode: " + mode,
        "workspace: " + workspace,
        "dispatch: manual",
        "source_of_truth: " + source_of_truth,
        "scope: Review the approved local marketing output and prepare the next distribution-safe recommendation only.",
        "acceptance_criteria: Return a worker.reported block with claim-safety notes, channel recommendation, and unresolved risks.",
        "gates: NL-5 data boundary, HG-2.5 approval, no publishing, no external calls unless explicitly authorized.",
        "human_gate: HG-2.5",
        "reporting: Append local task_events and agent-events receipts before any future worker subprocess spawn.",
    ])
    worker_prompt = "\\n".join([
        "You are the Command EVE CMO worker for a local-first, privacy-gated marketing loop.",
        "",
        "Source card: " + request["card_id"],
        "Title: " + title,
        "HumanGate: HG-2.5",
        "",
        "Approved local output:",
        output_text,
        "",
        "Instructions:",
        "- Do not publish, schedule, email, or call external providers.",
        "- Treat this as a manual dispatch-ready handoff only.",
        "- Return worker.reported with claim-safety notes, channel recommendation, residual risks, and next human decision.",
        "- Keep sensitive customer data local unless a later explicit gate allows otherwise.",
    ])
    event_payload = {
        "audit_event_id": request["audit_event_id"],
        "human_gate": "HG-2.5",
        "controller_approval_status": "approved",
        "controller_approved": True,
        "release_blocked": False,
        "publishing_enabled": False,
        "publish_blocked": True,
        "dispatcher_enabled": False,
        "auto_decompose_enabled": False,
        "subprocess_spawned": False,
        "external_calls": False,
        "nl5_gate_checked": bool(draft_payload.get("nl5_gate_checked")),
        "data_boundary_receipt": draft_payload.get("data_boundary_receipt") or {},
        "dispatch_handoff_packet": dispatch_handoff_packet,
        "source_draft_audit_event_id": draft_payload.get("audit_event_id") or "",
        "output_approval_status": "approved",
        "output_source": output_source,
        "output_text": output_text,
        "worker_dispatch_status": "prepared",
        "worker_dispatch_ready": True,
        "worker_dispatch_mode": "manual",
        "worker_dispatch_target": agent,
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "approval_note_length": len(request.get("approval_note") or ""),
        "reason_codes": ["command_eve.marketing_output_approved_local"],
    }
    conn.execute(
        "UPDATE tasks SET status = ?, current_step_key = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
        ("review", "readyToApprove", approved_at, request["card_id"]),
    )
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_marketing_output_approved",
          json.dumps(event_payload),
          approved_at,
        ),
    )
    conn.execute(
        "INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)",
        (
          request["card_id"],
          "eve",
          "Approved local marketing output:\n\n" + output_text,
          approved_at,
        ),
    )
    conn.commit()
    print(json.dumps({
        "found": True,
        "draft_found": True,
        "output_approved": True,
        "task": dict(row),
        "output_text": output_text,
        "output_source": output_source,
        "dispatch_handoff_packet": event_payload["dispatch_handoff_packet"],
        "worker_dispatch_status": event_payload["worker_dispatch_status"],
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "data_boundary_checked": event_payload["nl5_gate_checked"],
    }))
finally:
    conn.close()
`;
}


function buildMarketingWorkerDispatchRequestScript(): string {
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
        SELECT id, title
        FROM tasks
        WHERE id = ?
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if row is None:
        print(json.dumps({"found": False}))
        sys.exit(0)

    output_event = conn.execute(
        """
        SELECT payload, created_at
        FROM task_events
        WHERE task_id = ?
          AND kind = 'command_eve_marketing_output_approved'
          AND json_valid(payload)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if output_event is None:
        print(json.dumps({"found": True, "output_approved": False}))
        sys.exit(0)

    output_payload = json.loads(output_event["payload"] or "{}")
    worker_contract_yaml = str(output_payload.get("worker_contract_yaml") or "")
    worker_prompt = str(output_payload.get("worker_prompt") or "")
    worker_ready = bool(output_payload.get("worker_dispatch_ready")) and bool(worker_contract_yaml.strip())
    if not worker_ready:
        print(json.dumps({
            "found": True,
            "output_approved": True,
            "worker_ready": False,
        }))
        sys.exit(0)

    request_at = int(request["request_at"])
    event_payload = {
        "audit_event_id": request["audit_event_id"],
        "human_gate": "HG-2.5",
        "controller_approval_status": "approved",
        "controller_approved": True,
        "release_blocked": True,
        "publishing_enabled": False,
        "publish_blocked": True,
        "dispatcher_enabled": False,
        "auto_decompose_enabled": False,
        "subprocess_spawned": False,
        "external_calls": False,
        "nl5_gate_checked": bool(output_payload.get("nl5_gate_checked")),
        "data_boundary_receipt": output_payload.get("data_boundary_receipt") or {},
        "dispatch_handoff_packet": output_payload.get("dispatch_handoff_packet") or request.get("dispatch_handoff_packet") or {},
        "source_output_audit_event_id": output_payload.get("audit_event_id") or "",
        "worker_dispatch_status": output_payload.get("worker_dispatch_status") or "prepared",
        "worker_dispatch_request_status": "blocked",
        "worker_dispatch_request_mode": "manual",
        "worker_dispatch_request_reason": "dispatcher_enabled=false; auto_decompose_enabled=false",
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "request_note_length": len(request.get("request_note") or ""),
        "reason_codes": ["command_eve.marketing_worker_dispatch_requested_no_spawn"],
    }
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_marketing_worker_dispatch_requested",
          json.dumps(event_payload),
          request_at,
        ),
    )
    conn.execute(
        "INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)",
        (
          request["card_id"],
          "eve",
          "Worker dispatch requested locally but blocked by Command EVE runtime policy. No subprocess was spawned.",
          request_at,
        ),
    )
    conn.commit()
    print(json.dumps({
        "found": True,
        "output_approved": True,
        "worker_ready": True,
        "request_recorded": True,
        "task": dict(row),
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "dispatch_handoff_packet": event_payload["dispatch_handoff_packet"],
        "data_boundary_checked": event_payload["nl5_gate_checked"],
    }))
finally:
    conn.close()
`;
}


function buildMarketingWorkerObservedRunScript(): string {
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
        SELECT id, title, COALESCE(body, '') AS body
        FROM tasks
        WHERE id = ?
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if row is None:
        print(json.dumps({"found": False}))
        sys.exit(0)

    request_event = conn.execute(
        """
        SELECT payload, created_at
        FROM task_events
        WHERE task_id = ?
          AND kind = 'command_eve_marketing_worker_dispatch_requested'
          AND json_valid(payload)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if request_event is None:
        print(json.dumps({"found": True, "dispatch_requested": False}))
        sys.exit(0)

    request_payload = json.loads(request_event["payload"] or "{}")
    if request_payload.get("worker_dispatch_request_status") != "blocked":
        print(json.dumps({
            "found": True,
            "dispatch_requested": True,
            "dispatch_request_blocked": False,
        }))
        sys.exit(0)

    worker_contract_yaml = str(request_payload.get("worker_contract_yaml") or "")
    worker_prompt = str(request_payload.get("worker_prompt") or "")
    if not worker_contract_yaml.strip() or not worker_prompt.strip():
        print(json.dumps({
            "found": True,
            "dispatch_requested": True,
            "dispatch_request_blocked": True,
            "worker_ready": False,
        }))
        sys.exit(0)

    observed_at = int(request["observed_at"])
    title = row["title"] or ("Command EVE marketing card " + request["card_id"])
    observed_output = "\\n".join([
        "worker.reported:",
        "  status: completed_local",
        "  role: role:cmo",
        "  mode: observed_local_marketing_worker",
        "  card_id: " + request["card_id"],
        "  title: " + title,
        "  claim_safety: draft_only_no_publish",
        "  channel_recommendation: linkedin_first",
        "  next_human_decision: Review the approved draft and explicitly unlock external distribution if desired.",
        "  unresolved_risks: No live publishing, outreach, scheduling, or external model/tool call has run.",
        "  gates:",
        "    human_gate: HG-2.5",
        "    nl5_gate_checked: " + ("true" if bool(request_payload.get("nl5_gate_checked")) else "false"),
        "    subprocess_spawned: false",
        "    external_calls: false",
        "    publish_blocked: true",
    ])
    event_payload = {
        "audit_event_id": request["audit_event_id"],
        "human_gate": "HG-2.5",
        "controller_approval_status": "approved",
        "controller_approved": True,
        "release_blocked": True,
        "publishing_enabled": False,
        "publish_blocked": True,
        "dispatcher_enabled": False,
        "auto_decompose_enabled": False,
        "subprocess_spawned": False,
        "external_calls": False,
        "worker_execution_mode": "observed_local",
        "worker_dispatch_status": request_payload.get("worker_dispatch_status") or "prepared",
        "worker_dispatch_request_status": "blocked",
        "worker_observed_run_status": "completed",
        "worker_observed_output": observed_output,
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "dispatch_handoff_packet": request_payload.get("dispatch_handoff_packet") or request.get("dispatch_handoff_packet") or {},
        "source_worker_dispatch_request_audit_event_id": request_payload.get("audit_event_id") or "",
        "nl5_gate_checked": bool(request_payload.get("nl5_gate_checked")),
        "data_boundary_receipt": request_payload.get("data_boundary_receipt") or {},
        "observed_note_length": len(request.get("observed_note") or ""),
        "reason_codes": ["command_eve.marketing_worker_observed_run_completed_local_no_spawn"],
    }
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_marketing_worker_observed_run_completed",
          json.dumps(event_payload),
          observed_at,
        ),
    )
    conn.execute(
        "INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)",
        (
          request["card_id"],
          "eve",
          "Observed local worker run completed without subprocess or external calls.\\n\\n" + observed_output,
          observed_at,
        ),
    )
    conn.commit()
    print(json.dumps({
        "found": True,
        "dispatch_requested": True,
        "dispatch_request_blocked": True,
        "worker_ready": True,
        "observed_run_completed": True,
        "task": dict(row),
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "worker_observed_output": observed_output,
        "dispatch_handoff_packet": event_payload["dispatch_handoff_packet"],
        "data_boundary_checked": event_payload["nl5_gate_checked"],
    }))
finally:
    conn.close()
`;
}


function buildMarketingWorkerStartGateScript(): string {
  return String.raw`
import json
import os
import re
import sqlite3
import sys

SENSITIVE_RULES = [
    ("secret", "provider-api-key-token", re.compile(r"\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b")),
    ("secret", "secret-assignment", re.compile(r"\b(?:api[_-]?key|secret|token|password|passwort)\s*[:=]\s*[\"']?[^\"'\s]{8,}[\"']?", re.IGNORECASE)),
    ("german_pii", "german-street-address", re.compile(r"\b[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.-]+(?:straße|strasse|weg|allee|platz|gasse|ring|damm)\s+\d+[a-z]?\b", re.IGNORECASE)),
    ("german_pii", "german-phone-number", re.compile(r"(?:\+49|0049|0)\s?(?:\(?\d{2,5}\)?[\s./-]?)\d{3,}[\d\s./-]{2,}\b")),
    ("email", "email-address", re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)),
]

def local_data_boundary_receipt(payload_text):
    findings = []
    for kind, rule_id, pattern in SENSITIVE_RULES:
        count = len(pattern.findall(payload_text or ""))
        if count > 0:
            findings.append({"kind": kind, "rule_id": rule_id, "count": count})
    finding_count = sum(item["count"] for item in findings)
    sensitivity_score = 2 if finding_count > 0 else 1
    return {
        "version": "command-eve-worker-start-data-boundary-receipt/v0",
        "ok": True,
        "status": "local-only-pass",
        "sensitivity": f"S{sensitivity_score}",
        "sensitivity_score": sensitivity_score,
        "effective_sensitivity": f"S{sensitivity_score}",
        "effective_sensitivity_score": sensitivity_score,
        "requested_lane": "local_only",
        "effective_lane": "local_only",
        "finding_count": finding_count,
        "findings": findings,
        "raw_text_stored": False,
        "provider_execution_allowed": False,
        "reason_codes": ["command_eve.worker_start_nl5_data_boundary_pass"],
    }

def runtime_executor_profile_receipt(profile, executor_enabled):
    if not executor_enabled:
        return {
            "version": "command-eve-runtime-executor-profile-receipt/v0",
            "ok": False,
            "status": "disabled",
            "configured": False,
            "reason_codes": ["runtime_executor_not_configured"],
            "raw_profile_stored": False,
        }
    if not isinstance(profile, dict):
        return {
            "version": "command-eve-runtime-executor-profile-receipt/v0",
            "ok": False,
            "status": "missing",
            "configured": False,
            "reason_codes": ["runtime_executor_profile_missing"],
            "raw_profile_stored": False,
        }

    reason_codes = []
    if profile.get("version") != "command-eve-runtime-executor-profile/v0":
        reason_codes.append("runtime_executor_profile_version_invalid")
    if profile.get("executor_kind") != "hermes-local-observed":
        reason_codes.append("runtime_executor_kind_not_allowlisted")
    if profile.get("execution_mode") != "observed":
        reason_codes.append("runtime_executor_mode_not_observed")
    if profile.get("transport") != "local":
        reason_codes.append("runtime_executor_transport_not_local")
    if profile.get("data_boundary_enforced") is not True:
        reason_codes.append("runtime_executor_data_boundary_not_enforced")
    if profile.get("external_calls_allowed") is not False:
        reason_codes.append("runtime_executor_external_calls_not_forbidden")
    if profile.get("subprocess_spawn_allowed") is not False:
        reason_codes.append("runtime_executor_spawn_not_locked")
    if profile.get("hg3_approved") is not True:
        reason_codes.append("runtime_executor_hg3_approval_missing")

    return {
        "version": "command-eve-runtime-executor-profile-receipt/v0",
        "ok": len(reason_codes) == 0,
        "status": "accepted" if len(reason_codes) == 0 else "rejected",
        "configured": True,
        "executor_kind": str(profile.get("executor_kind") or ""),
        "execution_mode": str(profile.get("execution_mode") or ""),
        "transport": str(profile.get("transport") or ""),
        "data_boundary_enforced": profile.get("data_boundary_enforced") is True,
        "external_calls_allowed": profile.get("external_calls_allowed") is True,
        "subprocess_spawn_allowed": profile.get("subprocess_spawn_allowed") is True,
        "hg3_approved": profile.get("hg3_approved") is True,
        "approved_by": str(profile.get("approved_by") or ""),
        "approved_at": str(profile.get("approved_at") or ""),
        "raw_profile_stored": False,
        "reason_codes": reason_codes if reason_codes else ["command_eve.runtime_executor_profile_accepted_no_spawn"],
    }

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
        SELECT id, title, COALESCE(body, '') AS body
        FROM tasks
        WHERE id = ?
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if row is None:
        print(json.dumps({"found": False}))
        sys.exit(0)

    observed_event = conn.execute(
        """
        SELECT payload, created_at
        FROM task_events
        WHERE task_id = ?
          AND kind = 'command_eve_marketing_worker_observed_run_completed'
          AND json_valid(payload)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if observed_event is None:
        print(json.dumps({"found": True, "observed_run_completed": False}))
        sys.exit(0)

    observed_payload = json.loads(observed_event["payload"] or "{}")
    if observed_payload.get("worker_observed_run_status") != "completed":
        print(json.dumps({
            "found": True,
            "observed_run_completed": True,
            "observed_run_valid": False,
        }))
        sys.exit(0)

    worker_contract_yaml = str(observed_payload.get("worker_contract_yaml") or "")
    worker_prompt = str(observed_payload.get("worker_prompt") or "")
    if not worker_contract_yaml.strip() or not worker_prompt.strip():
        print(json.dumps({
            "found": True,
            "observed_run_completed": True,
            "observed_run_valid": True,
            "worker_ready": False,
        }))
        sys.exit(0)

    gate_at = int(request["gate_at"])
    executor_enabled = bool(request.get("executor_enabled"))
    executor_profile_receipt = runtime_executor_profile_receipt(request.get("executor_profile"), executor_enabled)
    source_nl5_checked = bool(observed_payload.get("nl5_gate_checked"))
    worker_start_data_boundary_receipt = local_data_boundary_receipt("\n".join([
        str(row["title"] or ""),
        str(row["body"] or ""),
        worker_contract_yaml,
        worker_prompt,
    ]))
    worker_start_nl5_checked = bool(worker_start_data_boundary_receipt.get("ok"))
    gate_reason_codes = []
    if not source_nl5_checked:
        gate_reason_codes.append("source_nl5_gate_missing")
    if not worker_start_nl5_checked:
        gate_reason_codes.append("worker_start_data_boundary_failed")
    if not executor_enabled:
        gate_reason_codes.extend([
            "dispatcher_enabled=false",
            "auto_decompose_enabled=false",
            "runtime_executor_not_configured",
            "hg3_required_before_subprocess_spawn",
        ])
    elif not executor_profile_receipt.get("ok"):
        gate_reason_codes.extend(executor_profile_receipt.get("reason_codes") or ["runtime_executor_profile_rejected"])
    gate_status = "ready" if executor_enabled and not gate_reason_codes else "blocked"
    worker_start_packet = {
        "version": "command-eve-worker-start-packet/v0",
        "card_id": request["card_id"],
        "role_label": "role:cmo",
        "department": "marketing",
        "agent": "manual_worker",
        "mode": "marketing_generate_review",
        "dispatch": "manual",
        "human_gate": "HG-3",
        "executor_enabled": executor_enabled,
        "executor_profile_receipt": executor_profile_receipt,
        "gate_reason_codes": gate_reason_codes,
        "subprocess_spawned": False,
        "external_calls": False,
        "data_boundary_checked": source_nl5_checked and worker_start_nl5_checked,
        "worker_start_data_boundary_receipt": worker_start_data_boundary_receipt,
        "release_blocked": True,
        "allowed_actions": ["review", "revise_draft", "report"],
        "blocked_actions": ["subprocess_spawn", "external_call", "publish", "schedule", "outreach"],
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "observed_worker_audit_event_id": observed_payload.get("audit_event_id") or "",
    }
    event_reason_codes = ["command_eve.marketing_worker_start_gate_checked_no_spawn"]
    if executor_profile_receipt.get("ok"):
        event_reason_codes.extend(executor_profile_receipt.get("reason_codes") or [])

    event_payload = {
        "audit_event_id": request["audit_event_id"],
        "human_gate": "HG-3",
        "controller_approval_status": "approved",
        "controller_approved": True,
        "release_blocked": True,
        "publishing_enabled": False,
        "publish_blocked": True,
        "dispatcher_enabled": False,
        "auto_decompose_enabled": False,
        "subprocess_spawned": False,
        "external_calls": False,
        "worker_start_gate_status": gate_status,
        "worker_start_gate_reason_codes": gate_reason_codes,
        "worker_start_packet": worker_start_packet,
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "dispatch_handoff_packet": observed_payload.get("dispatch_handoff_packet") or request.get("dispatch_handoff_packet") or {},
        "source_worker_observed_audit_event_id": observed_payload.get("audit_event_id") or "",
        "nl5_gate_checked": source_nl5_checked and worker_start_nl5_checked,
        "source_nl5_gate_checked": source_nl5_checked,
        "worker_start_nl5_checked": worker_start_nl5_checked,
        "data_boundary_receipt": observed_payload.get("data_boundary_receipt") or {},
        "worker_start_data_boundary_receipt": worker_start_data_boundary_receipt,
        "executor_profile_receipt": executor_profile_receipt,
        "gate_note_length": len(request.get("gate_note") or ""),
        "reason_codes": event_reason_codes,
    }
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_marketing_worker_start_gate_checked",
          json.dumps(event_payload),
          gate_at,
        ),
    )
    conn.execute(
        "INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)",
        (
          request["card_id"],
          "eve",
          "Worker start gate checked. Execution remains blocked until HG-3 and a runtime executor are explicitly configured.\\n\\n" + json.dumps(worker_start_packet, indent=2),
          gate_at,
        ),
    )
    conn.commit()
    print(json.dumps({
        "found": True,
        "observed_run_completed": True,
        "observed_run_valid": True,
        "worker_ready": True,
        "gate_recorded": True,
        "task": dict(row),
        "worker_start_gate_status": gate_status,
        "worker_start_gate_reason_codes": gate_reason_codes,
        "worker_start_packet": worker_start_packet,
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "dispatch_handoff_packet": event_payload["dispatch_handoff_packet"],
        "data_boundary_checked": event_payload["nl5_gate_checked"],
        "source_nl5_gate_checked": source_nl5_checked,
        "worker_start_nl5_checked": worker_start_nl5_checked,
        "worker_start_data_boundary_receipt": worker_start_data_boundary_receipt,
        "executor_profile_receipt": executor_profile_receipt,
    }))
finally:
    conn.close()
`;
}


function buildMarketingWorkerDispatcherPrepareScript(): string {
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
        SELECT id, title, COALESCE(body, '') AS body
        FROM tasks
        WHERE id = ?
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if row is None:
        print(json.dumps({"found": False}))
        sys.exit(0)

    gate_event = conn.execute(
        """
        SELECT payload, created_at
        FROM task_events
        WHERE task_id = ?
          AND kind = 'command_eve_marketing_worker_start_gate_checked'
          AND json_valid(payload)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if gate_event is None:
        print(json.dumps({"found": True, "start_gate_checked": False}))
        sys.exit(0)

    gate_payload = json.loads(gate_event["payload"] or "{}")
    if gate_payload.get("worker_start_gate_status") != "ready":
        print(json.dumps({
            "found": True,
            "start_gate_checked": True,
            "start_gate_ready": False,
            "worker_start_gate_status": gate_payload.get("worker_start_gate_status") or "",
            "worker_start_gate_reason_codes": gate_payload.get("worker_start_gate_reason_codes") or [],
        }))
        sys.exit(0)

    worker_start_packet = gate_payload.get("worker_start_packet") or {}
    if not isinstance(worker_start_packet, dict):
        worker_start_packet = {}
    executor_receipt = worker_start_packet.get("executor_profile_receipt") or gate_payload.get("executor_profile_receipt") or {}
    if not isinstance(executor_receipt, dict) or executor_receipt.get("ok") is not True:
        print(json.dumps({
            "found": True,
            "start_gate_checked": True,
            "start_gate_ready": True,
            "executor_profile_accepted": False,
            "executor_profile_receipt": executor_receipt if isinstance(executor_receipt, dict) else {},
        }))
        sys.exit(0)

    data_boundary_checked = bool(gate_payload.get("nl5_gate_checked")) and bool(gate_payload.get("source_nl5_gate_checked")) and bool(gate_payload.get("worker_start_nl5_checked"))
    if not data_boundary_checked:
        print(json.dumps({
            "found": True,
            "start_gate_checked": True,
            "start_gate_ready": True,
            "executor_profile_accepted": True,
            "data_boundary_checked": False,
        }))
        sys.exit(0)

    worker_contract_yaml = str(gate_payload.get("worker_contract_yaml") or worker_start_packet.get("worker_contract_yaml") or "")
    worker_prompt = str(gate_payload.get("worker_prompt") or worker_start_packet.get("worker_prompt") or "")
    if not worker_contract_yaml.strip() or not worker_prompt.strip():
        print(json.dumps({
            "found": True,
            "start_gate_checked": True,
            "start_gate_ready": True,
            "executor_profile_accepted": True,
            "data_boundary_checked": True,
            "worker_ready": False,
        }))
        sys.exit(0)

    prepared_at = int(request["prepared_at"])
    dispatcher_prepare_packet = {
        "version": "command-eve-worker-dispatcher-prepare-packet/v0",
        "card_id": request["card_id"],
        "role_label": "role:cmo",
        "department": "marketing",
        "agent": "manual_worker",
        "mode": "marketing_generate_review",
        "dispatch": "manual",
        "human_gate": "HG-3.5",
        "executor_kind": "hermes-local-observed",
        "execution_mode": "observed",
        "transport": "local",
        "dispatcher_prepare_status": "ready",
        "worker_start_gate_status": "ready",
        "nl5_gate_checked": True,
        "data_boundary_checked": True,
        "source_nl5_gate_checked": bool(gate_payload.get("source_nl5_gate_checked")),
        "worker_start_nl5_checked": bool(gate_payload.get("worker_start_nl5_checked")),
        "external_calls": False,
        "subprocess_spawned": False,
        "release_blocked": True,
        "allowed_next_actions": ["release_authority_review", "manual_observed_run", "abort"],
        "blocked_actions": ["subprocess_spawn", "external_call", "publish", "schedule", "outreach"],
        "worker_start_packet": worker_start_packet,
        "executor_profile_receipt": executor_receipt,
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "prepare_note_length": len(request.get("prepare_note") or ""),
    }
    event_payload = {
        "audit_event_id": request["audit_event_id"],
        "human_gate": "HG-3.5",
        "controller_approval_status": "approved",
        "controller_approved": True,
        "dispatcher_prepare_status": "ready",
        "worker_start_gate_status": "ready",
        "dispatcher_enabled": False,
        "auto_decompose_enabled": False,
        "subprocess_spawned": False,
        "external_calls": False,
        "nl5_gate_checked": True,
        "data_boundary_checked": True,
        "source_nl5_gate_checked": bool(gate_payload.get("source_nl5_gate_checked")),
        "worker_start_nl5_checked": bool(gate_payload.get("worker_start_nl5_checked")),
        "release_blocked": True,
        "publishing_enabled": False,
        "publish_blocked": True,
        "dispatcher_prepare_packet": dispatcher_prepare_packet,
        "worker_start_packet": worker_start_packet,
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "dispatch_handoff_packet": gate_payload.get("dispatch_handoff_packet") or request.get("dispatch_handoff_packet") or {},
        "source_worker_start_gate_audit_event_id": gate_payload.get("audit_event_id") or "",
        "reason_codes": [
            "command_eve.marketing_worker_dispatcher_prepared_no_spawn",
            "command_eve.worker_start_gate_ready_verified",
            "command_eve.runtime_executor_profile_accepted_no_spawn",
        ],
    }
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_marketing_worker_dispatcher_prepared",
          json.dumps(event_payload),
          prepared_at,
        ),
    )
    conn.execute(
        "INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)",
        (
          request["card_id"],
          "eve",
          "Gated dispatcher prepared locally after worker start gate readiness. No subprocess or external call was spawned.\\n\\n" + json.dumps(dispatcher_prepare_packet, indent=2),
          prepared_at,
        ),
    )
    conn.commit()
    print(json.dumps({
        "found": True,
        "start_gate_checked": True,
        "start_gate_ready": True,
        "executor_profile_accepted": True,
        "data_boundary_checked": True,
        "worker_ready": True,
        "dispatcher_prepare_recorded": True,
        "task": dict(row),
        "prepare_event_kind": "command_eve_marketing_worker_dispatcher_prepared",
        "dispatcher_prepare_status": "ready",
        "worker_start_gate_status": "ready",
        "dispatcher_prepare_packet": dispatcher_prepare_packet,
        "worker_start_packet": worker_start_packet,
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "dispatch_handoff_packet": event_payload["dispatch_handoff_packet"],
    }))
finally:
    conn.close()
`;
}


function buildMarketingWorkerExecutorPromotionScript(): string {
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
        SELECT id, title, COALESCE(body, '') AS body
        FROM tasks
        WHERE id = ?
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if row is None:
        print(json.dumps({"found": False}))
        sys.exit(0)

    dispatcher_event = conn.execute(
        """
        SELECT payload, created_at
        FROM task_events
        WHERE task_id = ?
          AND kind = 'command_eve_marketing_worker_dispatcher_prepared'
          AND json_valid(payload)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (request["card_id"],),
    ).fetchone()
    if dispatcher_event is None:
        print(json.dumps({"found": True, "dispatcher_prepared": False}))
        sys.exit(0)

    dispatcher_payload = json.loads(dispatcher_event["payload"] or "{}")
    if dispatcher_payload.get("dispatcher_prepare_status") != "ready":
        print(json.dumps({
            "found": True,
            "dispatcher_prepared": True,
            "dispatcher_ready": False,
            "dispatcher_prepare_status": dispatcher_payload.get("dispatcher_prepare_status") or "",
        }))
        sys.exit(0)

    if dispatcher_payload.get("data_boundary_checked") is not True:
        print(json.dumps({
            "found": True,
            "dispatcher_prepared": True,
            "dispatcher_ready": True,
            "data_boundary_checked": False,
        }))
        sys.exit(0)

    if request.get("cao_gate_approved") is not True:
        print(json.dumps({
            "found": True,
            "dispatcher_prepared": True,
            "dispatcher_ready": True,
            "data_boundary_checked": True,
            "cao_gate_approved": False,
        }))
        sys.exit(0)

    worker_contract_yaml = str(dispatcher_payload.get("worker_contract_yaml") or "")
    worker_prompt = str(dispatcher_payload.get("worker_prompt") or "")
    dispatcher_prepare_packet = dispatcher_payload.get("dispatcher_prepare_packet") or {}
    if not isinstance(dispatcher_prepare_packet, dict):
        dispatcher_prepare_packet = {}
    if not worker_contract_yaml.strip() or not worker_prompt.strip():
        print(json.dumps({
            "found": True,
            "dispatcher_prepared": True,
            "dispatcher_ready": True,
            "data_boundary_checked": True,
            "cao_gate_approved": True,
            "worker_ready": False,
        }))
        sys.exit(0)

    promoted_at = int(request["promoted_at"])
    title = row["title"] or ("Command EVE marketing card " + request["card_id"])
    worker_report = "\n".join([
        "worker.reported:",
        "  status: completed_local_executor",
        "  role: role:cmo",
        "  mode: local_executor_promotion_gate",
        "  card_id: " + request["card_id"],
        "  title: " + title,
        "  executor: command-eve-in-process-marketing-worker",
        "  claim_safety: draft_only_no_publish",
        "  output: Local marketing worker promotion completed and recorded in the local Hermes kanban ledger.",
        "  next_human_decision: Review the worker report before any publish, schedule, outreach, or external model/tool route.",
        "  gates:",
        "    human_gate: HG-3.5",
        "    cao_gate_approved: true",
        "    nl5_gate_checked: true",
        "    subprocess_spawned: false",
        "    external_calls: false",
        "    publish_blocked: true",
    ])
    executor_promotion_packet = {
        "version": "command-eve-worker-executor-promotion-packet/v0",
        "card_id": request["card_id"],
        "role_label": "role:cmo",
        "department": "marketing",
        "executor_kind": "command-eve-in-process-marketing-worker",
        "execution_mode": "observed_local_executor",
        "transport": "local",
        "human_gate": "HG-3.5",
        "cao_gate_approved": True,
        "worker_executor_promotion_status": "completed",
        "dispatcher_prepare_status": "ready",
        "nl5_gate_checked": True,
        "data_boundary_checked": True,
        "subprocess_spawned": False,
        "external_calls": False,
        "release_blocked": True,
        "publishing_enabled": False,
        "publish_blocked": True,
        "allowed_next_actions": ["review_worker_report", "revise", "release_authority_review", "abort"],
        "blocked_actions": ["subprocess_spawn", "external_call", "publish", "schedule", "outreach"],
        "source_dispatcher_prepare_audit_event_id": dispatcher_payload.get("audit_event_id") or "",
        "dispatcher_prepare_packet": dispatcher_prepare_packet,
        "worker_report": worker_report,
        "promotion_note_length": len(request.get("promotion_note") or ""),
    }
    event_payload = {
        "audit_event_id": request["audit_event_id"],
        "human_gate": "HG-3.5",
        "controller_approval_status": "approved",
        "controller_approved": True,
        "cao_gate_approved": True,
        "worker_executor_promotion_status": "completed",
        "dispatcher_prepare_status": "ready",
        "dispatcher_enabled": False,
        "auto_decompose_enabled": False,
        "subprocess_spawned": False,
        "external_calls": False,
        "nl5_gate_checked": True,
        "data_boundary_checked": True,
        "release_blocked": True,
        "publishing_enabled": False,
        "publish_blocked": True,
        "executor_promotion_packet": executor_promotion_packet,
        "dispatcher_prepare_packet": dispatcher_prepare_packet,
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "worker_report": worker_report,
        "dispatch_handoff_packet": dispatcher_payload.get("dispatch_handoff_packet") or request.get("dispatch_handoff_packet") or {},
        "source_worker_dispatcher_prepare_audit_event_id": dispatcher_payload.get("audit_event_id") or "",
        "reason_codes": [
            "command_eve.marketing_worker_executor_promoted_local_in_process",
            "command_eve.worker_dispatcher_prepare_verified",
            "command_eve.nl5_no_bypass_verified",
        ],
    }
    conn.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?, NULL, ?, ?, ?)",
        (
          request["card_id"],
          "command_eve_marketing_worker_executor_promoted",
          json.dumps(event_payload),
          promoted_at,
        ),
    )
    conn.execute(
        "INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?, ?, ?, ?)",
        (
          request["card_id"],
          "eve",
          "Local executor promotion completed without subprocess, external calls, publishing, scheduling or outreach.\n\n" + worker_report,
          promoted_at,
        ),
    )
    conn.commit()
    print(json.dumps({
        "found": True,
        "dispatcher_prepared": True,
        "dispatcher_ready": True,
        "data_boundary_checked": True,
        "cao_gate_approved": True,
        "worker_ready": True,
        "promotion_recorded": True,
        "task": dict(row),
        "promotion_event_kind": "command_eve_marketing_worker_executor_promoted",
        "worker_executor_promotion_status": "completed",
        "dispatcher_prepare_status": "ready",
        "executor_promotion_packet": executor_promotion_packet,
        "worker_report": worker_report,
        "worker_contract_yaml": worker_contract_yaml,
        "worker_prompt": worker_prompt,
        "dispatch_handoff_packet": event_payload["dispatch_handoff_packet"],
    }))
finally:
    conn.close()
`;
}

// --- ladder core functions (6) ---
export function approveKanbanMarketingOutput(
  options: CommandEveKanbanMarketingOutputApproveOptions
): CommandEveKanbanMarketingOutputApproveResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingOutputApproveResultBase(paths.hermesHome);

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

  const taskId = String(options.task_id || '').trim();
  if (!taskId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ID_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_CARD_ID_REQUIRED'],
      message: 'A task_id is required to approve a marketing output.',
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
      message:
        'Marketing output approval requires dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const approvedAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardOutputApproveAuditEventId(taskId, occurredAt);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const outputSource = 'command-eve-local-marketing-output-approval/v0';
  const receiptWrite = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      audit_event_id: auditEventId,
      approved_at: approvedAt,
      dispatch_handoff_packet: isRecord(options.dispatch_handoff_packet) ? options.dispatch_handoff_packet : {},
      output_source: outputSource,
      approval_note: options.approval_note || '',
    },
    buildMarketingOutputApproveScript(),
    paths.hermesHome
  );

  if (!receiptWrite.ok || !receiptWrite.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_OUTPUT_APPROVAL_WRITE_FAILED',
      reason_codes: ['KANBAN_MARKETING_OUTPUT_APPROVAL_WRITE_FAILED'],
      message: receiptWrite.error || 'Command EVE marketing output approval could not be written.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      release_blocked: true,
    };
  }
  if (receiptWrite.data.found !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      reason_codes: ['KANBAN_MARKETING_CARD_NOT_FOUND'],
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      release_blocked: true,
    };
  }
  if (receiptWrite.data.draft_found !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_DRAFT_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_DRAFT_REQUIRED'],
      message: 'Marketing output approval requires a generated local marketing draft receipt first.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      release_blocked: true,
    };
  }
  if (receiptWrite.data.output_approved !== true) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_OUTPUT_APPROVAL_NOT_RECORDED',
      reason_codes: ['KANBAN_MARKETING_OUTPUT_APPROVAL_NOT_RECORDED'],
      message: 'Command EVE marketing output approval did not return a persisted receipt.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      release_blocked: true,
    };
  }

  const outputText = textField(receiptWrite.data.output_text);
  const workerContractYaml = textField(receiptWrite.data.worker_contract_yaml);
  const workerPrompt = textField(receiptWrite.data.worker_prompt);
  const workerDispatchStatus =
    textField(receiptWrite.data.worker_dispatch_status) === 'prepared' ? ('prepared' as const) : undefined;
  const persistedHandoff = isRecord(receiptWrite.data.dispatch_handoff_packet)
    ? (receiptWrite.data.dispatch_handoff_packet as JsonRecord)
    : isRecord(options.dispatch_handoff_packet)
      ? options.dispatch_handoff_packet
      : {};
  const dataBoundaryChecked = receiptWrite.data.data_boundary_checked === true;
  appendMarketingOutputApprovedAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    cardId: taskId,
    boardSlug,
    dbPath,
    dispatchHandoffPacket: persistedHandoff,
    outputSource,
    outputText,
    workerContractYaml,
    workerPrompt,
    dataBoundaryChecked,
  });

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
    reason_code: 'KANBAN_MARKETING_OUTPUT_APPROVED',
    reason_codes: ['command_eve.marketing_output_approved_local'],
    message: 'Local marketing output approved after generated-draft review.',
    card_id: taskId,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    output_event_kind: 'command_eve_marketing_output_approved',
    output_text: outputText,
    output_source: outputSource,
    worker_dispatch_status: workerDispatchStatus,
    worker_contract_yaml: workerContractYaml,
    worker_prompt: workerPrompt,
    subprocess_spawned: false,
    data_boundary_checked: dataBoundaryChecked,
    controller_approval_status: 'approved',
    controller_approved: true,
    release_blocked: false,
    human_gate: 'HG-2.5',
    dispatch_handoff_packet: persistedHandoff,
    model: board.model,
  };
}

export function requestKanbanMarketingWorkerDispatch(
  options: CommandEveKanbanMarketingWorkerDispatchRequestOptions
): CommandEveKanbanMarketingWorkerDispatchRequestResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingWorkerDispatchRequestResultBase(paths.hermesHome);

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

  const taskId = String(options.task_id || '').trim();
  if (!taskId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ID_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_CARD_ID_REQUIRED'],
      message: 'A task_id is required to request a marketing worker dispatch.',
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
      message:
        'Marketing worker dispatch requests require dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const requestAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardWorkerDispatchRequestAuditEventId(taskId, occurredAt);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const receiptWrite = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      audit_event_id: auditEventId,
      request_at: requestAt,
      dispatch_handoff_packet: isRecord(options.dispatch_handoff_packet) ? options.dispatch_handoff_packet : {},
      request_note: options.request_note || '',
    },
    buildMarketingWorkerDispatchRequestScript(),
    paths.hermesHome
  );

  if (!receiptWrite.ok || !receiptWrite.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_WRITE_FAILED',
      reason_codes: ['KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_WRITE_FAILED'],
      message: receiptWrite.error || 'Command EVE marketing worker dispatch request could not be written.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.found !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      reason_codes: ['KANBAN_MARKETING_CARD_NOT_FOUND'],
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.output_approved !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_OUTPUT_APPROVAL_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_OUTPUT_APPROVAL_REQUIRED'],
      message: 'Marketing worker dispatch requests require an approved local marketing output first.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.worker_ready !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_HANDOFF_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_HANDOFF_REQUIRED'],
      message: 'Marketing worker dispatch requests require a prepared manual worker handoff.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.request_recorded !== true) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_NOT_RECORDED',
      reason_codes: ['KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_NOT_RECORDED'],
      message: 'Command EVE marketing worker dispatch request did not return a persisted receipt.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }

  const workerContractYaml = textField(receiptWrite.data.worker_contract_yaml);
  const workerPrompt = textField(receiptWrite.data.worker_prompt);
  const persistedHandoff = isRecord(receiptWrite.data.dispatch_handoff_packet)
    ? (receiptWrite.data.dispatch_handoff_packet as JsonRecord)
    : isRecord(options.dispatch_handoff_packet)
      ? options.dispatch_handoff_packet
      : {};
  const dataBoundaryChecked = receiptWrite.data.data_boundary_checked === true;
  appendMarketingWorkerDispatchRequestedAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    cardId: taskId,
    boardSlug,
    dbPath,
    dispatchHandoffPacket: persistedHandoff,
    workerContractYaml,
    workerPrompt,
    dataBoundaryChecked,
  });

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
    reason_code: 'KANBAN_MARKETING_WORKER_DISPATCH_LOCKED',
    reason_codes: ['command_eve.marketing_worker_dispatch_requested_no_spawn'],
    message: 'Marketing worker dispatch request recorded; worker execution remains locked by Command EVE policy.',
    card_id: taskId,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    request_event_kind: 'command_eve_marketing_worker_dispatch_requested',
    worker_dispatch_request_status: 'blocked',
    worker_contract_yaml: workerContractYaml,
    worker_prompt: workerPrompt,
    subprocess_spawned: false,
    data_boundary_checked: dataBoundaryChecked,
    controller_approval_status: 'approved',
    controller_approved: true,
    release_blocked: true,
    human_gate: 'HG-2.5',
    dispatch_handoff_packet: persistedHandoff,
    model: board.model,
  };
}

export function runKanbanMarketingWorkerObserved(
  options: CommandEveKanbanMarketingWorkerObservedRunOptions
): CommandEveKanbanMarketingWorkerObservedRunResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingWorkerObservedRunResultBase(paths.hermesHome);

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

  const taskId = String(options.task_id || '').trim();
  if (!taskId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ID_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_CARD_ID_REQUIRED'],
      message: 'A task_id is required to run an observed marketing worker.',
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
      message:
        'Observed marketing worker runs require dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const observedAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardWorkerObservedRunAuditEventId(taskId, occurredAt);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const receiptWrite = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      audit_event_id: auditEventId,
      observed_at: observedAt,
      dispatch_handoff_packet: isRecord(options.dispatch_handoff_packet) ? options.dispatch_handoff_packet : {},
      observed_note: options.observed_note || '',
    },
    buildMarketingWorkerObservedRunScript(),
    paths.hermesHome
  );

  if (!receiptWrite.ok || !receiptWrite.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_WORKER_OBSERVED_RUN_WRITE_FAILED',
      reason_codes: ['KANBAN_MARKETING_WORKER_OBSERVED_RUN_WRITE_FAILED'],
      message: receiptWrite.error || 'Command EVE observed marketing worker run could not be written.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.found !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      reason_codes: ['KANBAN_MARKETING_CARD_NOT_FOUND'],
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.dispatch_requested !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_REQUIRED'],
      message: 'Observed marketing worker runs require a locked worker dispatch request first.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.dispatch_request_blocked !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_NOT_LOCKED',
      reason_codes: ['KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_NOT_LOCKED'],
      message: 'Observed marketing worker runs only operate on policy-locked dispatch requests.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.worker_ready !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_HANDOFF_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_HANDOFF_REQUIRED'],
      message: 'Observed marketing worker runs require a prepared manual worker handoff.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.observed_run_completed !== true) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_WORKER_OBSERVED_RUN_NOT_RECORDED',
      reason_codes: ['KANBAN_MARKETING_WORKER_OBSERVED_RUN_NOT_RECORDED'],
      message: 'Command EVE observed marketing worker run did not return a persisted receipt.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }

  const workerContractYaml = textField(receiptWrite.data.worker_contract_yaml);
  const workerPrompt = textField(receiptWrite.data.worker_prompt);
  const workerObservedOutput = textField(receiptWrite.data.worker_observed_output);
  const persistedHandoff = isRecord(receiptWrite.data.dispatch_handoff_packet)
    ? (receiptWrite.data.dispatch_handoff_packet as JsonRecord)
    : isRecord(options.dispatch_handoff_packet)
      ? options.dispatch_handoff_packet
      : {};
  const dataBoundaryChecked = receiptWrite.data.data_boundary_checked === true;
  appendMarketingWorkerObservedRunAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    cardId: taskId,
    boardSlug,
    dbPath,
    dispatchHandoffPacket: persistedHandoff,
    workerContractYaml,
    workerPrompt,
    workerObservedOutput,
    dataBoundaryChecked,
  });

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
    reason_code: 'KANBAN_MARKETING_WORKER_OBSERVED_RUN_COMPLETED',
    reason_codes: ['command_eve.marketing_worker_observed_run_completed_local_no_spawn'],
    message: 'Observed local marketing worker run recorded; no subprocess, external call or publishing action ran.',
    card_id: taskId,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    observed_event_kind: 'command_eve_marketing_worker_observed_run_completed',
    worker_observed_run_status: 'completed',
    worker_observed_output: workerObservedOutput,
    worker_contract_yaml: workerContractYaml,
    worker_prompt: workerPrompt,
    subprocess_spawned: false,
    external_calls: false,
    data_boundary_checked: dataBoundaryChecked,
    controller_approval_status: 'approved',
    controller_approved: true,
    release_blocked: true,
    human_gate: 'HG-2.5',
    dispatch_handoff_packet: persistedHandoff,
    model: board.model,
  };
}

export function checkKanbanMarketingWorkerStartGate(
  options: CommandEveKanbanMarketingWorkerStartGateOptions
): CommandEveKanbanMarketingWorkerStartGateResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingWorkerStartGateResultBase(paths.hermesHome);

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
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3',
    };
  }

  const taskId = String(options.task_id || '').trim();
  if (!taskId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ID_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_CARD_ID_REQUIRED'],
      message: 'A task_id is required to check a marketing worker start gate.',
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3',
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
      message:
        'Worker start gate checks require dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3',
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const gateAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardWorkerStartGateAuditEventId(taskId, occurredAt);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const receiptWrite = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      audit_event_id: auditEventId,
      gate_at: gateAt,
      dispatch_handoff_packet: isRecord(options.dispatch_handoff_packet) ? options.dispatch_handoff_packet : {},
      gate_note: options.gate_note || '',
      executor_enabled: options.executor_enabled === true,
      executor_profile: isRecord(options.executor_profile) ? options.executor_profile : null,
    },
    buildMarketingWorkerStartGateScript(),
    paths.hermesHome
  );

  if (!receiptWrite.ok || !receiptWrite.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_WORKER_START_GATE_WRITE_FAILED',
      reason_codes: ['KANBAN_MARKETING_WORKER_START_GATE_WRITE_FAILED'],
      message: receiptWrite.error || 'Command EVE marketing worker start gate could not be written.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3',
    };
  }
  if (receiptWrite.data.found !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      reason_codes: ['KANBAN_MARKETING_CARD_NOT_FOUND'],
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3',
    };
  }
  if (receiptWrite.data.observed_run_completed !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_OBSERVED_RUN_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_OBSERVED_RUN_REQUIRED'],
      message: 'Worker start gate checks require an observed local marketing worker run first.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3',
    };
  }
  if (receiptWrite.data.observed_run_valid !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_OBSERVED_RUN_INVALID',
      reason_codes: ['KANBAN_MARKETING_WORKER_OBSERVED_RUN_INVALID'],
      message: 'Worker start gate checks require a completed observed worker run receipt.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3',
    };
  }
  if (receiptWrite.data.worker_ready !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_HANDOFF_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_HANDOFF_REQUIRED'],
      message: 'Worker start gate checks require a prepared manual worker handoff.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3',
    };
  }
  if (receiptWrite.data.gate_recorded !== true) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_WORKER_START_GATE_NOT_RECORDED',
      reason_codes: ['KANBAN_MARKETING_WORKER_START_GATE_NOT_RECORDED'],
      message: 'Command EVE marketing worker start gate did not return a persisted receipt.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3',
    };
  }

  const workerContractYaml = textField(receiptWrite.data.worker_contract_yaml);
  const workerPrompt = textField(receiptWrite.data.worker_prompt);
  const workerStartPacket = isRecord(receiptWrite.data.worker_start_packet)
    ? (receiptWrite.data.worker_start_packet as JsonRecord)
    : {};
  const executorProfileReceipt = isRecord(workerStartPacket.executor_profile_receipt)
    ? (workerStartPacket.executor_profile_receipt as JsonRecord)
    : {};
  const executorProfileReasonCodes = Array.isArray(executorProfileReceipt.reason_codes)
    ? executorProfileReceipt.reason_codes.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  const resultReasonCodes = ['command_eve.marketing_worker_start_gate_checked_no_spawn', ...executorProfileReasonCodes];
  const rawReasonCodes = Array.isArray(receiptWrite.data.worker_start_gate_reason_codes)
    ? receiptWrite.data.worker_start_gate_reason_codes
    : [];
  const gateReasonCodes = rawReasonCodes.map((reason) => String(reason)).filter(Boolean);
  const gateStatus =
    textField(receiptWrite.data.worker_start_gate_status) === 'ready' ? ('ready' as const) : ('blocked' as const);
  const persistedHandoff = isRecord(receiptWrite.data.dispatch_handoff_packet)
    ? (receiptWrite.data.dispatch_handoff_packet as JsonRecord)
    : isRecord(options.dispatch_handoff_packet)
      ? options.dispatch_handoff_packet
      : {};
  const dataBoundaryChecked = receiptWrite.data.data_boundary_checked === true;
  appendMarketingWorkerStartGateAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    cardId: taskId,
    boardSlug,
    dbPath,
    dispatchHandoffPacket: persistedHandoff,
    workerContractYaml,
    workerPrompt,
    workerStartPacket,
    gateStatus,
    gateReasonCodes,
    dataBoundaryChecked,
    sourceNl5GateChecked: receiptWrite.data.source_nl5_gate_checked === true,
    workerStartNl5Checked: receiptWrite.data.worker_start_nl5_checked === true,
  });

  const board = buildKanbanMarketingBoard({
    ...options,
    boardSlug,
    now,
    pythonPath,
  });

  return {
    ...base,
    ok: true,
    status: gateStatus === 'ready' ? 'ready' : 'blocked',
    reason_code:
      gateStatus === 'ready'
        ? 'KANBAN_MARKETING_WORKER_START_GATE_READY'
        : 'KANBAN_MARKETING_WORKER_START_GATE_BLOCKED',
    reason_codes: resultReasonCodes,
    message:
      gateStatus === 'ready'
        ? 'Marketing worker start packet is ready; execution is still subject to HG-3.'
        : 'Marketing worker start packet recorded; execution remains blocked until HG-3 and a runtime executor are explicitly configured.',
    card_id: taskId,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    gate_event_kind: 'command_eve_marketing_worker_start_gate_checked',
    worker_start_gate_status: gateStatus,
    worker_start_gate_reason_codes: gateReasonCodes,
    worker_start_packet: workerStartPacket,
    worker_contract_yaml: workerContractYaml,
    worker_prompt: workerPrompt,
    subprocess_spawned: false,
    external_calls: false,
    data_boundary_checked: dataBoundaryChecked,
    controller_approval_status: 'approved',
    controller_approved: true,
    release_blocked: true,
    human_gate: 'HG-3',
    dispatch_handoff_packet: persistedHandoff,
    model: board.model,
  };
}

export function prepareKanbanMarketingWorkerDispatcher(
  options: CommandEveKanbanMarketingWorkerDispatcherPrepareOptions
): CommandEveKanbanMarketingWorkerDispatcherPrepareResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingWorkerDispatcherPrepareResultBase(paths.hermesHome);

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
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
    };
  }

  const taskId = String(options.task_id || '').trim();
  if (!taskId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ID_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_CARD_ID_REQUIRED'],
      message: 'A task_id is required to prepare a marketing worker dispatcher.',
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
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
      message:
        'Dispatcher preparation requires dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const preparedAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardWorkerDispatcherPrepareAuditEventId(taskId, occurredAt);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const receiptWrite = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      audit_event_id: auditEventId,
      prepared_at: preparedAt,
      dispatch_handoff_packet: isRecord(options.dispatch_handoff_packet) ? options.dispatch_handoff_packet : {},
      prepare_note: options.prepare_note || '',
    },
    buildMarketingWorkerDispatcherPrepareScript(),
    paths.hermesHome
  );

  if (!receiptWrite.ok || !receiptWrite.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_WRITE_FAILED',
      reason_codes: ['KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_WRITE_FAILED'],
      message: receiptWrite.error || 'Command EVE marketing worker dispatcher preparation could not be written.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
    };
  }
  if (receiptWrite.data.found !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      reason_codes: ['KANBAN_MARKETING_CARD_NOT_FOUND'],
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
    };
  }
  if (receiptWrite.data.start_gate_checked !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_START_GATE_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_START_GATE_REQUIRED'],
      message: 'Dispatcher preparation requires a recorded marketing worker start gate first.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
    };
  }
  if (receiptWrite.data.start_gate_ready !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_START_GATE_NOT_READY',
      reason_codes: ['KANBAN_MARKETING_WORKER_START_GATE_NOT_READY'],
      message: 'Dispatcher preparation requires the worker start gate to be ready.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
    };
  }
  if (receiptWrite.data.executor_profile_accepted !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_RUNTIME_EXECUTOR_PROFILE_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_RUNTIME_EXECUTOR_PROFILE_REQUIRED'],
      message: 'Dispatcher preparation requires an accepted observed local executor profile.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
    };
  }
  if (receiptWrite.data.data_boundary_checked !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_DATA_BOUNDARY_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_DATA_BOUNDARY_REQUIRED'],
      message: 'Dispatcher preparation requires source and worker-start NL-5 checks.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
    };
  }
  if (receiptWrite.data.worker_ready !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_HANDOFF_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_HANDOFF_REQUIRED'],
      message: 'Dispatcher preparation requires the prepared marketing worker handoff.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
    };
  }
  if (receiptWrite.data.dispatcher_prepare_recorded !== true) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_NOT_RECORDED',
      reason_codes: ['KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_NOT_RECORDED'],
      message: 'Command EVE marketing worker dispatcher preparation did not return a persisted receipt.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
      subprocess_spawned: false,
      external_calls: false,
      data_boundary_checked: false,
      controller_approved: false,
      release_blocked: true,
      human_gate: 'HG-3.5',
    };
  }

  const workerContractYaml = textField(receiptWrite.data.worker_contract_yaml);
  const workerPrompt = textField(receiptWrite.data.worker_prompt);
  const dispatcherPreparePacket = isRecord(receiptWrite.data.dispatcher_prepare_packet)
    ? (receiptWrite.data.dispatcher_prepare_packet as JsonRecord)
    : {};
  const workerStartPacket = isRecord(receiptWrite.data.worker_start_packet)
    ? (receiptWrite.data.worker_start_packet as JsonRecord)
    : {};
  const persistedHandoff = isRecord(receiptWrite.data.dispatch_handoff_packet)
    ? (receiptWrite.data.dispatch_handoff_packet as JsonRecord)
    : isRecord(options.dispatch_handoff_packet)
      ? options.dispatch_handoff_packet
      : {};
  appendMarketingWorkerDispatcherPrepareAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    cardId: taskId,
    boardSlug,
    dbPath,
    dispatchHandoffPacket: persistedHandoff,
    workerContractYaml,
    workerPrompt,
    dispatcherPreparePacket,
  });

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
    reason_code: 'KANBAN_MARKETING_WORKER_DISPATCHER_PREPARED',
    reason_codes: [
      'command_eve.marketing_worker_dispatcher_prepared_no_spawn',
      'command_eve.worker_start_gate_ready_verified',
    ],
    message: 'Marketing worker dispatcher is prepared locally; no subprocess or external call was spawned.',
    card_id: taskId,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    prepare_event_kind: 'command_eve_marketing_worker_dispatcher_prepared',
    worker_dispatcher_prepare_status: 'ready',
    worker_start_gate_status: 'ready',
    dispatcher_prepare_packet: dispatcherPreparePacket,
    worker_start_packet: workerStartPacket,
    worker_contract_yaml: workerContractYaml,
    worker_prompt: workerPrompt,
    subprocess_spawned: false,
    external_calls: false,
    data_boundary_checked: true,
    controller_approval_status: 'approved',
    controller_approved: true,
    release_blocked: true,
    human_gate: 'HG-3.5',
    dispatch_handoff_packet: persistedHandoff,
    model: board.model,
  };
}

export function promoteKanbanMarketingWorkerExecutor(
  options: CommandEveKanbanMarketingWorkerExecutorPromotionOptions
): CommandEveKanbanMarketingWorkerExecutorPromotionResult {
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const base = marketingWorkerExecutorPromotionResultBase(paths.hermesHome);

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

  const taskId = String(options.task_id || '').trim();
  if (!taskId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_ID_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_CARD_ID_REQUIRED'],
      message: 'A task_id is required to promote a marketing worker executor.',
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
      message: 'Executor promotion requires dispatcher, auto-decompose and external MCP execution to stay disabled.',
      card_id: taskId,
    };
  }

  if (options.cao_gate_approved !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_EXECUTOR_PROMOTION_CAO_GATE_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_EXECUTOR_PROMOTION_CAO_GATE_REQUIRED'],
      message: 'Executor promotion requires an explicit CAO/HG-3.5 approval flag.',
      card_id: taskId,
    };
  }

  const now = options.now ?? (() => new Date());
  const occurredAt = now().toISOString();
  const promotedAt = Math.floor(new Date(occurredAt).getTime() / 1000);
  const dbPath = kanbanDbPath(paths.hermesHome, boardSlug);
  const eventLedgerPath = resolveMarketingEventLedgerPath(paths, options);
  const auditEventId = marketingCardWorkerExecutorPromotionAuditEventId(taskId, occurredAt);
  const pythonPath = pythonForMarketingBoard(paths, options.pythonPath);
  const receiptWrite = runPythonJson(
    pythonPath,
    {
      db_path: dbPath,
      card_id: taskId,
      audit_event_id: auditEventId,
      promoted_at: promotedAt,
      dispatch_handoff_packet: isRecord(options.dispatch_handoff_packet) ? options.dispatch_handoff_packet : {},
      promotion_note: options.promotion_note || '',
      cao_gate_approved: true,
    },
    buildMarketingWorkerExecutorPromotionScript(),
    paths.hermesHome
  );

  if (!receiptWrite.ok || !receiptWrite.data) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTION_WRITE_FAILED',
      reason_codes: ['KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTION_WRITE_FAILED'],
      message: receiptWrite.error || 'Command EVE marketing worker executor promotion could not be written.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.found !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_CARD_NOT_FOUND',
      reason_codes: ['KANBAN_MARKETING_CARD_NOT_FOUND'],
      message: `No marketing card found for task_id: ${taskId}`,
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.dispatcher_prepared !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_REQUIRED'],
      message: 'Executor promotion requires a prepared marketing worker dispatcher first.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.dispatcher_ready !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_DISPATCHER_NOT_READY',
      reason_codes: ['KANBAN_MARKETING_WORKER_DISPATCHER_NOT_READY'],
      message: 'Executor promotion requires a ready dispatcher prepare packet.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.data_boundary_checked !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_EXECUTOR_NL5_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_EXECUTOR_NL5_REQUIRED'],
      message: 'Executor promotion requires NL-5/no-bypass evidence from the dispatcher prepare packet.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.cao_gate_approved !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_EXECUTOR_PROMOTION_CAO_GATE_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_EXECUTOR_PROMOTION_CAO_GATE_REQUIRED'],
      message: 'Executor promotion requires explicit CAO/HG-3.5 approval.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.worker_ready !== true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'KANBAN_MARKETING_WORKER_HANDOFF_REQUIRED',
      reason_codes: ['KANBAN_MARKETING_WORKER_HANDOFF_REQUIRED'],
      message: 'Executor promotion requires a prepared worker handoff.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }
  if (receiptWrite.data.promotion_recorded !== true) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTION_NOT_RECORDED',
      reason_codes: ['KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTION_NOT_RECORDED'],
      message: 'Command EVE marketing worker executor promotion did not return a persisted receipt.',
      card_id: taskId,
      audit_event_path: eventLedgerPath,
    };
  }

  const executorPromotionPacket = isRecord(receiptWrite.data.executor_promotion_packet)
    ? (receiptWrite.data.executor_promotion_packet as JsonRecord)
    : {};
  const workerContractYaml = textField(receiptWrite.data.worker_contract_yaml);
  const workerPrompt = textField(receiptWrite.data.worker_prompt);
  const workerReport = textField(receiptWrite.data.worker_report);
  const persistedHandoff = isRecord(receiptWrite.data.dispatch_handoff_packet)
    ? (receiptWrite.data.dispatch_handoff_packet as JsonRecord)
    : isRecord(options.dispatch_handoff_packet)
      ? options.dispatch_handoff_packet
      : {};
  appendMarketingWorkerExecutorPromotionAuditEvent({
    eventId: auditEventId,
    eventLedgerPath,
    occurredAt,
    cardId: taskId,
    boardSlug,
    dbPath,
    dispatchHandoffPacket: persistedHandoff,
    workerContractYaml,
    workerPrompt,
    executorPromotionPacket,
    workerReport,
  });

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
    reason_code: 'KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTED',
    reason_codes: [
      'command_eve.marketing_worker_executor_promoted_local_in_process',
      'command_eve.worker_dispatcher_prepare_verified',
      'command_eve.nl5_no_bypass_verified',
    ],
    message:
      'Local marketing worker executor promoted in-process; no subprocess, external call, publish, schedule or outreach ran.',
    card_id: taskId,
    audit_event_id: auditEventId,
    audit_event_path: eventLedgerPath,
    promotion_event_kind: 'command_eve_marketing_worker_executor_promoted',
    worker_executor_promotion_status: 'completed',
    worker_dispatcher_prepare_status: 'ready',
    executor_promotion_packet: executorPromotionPacket,
    worker_report: workerReport,
    worker_contract_yaml: workerContractYaml,
    worker_prompt: workerPrompt,
    subprocess_spawned: false,
    external_calls: false,
    data_boundary_checked: true,
    controller_approval_status: 'approved',
    controller_approved: true,
    release_blocked: true,
    human_gate: 'HG-3.5',
    dispatch_handoff_packet: persistedHandoff,
    model: board.model,
  };
}

