/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  buildConnectorCatalog,
  type CommandEveConnectorCatalogCard,
  type CommandEveConnectorCatalogOptions,
} from './connectorCatalogCore';

export const COMMAND_EVE_CONNECTOR_PREFLIGHT_BRIDGE_VERSION = 'command-eve-connector-preflight/v0';

export type CommandEveConnectorPreflightStatus = 'ready' | 'blocked' | 'failed';

export type CommandEveConnectorPreflightCheck = {
  id: string;
  ok: boolean;
  required: boolean;
  path?: string;
  detail?: string;
};

export type CommandEveConnectorPreflightReceipt = {
  schema_version: 'command-eve-connector-preflight-receipt/v0';
  ok: boolean;
  connector_id: string;
  checked_at: string;
  reason_code: string;
  checks: CommandEveConnectorPreflightCheck[];
  source: {
    company_os_root: string;
    manifest_path: string;
  };
};

export type CommandEveConnectorPreflightResult = {
  version: typeof COMMAND_EVE_CONNECTOR_PREFLIGHT_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveConnectorPreflightStatus;
  connector_id?: string;
  reason_code?: string;
  message?: string;
  receipt_path?: string;
  audit_event_path?: string;
  audit_event_id?: string;
  receipt?: CommandEveConnectorPreflightReceipt;
};

export type CommandEveConnectorPreflightCommandRequest = {
  id: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
};

export type CommandEveConnectorPreflightCommandResult = {
  ok: boolean;
  exitCode?: number | null;
  error?: string;
};

export type CommandEveConnectorPreflightCommandRunner = (
  request: CommandEveConnectorPreflightCommandRequest
) => CommandEveConnectorPreflightCommandResult;

export type CommandEveConnectorPreflightOptions = CommandEveConnectorCatalogOptions & {
  connectorId: string;
  eventLedgerPath?: string;
  now?: () => Date;
  commandRunner?: CommandEveConnectorPreflightCommandRunner;
};

type LocalCheckSpec = {
  id: string;
  relativePath?: string;
  required: boolean;
  kind: 'directory' | 'file' | 'glob-directory';
};

const SUPPORTED_PREFLIGHT_HANDLERS = new Set([
  'local-company-os-workspace',
  'execution-ledger-plane',
  'github-gitnexus',
]);

const LOCAL_COMPANY_OS_CHECKS: LocalCheckSpec[] = [
  { id: 'company_os_root', required: true, kind: 'directory' },
  {
    id: 'connector_manifest',
    relativePath: 'kits/company-os-kit/.company-os/eve/connector-manifests.json',
    required: true,
    kind: 'file',
  },
  { id: 'company_os_operations', relativePath: '.company-os/operations', required: false, kind: 'directory' },
  {
    id: 'eve_boot_packet',
    relativePath: '.company-os/onboarding/eve-boot-packet.json',
    required: false,
    kind: 'file',
  },
  {
    id: 'intake_record',
    relativePath: '.company-os/onboarding/intake-record.json',
    required: false,
    kind: 'file',
  },
  {
    id: 'company_discovery_brief',
    relativePath: '.company-os/company-discovery-brief.md',
    required: false,
    kind: 'file',
  },
  {
    id: 'company_discovery_reports',
    relativePath: 'reports/company-discovery',
    required: false,
    kind: 'glob-directory',
  },
];

function resultBase(): Pick<CommandEveConnectorPreflightResult, 'version'> {
  return {
    version: COMMAND_EVE_CONNECTOR_PREFLIGHT_BRIDGE_VERSION,
  };
}

function resolveRelativePath(root: string, maybeRelative: string): string {
  return path.isAbsolute(maybeRelative) ? maybeRelative : path.join(root, maybeRelative);
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return undefined;
}

function pathExistsForKind(filePath: string, kind: LocalCheckSpec['kind']): boolean {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (kind === 'directory' || kind === 'glob-directory') return stat.isDirectory();
  return stat.isFile();
}

function defaultCommandRunner(
  request: CommandEveConnectorPreflightCommandRequest
): CommandEveConnectorPreflightCommandResult {
  const result = spawnSync(request.executable, request.args, {
    cwd: request.cwd,
    env: process.env,
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
      error: result.error.message,
    };
  }
  return {
    ok: result.status === 0,
    exitCode: result.status,
  };
}

function buildLocalCompanyOsReceipt(
  connector: CommandEveConnectorCatalogCard,
  companyOsRoot: string,
  manifestPath: string,
  now: () => Date
): CommandEveConnectorPreflightReceipt {
  const checks = LOCAL_COMPANY_OS_CHECKS.map((check) => {
    const checkPath = check.relativePath ? resolveRelativePath(companyOsRoot, check.relativePath) : companyOsRoot;
    const ok = pathExistsForKind(checkPath, check.kind);
    return {
      id: check.id,
      ok,
      required: check.required,
      path: checkPath,
      detail: ok ? undefined : check.required ? 'required path missing' : 'optional path missing',
    };
  });
  const requiredOk = checks.filter((check) => check.required).every((check) => check.ok);

  return {
    schema_version: 'command-eve-connector-preflight-receipt/v0',
    ok: requiredOk,
    connector_id: connector.id,
    checked_at: now().toISOString(),
    reason_code: requiredOk ? 'LOCAL_COMPANY_OS_WORKSPACE_READY' : 'LOCAL_COMPANY_OS_WORKSPACE_INCOMPLETE',
    checks,
    source: {
      company_os_root: companyOsRoot,
      manifest_path: manifestPath,
    },
  };
}

function buildCommandCheck(
  request: CommandEveConnectorPreflightCommandRequest,
  runner: CommandEveConnectorPreflightCommandRunner
): CommandEveConnectorPreflightCheck {
  const result = runner(request);
  return {
    id: request.id,
    ok: result.ok,
    required: true,
    detail: result.ok
      ? `read-only command passed: ${request.executable} ${request.args.join(' ')}`
      : `read-only command failed (${result.exitCode ?? 'unknown'}): ${result.error || 'no output captured'}`,
  };
}

function buildPlaneExecutionLedgerReceipt(
  connector: CommandEveConnectorCatalogCard,
  companyOsRoot: string,
  manifestPath: string,
  now: () => Date,
  runner: CommandEveConnectorPreflightCommandRunner
): CommandEveConnectorPreflightReceipt {
  const scriptPath = path.join(companyOsRoot, 'scripts', 'plane', 'plane-api-sanity.mjs');
  const scriptCheck = {
    id: 'plane_sanity_script',
    ok: pathExistsForKind(scriptPath, 'file'),
    required: true,
    path: scriptPath,
    detail: pathExistsForKind(scriptPath, 'file') ? undefined : 'required read-only Plane sanity script missing',
  };
  const checks: CommandEveConnectorPreflightCheck[] = [scriptCheck];
  if (scriptCheck.ok) {
    checks.push(
      buildCommandCheck(
        {
          id: 'plane_api_sanity_read_only',
          executable: 'node',
          args: ['scripts/plane/plane-api-sanity.mjs', '--workspace', 'companyos', '--auth', 'app-token', '--json'],
          cwd: companyOsRoot,
          timeoutMs: 30_000,
        },
        runner
      )
    );
  }
  const requiredOk = checks.filter((check) => check.required).every((check) => check.ok);

  return {
    schema_version: 'command-eve-connector-preflight-receipt/v0',
    ok: requiredOk,
    connector_id: connector.id,
    checked_at: now().toISOString(),
    reason_code: requiredOk ? 'PLANE_READ_ONLY_PREFLIGHT_READY' : 'PLANE_READ_ONLY_PREFLIGHT_BLOCKED',
    checks,
    source: {
      company_os_root: companyOsRoot,
      manifest_path: manifestPath,
    },
  };
}

function buildGithubGitNexusReceipt(
  connector: CommandEveConnectorCatalogCard,
  companyOsRoot: string,
  manifestPath: string,
  now: () => Date,
  runner: CommandEveConnectorPreflightCommandRunner
): CommandEveConnectorPreflightReceipt {
  const checks: CommandEveConnectorPreflightCheck[] = [
    buildCommandCheck(
      {
        id: 'gh_auth_status',
        executable: 'gh',
        args: ['auth', 'status'],
        cwd: companyOsRoot,
        timeoutMs: 15_000,
      },
      runner
    ),
    buildCommandCheck(
      {
        id: 'gitnexus_status',
        executable: 'gitnexus',
        args: ['status'],
        cwd: companyOsRoot,
        timeoutMs: 15_000,
      },
      runner
    ),
  ];
  const requiredOk = checks.filter((check) => check.required).every((check) => check.ok);

  return {
    schema_version: 'command-eve-connector-preflight-receipt/v0',
    ok: requiredOk,
    connector_id: connector.id,
    checked_at: now().toISOString(),
    reason_code: requiredOk ? 'GITHUB_GITNEXUS_PREFLIGHT_READY' : 'GITHUB_GITNEXUS_PREFLIGHT_BLOCKED',
    checks,
    source: {
      company_os_root: companyOsRoot,
      manifest_path: manifestPath,
    },
  };
}

function buildReceipt(
  connector: CommandEveConnectorCatalogCard,
  companyOsRoot: string,
  manifestPath: string,
  now: () => Date,
  runner: CommandEveConnectorPreflightCommandRunner
): CommandEveConnectorPreflightReceipt {
  if (connector.id === 'execution-ledger-plane') {
    return buildPlaneExecutionLedgerReceipt(connector, companyOsRoot, manifestPath, now, runner);
  }
  if (connector.id === 'github-gitnexus') {
    return buildGithubGitNexusReceipt(connector, companyOsRoot, manifestPath, now, runner);
  }
  return buildLocalCompanyOsReceipt(connector, companyOsRoot, manifestPath, now);
}

function writeReceipt(receiptPath: string, receipt: CommandEveConnectorPreflightReceipt): void {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const tempPath = `${receiptPath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(tempPath, receiptPath);
}

function sanitizeEventIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function resolveAuditEventPath(
  companyOsRoot: string,
  options: Pick<CommandEveConnectorPreflightOptions, 'eventLedgerPath' | 'env'>
): string {
  return (
    firstNonEmpty(
      options.eventLedgerPath,
      options.env?.COMMAND_EVE_AGENT_EVENTS_PATH,
      process.env.COMMAND_EVE_AGENT_EVENTS_PATH
    ) || path.join(companyOsRoot, 'metrics', 'agent-events.jsonl')
  );
}

function buildAuditEvent({
  connector,
  companyOsRoot,
  receipt,
  receiptPath,
}: {
  connector: CommandEveConnectorCatalogCard;
  companyOsRoot: string;
  receipt: CommandEveConnectorPreflightReceipt;
  receiptPath: string;
}): Record<string, unknown> {
  const eventId = [
    'command-eve-connector-preflight',
    sanitizeEventIdPart(connector.id),
    sanitizeEventIdPart(receipt.checked_at),
  ].join('-');

  return {
    schema_version: 'agent-event/v1',
    event_id: eventId,
    event_type: 'connector.preflight_recorded',
    occurred_at: receipt.checked_at,
    producer: 'command-eve-desktop',
    workspace: 'company-os',
    workspace_path: companyOsRoot,
    issue_id: '',
    parent_issue_id: '',
    run_id: `connector-preflight-${connector.id}`,
    session_id: '',
    agent: 'eve',
    mode: 'connector-preflight',
    role_owner: 'Controller',
    department: 'Ops',
    autonomy_level: 'L1',
    event_policy: 'append-only',
    payload: {
      connector_id: connector.id,
      connector_name: connector.name,
      ok: receipt.ok,
      status: receipt.ok ? 'ready' : 'blocked',
      reason_code: receipt.reason_code,
      receipt_path: receiptPath,
      guided_setup_state: connector.guided_setup.state,
      human_gate: connector.human_gate,
      mcp_enable_allowed: false,
      connector_write_allowed: false,
      secret_handling: 'never_in_chat',
    },
    artifact_paths: [receiptPath],
    linear_comment_ids: [],
    human_gate_required: false,
    redaction_level: 'none',
  };
}

function appendAuditEvent(
  eventLedgerPath: string,
  event: Record<string, unknown>
): { eventPath: string; eventId: string } {
  fs.mkdirSync(path.dirname(eventLedgerPath), { recursive: true });
  fs.appendFileSync(eventLedgerPath, `${JSON.stringify(event)}\n`);
  return {
    eventPath: eventLedgerPath,
    eventId: String(event.event_id || ''),
  };
}

export function runConnectorPreflight(
  options: CommandEveConnectorPreflightOptions
): CommandEveConnectorPreflightResult {
  const connectorId = String(options.connectorId || '').trim();
  const base = resultBase();
  if (!connectorId) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'CONNECTOR_ID_REQUIRED',
      message: 'A connector id is required.',
    };
  }

  const catalog = buildConnectorCatalog(options);
  if (!catalog.ok || !catalog.model) {
    return {
      ...base,
      ok: false,
      status: catalog.status === 'failed' ? 'failed' : 'blocked',
      connector_id: connectorId,
      reason_code: catalog.reason_code || 'CONNECTOR_CATALOG_UNAVAILABLE',
      message: catalog.message,
    };
  }

  const connector = catalog.model.connectors.find((entry) => entry.id === connectorId);
  if (!connector) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      connector_id: connectorId,
      reason_code: 'CONNECTOR_NOT_FOUND',
      message: `Connector not found in manifest: ${connectorId}`,
    };
  }

  if (!SUPPORTED_PREFLIGHT_HANDLERS.has(connector.id)) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      connector_id: connectorId,
      reason_code: 'CONNECTOR_PREFLIGHT_HANDLER_MISSING',
      message: `No internal read-only preflight handler is available for ${connectorId}.`,
    };
  }

  const companyOsRoot = catalog.model.source.company_os_root;
  const manifestPath = catalog.model.source.manifest_path;
  if (!companyOsRoot || !manifestPath) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      connector_id: connectorId,
      reason_code: 'CONNECTOR_PREFLIGHT_SOURCE_MISSING',
      message: 'Company.OS root and connector manifest path are required.',
    };
  }

  const receiptPath = connector.preflight_result_file
    ? resolveRelativePath(companyOsRoot, connector.preflight_result_file)
    : undefined;
  if (!receiptPath) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      connector_id: connectorId,
      reason_code: 'CONNECTOR_PREFLIGHT_RECEIPT_PATH_MISSING',
      message: `Connector ${connectorId} does not declare a preflight_result_file.`,
    };
  }

  try {
    const receipt = buildReceipt(
      connector,
      companyOsRoot,
      manifestPath,
      options.now ?? (() => new Date()),
      options.commandRunner ?? defaultCommandRunner
    );
    writeReceipt(receiptPath, receipt);
    const audit = appendAuditEvent(
      resolveAuditEventPath(companyOsRoot, options),
      buildAuditEvent({
        connector,
        companyOsRoot,
        receipt,
        receiptPath,
      })
    );
    return {
      ...base,
      ok: receipt.ok,
      status: receipt.ok ? 'ready' : 'blocked',
      connector_id: connectorId,
      reason_code: receipt.reason_code,
      receipt_path: receiptPath,
      audit_event_path: audit.eventPath,
      audit_event_id: audit.eventId,
      receipt,
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      connector_id: connectorId,
      reason_code: 'CONNECTOR_PREFLIGHT_WRITE_FAILED',
      message: error instanceof Error ? error.message : 'Connector preflight receipt/audit event could not be written.',
      receipt_path: receiptPath,
    };
  }
}
