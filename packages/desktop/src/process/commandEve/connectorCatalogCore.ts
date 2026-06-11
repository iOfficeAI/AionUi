/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

export const COMMAND_EVE_CONNECTOR_CATALOG_BRIDGE_VERSION = 'command-eve-connector-catalog/v0';

export type CommandEveConnectorEvidenceState =
  | 'installed'
  | 'available'
  | 'needs_auth'
  | 'unverified'
  | 'gated'
  | 'connected'
  | 'blocked';

export type CommandEveConnectorCatalogStatus = 'ready' | 'blocked' | 'failed';

export type CommandEveConnectorGuidedSetupState =
  | 'connected'
  | 'preflight_required'
  | 'auth_required'
  | 'humangate_required'
  | 'blocked';

export type CommandEveConnectorGuidedSetupAction =
  | 'view_receipt'
  | 'run_read_only_preflight'
  | 'guided_auth_setup'
  | 'request_humangate'
  | 'inspect_blocker';

export type CommandEveConnectorGuidedSetup = {
  state: CommandEveConnectorGuidedSetupState;
  primary_action: CommandEveConnectorGuidedSetupAction;
  reason_code: string;
  mcp_enable_allowed: false;
  connector_write_allowed: false;
  secret_handling: 'never_in_chat';
  requires_preflight: boolean;
  requires_human_gate?: string;
  receipt_path?: string;
};

export type CommandEveConnectorMcpEnablePolicy = {
  allowed: false;
  reason_code: 'READ_ONLY_CATALOG' | 'HUMANGATE_AND_PREFLIGHT_REQUIRED';
  blocked_transports: Array<'http' | 'sse' | 'streamable_http'>;
  secret_handling: 'never_in_chat';
  connector_write_allowed: false;
  safe_surface: 'guided_preflight_receipts_only';
};

export type CommandEveConnectorManifestPolicy = {
  default_mode?: string;
  setup_order?: string;
  secret_rule?: string;
  write_rule?: string;
  state_authority?: string;
  ui_state_model?: Record<string, unknown>;
};

export type CommandEveConnectorManifestConnector = {
  id: string;
  name: string;
  tier: string;
  purpose: string;
  required_for: string[];
  auth_method: string;
  auth_surface: string;
  setup_mode: string;
  safe_preflight: string[];
  verify_command: string;
  allowed_actions: string[];
  blocked_actions: string[];
  human_gate: string;
  memory_policy: string;
  preflight_result_file: string;
};

export type CommandEveConnectorPreflight = {
  ok: boolean | null;
  checked_at?: string;
  error?: string;
  reason_code?: string;
  evidence_path?: string;
  source_path?: string;
};

export type CommandEveConnectorCatalogCard = CommandEveConnectorManifestConnector & {
  evidence_state: CommandEveConnectorEvidenceState;
  latest_preflight: CommandEveConnectorPreflight | null;
  guided_setup: CommandEveConnectorGuidedSetup;
};

export type CommandEveConnectorCatalogModel = {
  schema_version: 'command-eve-connector-catalog/v0';
  generated_at: string;
  read_only: true;
  policy: CommandEveConnectorManifestPolicy;
  source: {
    company_os_root?: string;
    manifest_path: string;
    preflight_base?: string;
  };
  summary: Record<CommandEveConnectorEvidenceState, number>;
  mcp_enable_policy: CommandEveConnectorMcpEnablePolicy;
  connectors: CommandEveConnectorCatalogCard[];
  blocked_actions: string[];
};

export type CommandEveConnectorCatalogBridgeResult = {
  version: typeof COMMAND_EVE_CONNECTOR_CATALOG_BRIDGE_VERSION;
  status: CommandEveConnectorCatalogStatus;
  ok: boolean;
  reason_code?: string;
  message?: string;
  model?: CommandEveConnectorCatalogModel;
  source: {
    company_os_root?: string;
    manifest_path?: string;
    generated_by: 'command-eve-connector-catalog-core';
  };
};

export type CommandEveConnectorCatalogOptions = {
  companyOsRoot?: string;
  manifestPath?: string;
  env?: NodeJS.ProcessEnv;
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_CONNECTOR_MANIFEST = 'kits/company-os-kit/.company-os/eve/connector-manifests.json';
const CONNECTOR_STATES: CommandEveConnectorEvidenceState[] = [
  'installed',
  'available',
  'needs_auth',
  'unverified',
  'gated',
  'connected',
  'blocked',
];
const READ_ONLY_PREFLIGHT_CONNECTOR_IDS = new Set([
  'local-company-os-workspace',
  'execution-ledger-plane',
  'github-gitnexus',
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return undefined;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

function asBooleanOrNull(record: JsonRecord): boolean | null {
  for (const key of ['ok', 'success', 'passed']) {
    if (typeof record[key] === 'boolean') return record[key];
  }
  return null;
}

function normalizeConnector(value: unknown): CommandEveConnectorManifestConnector | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id).trim();
  const name = asString(value.name).trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    tier: asString(value.tier).trim(),
    purpose: asString(value.purpose).trim(),
    required_for: asStringArray(value.required_for),
    auth_method: asString(value.auth_method).trim(),
    auth_surface: asString(value.auth_surface).trim(),
    setup_mode: asString(value.setup_mode).trim(),
    safe_preflight: asStringArray(value.safe_preflight),
    verify_command: asString(value.verify_command).trim(),
    allowed_actions: asStringArray(value.allowed_actions),
    blocked_actions: asStringArray(value.blocked_actions),
    human_gate: asString(value.human_gate).trim(),
    memory_policy: asString(value.memory_policy).trim(),
    preflight_result_file: asString(value.preflight_result_file).trim(),
  };
}

function resolveRelativePath(root: string | undefined, maybeRelative: string): string | undefined {
  const text = maybeRelative.trim();
  if (!text) return undefined;
  if (path.isAbsolute(text)) return text;
  return root ? path.join(root, text) : undefined;
}

function resolveConnectorManifestSource(options: CommandEveConnectorCatalogOptions): {
  companyOsRoot?: string;
  manifestPath?: string;
} {
  const env = options.env ?? process.env;
  const companyOsRoot = firstNonEmpty(
    options.companyOsRoot,
    env.COMMAND_EVE_COMPANY_OS_ROOT,
    env.COMPANY_OS_ROOT,
    env.COMMAND_EVE_SOURCE_ROOT
  );
  const manifestPath = firstNonEmpty(
    options.manifestPath,
    env.COMMAND_EVE_CONNECTOR_MANIFEST_PATH,
    companyOsRoot ? path.join(companyOsRoot, DEFAULT_CONNECTOR_MANIFEST) : undefined
  );
  return { companyOsRoot, manifestPath };
}

function readLatestPreflight(
  connector: CommandEveConnectorManifestConnector,
  companyOsRoot: string | undefined
): CommandEveConnectorPreflight | null {
  const preflightPath = resolveRelativePath(companyOsRoot, connector.preflight_result_file);
  if (!preflightPath || !fs.existsSync(preflightPath)) return null;

  try {
    const raw = readJsonFile(preflightPath);
    if (!isRecord(raw)) {
      return {
        ok: false,
        reason_code: 'PREFLIGHT_JSON_INVALID',
        error: 'Preflight result is not a JSON object.',
        source_path: preflightPath,
      };
    }

    return {
      ok: asBooleanOrNull(raw),
      checked_at: firstNonEmpty(
        asString(raw.checked_at),
        asString(raw.generated_at),
        asString(raw.created_at),
        asString(raw.timestamp)
      ),
      reason_code: firstNonEmpty(asString(raw.reason_code), asString(raw.code), asString(raw.status)),
      error: firstNonEmpty(asString(raw.error), asString(raw.message)),
      evidence_path: firstNonEmpty(asString(raw.evidence_path), asString(raw.report_path), asString(raw.receipt_path)),
      source_path: preflightPath,
    };
  } catch (error) {
    return {
      ok: false,
      reason_code: 'PREFLIGHT_JSON_INVALID',
      error: error instanceof Error ? error.message : 'Preflight result could not be parsed.',
      source_path: preflightPath,
    };
  }
}

function isGatedConnector(connector: CommandEveConnectorManifestConnector): boolean {
  const text = `${connector.tier} ${connector.setup_mode} ${connector.human_gate}`.toLowerCase();
  return text.includes('gated') || text.includes('hg-3') || text.includes('hg-4');
}

function needsAuth(connector: CommandEveConnectorManifestConnector): boolean {
  const text = `${connector.auth_method} ${connector.auth_surface} ${connector.setup_mode}`.toLowerCase();
  return /oauth|api|token|provider|account|workspace|mail|stripe|supabase|vercel|github|honcho/.test(text);
}

function hasInternalReadOnlyPreflight(connector: CommandEveConnectorManifestConnector): boolean {
  return READ_ONLY_PREFLIGHT_CONNECTOR_IDS.has(connector.id);
}

function deriveEvidenceState(
  connector: CommandEveConnectorManifestConnector,
  latestPreflight: CommandEveConnectorPreflight | null
): CommandEveConnectorEvidenceState {
  const gated = isGatedConnector(connector);

  if (latestPreflight) {
    if (latestPreflight.ok === false) return 'blocked';
    if (latestPreflight.ok === true) {
      return gated ? 'gated' : 'connected';
    }
  }

  if (gated) return 'gated';
  if (connector.setup_mode === 'bootstrap') return 'installed';
  if (needsAuth(connector)) return 'needs_auth';
  return 'unverified';
}

function deriveGuidedSetup(
  connector: CommandEveConnectorManifestConnector,
  evidenceState: CommandEveConnectorEvidenceState,
  latestPreflight: CommandEveConnectorPreflight | null
): CommandEveConnectorGuidedSetup {
  const base = {
    mcp_enable_allowed: false as const,
    connector_write_allowed: false as const,
    secret_handling: 'never_in_chat' as const,
    receipt_path: latestPreflight?.source_path,
  };

  if (evidenceState === 'connected') {
    return {
      ...base,
      state: 'connected',
      primary_action: 'view_receipt',
      reason_code: 'PREFLIGHT_CONNECTED_VIEW_ONLY',
      requires_preflight: false,
    };
  }

  if (evidenceState === 'blocked') {
    return {
      ...base,
      state: 'blocked',
      primary_action: 'inspect_blocker',
      reason_code: latestPreflight?.reason_code || 'PREFLIGHT_BLOCKED',
      requires_preflight: true,
      requires_human_gate: connector.human_gate || undefined,
    };
  }

  if (hasInternalReadOnlyPreflight(connector)) {
    return {
      ...base,
      state: 'preflight_required',
      primary_action: 'run_read_only_preflight',
      reason_code: 'READ_ONLY_PREFLIGHT_REQUIRED',
      requires_preflight: true,
      requires_human_gate: connector.human_gate || undefined,
    };
  }

  if (evidenceState === 'gated') {
    return {
      ...base,
      state: 'humangate_required',
      primary_action: 'request_humangate',
      reason_code: 'HUMANGATE_REQUIRED_BEFORE_ENABLE',
      requires_preflight: true,
      requires_human_gate: connector.human_gate || undefined,
    };
  }

  if (evidenceState === 'needs_auth') {
    return {
      ...base,
      state: 'auth_required',
      primary_action: 'guided_auth_setup',
      reason_code: 'AUTH_REQUIRED_BEFORE_PREFLIGHT',
      requires_preflight: true,
      requires_human_gate: connector.human_gate || undefined,
    };
  }

  return {
    ...base,
    state: 'preflight_required',
    primary_action: 'run_read_only_preflight',
    reason_code: 'READ_ONLY_PREFLIGHT_REQUIRED',
    requires_preflight: true,
    requires_human_gate: connector.human_gate || undefined,
  };
}

function globalMcpEnablePolicy(): CommandEveConnectorMcpEnablePolicy {
  return {
    allowed: false,
    reason_code: 'HUMANGATE_AND_PREFLIGHT_REQUIRED',
    blocked_transports: ['http', 'sse', 'streamable_http'],
    secret_handling: 'never_in_chat',
    connector_write_allowed: false,
    safe_surface: 'guided_preflight_receipts_only',
  };
}

function emptySummary(): Record<CommandEveConnectorEvidenceState, number> {
  return CONNECTOR_STATES.reduce(
    (summary, state) => ({
      ...summary,
      [state]: 0,
    }),
    {} as Record<CommandEveConnectorEvidenceState, number>
  );
}

function resultBase(
  source: CommandEveConnectorCatalogBridgeResult['source']
): Pick<CommandEveConnectorCatalogBridgeResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_CONNECTOR_CATALOG_BRIDGE_VERSION,
    source,
  };
}

export function resolveConnectorCatalogSource(options: CommandEveConnectorCatalogOptions = {}): {
  company_os_root?: string;
  manifest_path?: string;
} {
  const source = resolveConnectorManifestSource(options);
  return {
    company_os_root: source.companyOsRoot,
    manifest_path: source.manifestPath,
  };
}

export function buildConnectorCatalog(
  options: CommandEveConnectorCatalogOptions = {}
): CommandEveConnectorCatalogBridgeResult {
  const source = resolveConnectorManifestSource(options);
  const base = resultBase({
    company_os_root: source.companyOsRoot,
    manifest_path: source.manifestPath,
    generated_by: 'command-eve-connector-catalog-core',
  });

  if (!source.manifestPath) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'CONNECTOR_MANIFEST_SOURCE_MISSING',
      message: 'COMMAND_EVE_COMPANY_OS_ROOT or COMMAND_EVE_CONNECTOR_MANIFEST_PATH is required.',
    };
  }

  if (!fs.existsSync(source.manifestPath)) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'CONNECTOR_MANIFEST_MISSING',
      message: `Missing Command EVE connector manifest: ${source.manifestPath}`,
    };
  }

  try {
    const raw = readJsonFile(source.manifestPath);
    if (!isRecord(raw) || raw.version !== 'eve-connector-manifest/v0' || !Array.isArray(raw.connectors)) {
      return {
        ...base,
        ok: false,
        status: 'failed',
        reason_code: 'CONNECTOR_MANIFEST_SCHEMA_MISMATCH',
        message: 'Unsupported Command EVE connector manifest schema.',
      };
    }

    const policy = isRecord(raw.policy) ? raw.policy : {};
    const connectors = raw.connectors
      .map((entry) => normalizeConnector(entry))
      .filter((entry): entry is CommandEveConnectorManifestConnector => entry !== null)
      .map((connector) => {
        const latestPreflight = readLatestPreflight(connector, source.companyOsRoot);
        const evidenceState = deriveEvidenceState(connector, latestPreflight);
        return {
          ...connector,
          latest_preflight: latestPreflight,
          evidence_state: evidenceState,
          guided_setup: deriveGuidedSetup(connector, evidenceState, latestPreflight),
        };
      });

    const summary = emptySummary();
    for (const connector of connectors) {
      summary[connector.evidence_state] += 1;
    }

    return {
      ...base,
      ok: true,
      status: 'ready',
      model: {
        schema_version: 'command-eve-connector-catalog/v0',
        generated_at: new Date().toISOString(),
        read_only: true,
        policy,
        source: {
          company_os_root: source.companyOsRoot,
          manifest_path: source.manifestPath,
          preflight_base: source.companyOsRoot
            ? path.join(source.companyOsRoot, '.company-os', 'operations', 'preflight-results')
            : undefined,
        },
        summary,
        mcp_enable_policy: globalMcpEnablePolicy(),
        connectors,
        blocked_actions: [
          'raw_mcp_add',
          'raw_api_key_edit',
          'raw_pairing',
          'connector_write_without_human_gate',
          'cron_or_dispatcher_auto_enable',
        ],
      },
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'CONNECTOR_MANIFEST_JSON_INVALID',
      message: error instanceof Error ? error.message : 'Connector manifest could not be parsed.',
    };
  }
}
