/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import childProcess from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

export const COMMAND_EVE_RUNTIME_BOOTSTRAP_VERSION = 'command-eve-runtime-bootstrap/v0';

const ONE_GB = 1024 ** 3;
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_EGRESS_PROXY_URL = 'http://127.0.0.1:25811';
const DEFAULT_MODEL_REF = 'gemma4:e4b';
const DEFAULT_HERMES_VERSION = '0.16.0';
const DEFAULT_HERMES_PACKAGE = 'hermes-agent';
const DEFAULT_FAST_CONTEXT_LENGTH = 65_536;
const DEFAULT_LONG_CONTEXT_LENGTH = 65_536;
const DEFAULT_HERMES_MAX_TOKENS = 512;
const COMMAND_EVE_OLLAMA_MODEL_PREFIX = 'command-eve';
const BUNDLED_HERMES_DIR = 'bundled-hermes';
const COMMAND_EVE_CAPABILITIES_FILE = 'command-eve-capabilities.json';
const COMMAND_EVE_MANAGED_SKILLS_DIR = 'skills-command-eve';
const COMMAND_EVE_RUNTIME_RECONCILIATION_FILE = 'command-eve-runtime-reconciliation.json';
const DEFAULT_STAGE_TIMEOUT_MS = 120_000;
const DEFAULT_LONG_STAGE_TIMEOUT_MS = 2_700_000;
const PYTHON_BINARY_CANDIDATES = ['python3.13', 'python3.12', 'python3.11', 'python3'];
const LOCAL_OLLAMA_BINARY_CANDIDATES =
  process.platform === 'darwin'
    ? ['/Applications/Ollama.app/Contents/Resources/ollama', '/opt/homebrew/bin/ollama', '/usr/local/bin/ollama']
    : process.platform === 'win32'
      ? []
      : ['/usr/local/bin/ollama', '/usr/bin/ollama', '/snap/bin/ollama'];
const COMMAND_EVE_HERMES_DISABLED_SKILLS = [
  'red-teaming/godmode',
  'blockchain',
  'gaming',
  'health/neuroskill-bci',
  'mlops',
  'wecom',
  'weixin',
  'feishu',
  'dingtalk',
];

export type RuntimeBootstrapMode = 'auto' | 'check' | 'off';

export type RuntimeBootstrapStageStatus = 'pass' | 'skip' | 'blocked' | 'failed';

export type RuntimeBootstrapStageId =
  | 'manifest'
  | 'directories'
  | 'capabilities'
  | 'capacity'
  | 'python'
  | 'hermes'
  | 'ollama'
  | 'model'
  | 'identity';

export type RuntimeBootstrapIdentitySource = 'env' | 'macos_full_name' | 'os_user' | 'unverified';

export type RuntimeBootstrapIdentityConfidence = 'verified' | 'needs_confirmation' | 'placeholder';

export type RuntimeBootstrapIdentityProfile = {
  version: 'command-eve-first-run-profile/v0';
  source: RuntimeBootstrapIdentitySource;
  confidence: RuntimeBootstrapIdentityConfidence;
  needs_confirmation: boolean;
  updated_at: string;
  founder_name?: string;
  company_name?: string;
};

export type RuntimeBootstrapCommandResult = {
  command: string;
  args?: string[];
  ok: boolean;
  status?: number | null;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
  error?: string;
};

export type RuntimeBootstrapStage = {
  id: RuntimeBootstrapStageId;
  status: RuntimeBootstrapStageStatus;
  code?: string;
  detail?: string;
  command?: string;
  duration_ms?: number;
};

export type RuntimeBootstrapTier = {
  id: string;
  label: string;
  model_ref: string;
  default?: boolean;
  context_length?: number;
  ollama_num_ctx?: number;
  max_tokens?: number;
  min_unified_memory_gb: number;
  min_free_disk_gb: number;
};

export type CommandEveCapabilityPack = {
  version: string;
  release: string;
  policy: {
    default_mode: 'proposal_only' | 'read_only_first';
    secret_rule: string;
    write_rule: string;
  };
  skills: Array<{
    id: string;
    name: string;
    tier: 'core' | 'autonomy_core' | 'department' | 'gated_department';
    source: string;
    default_state: 'active' | 'available' | 'gated';
  }>;
  connectors: Array<{
    id: string;
    name: string;
    tier: 'core' | 'autonomy_core' | 'recommended' | 'gated' | 'optional_gated';
    setup_mode: string;
    default_state: 'installed' | 'needs_auth' | 'unverified' | 'gated';
    human_gate: string;
  }>;
};

export type CommandEveRuntimeReconciliation = {
  version: 'command-eve-runtime-reconciliation/v0';
  managed_skill_dir: string;
  executable_skill_ids: string[];
  prompt_label_skill_ids: string[];
  gated_skill_ids: string[];
  connector_ids: string[];
  hermes_config: {
    mcp_servers: string[];
    skills_external_dirs: string[];
    disabled_skills: string[];
    kanban_dispatch_in_gateway: false;
    kanban_auto_decompose: false;
  };
  blocked_external_mcp_transports: Array<'http' | 'sse'>;
  warnings: string[];
};

export type RuntimeBootstrapManifest = {
  version: string;
  release: string;
  hermes: {
    package: string;
    version: string;
    extras: string[];
  };
  local_runtime: {
    provider: 'ollama';
    base_url: string;
    egress_proxy_url: string;
    default_tier_id: string;
    tiers: RuntimeBootstrapTier[];
  };
  installer_policy: {
    allow_homebrew_install: boolean;
    allow_model_pull: boolean;
    model_weights_in_app_bundle: false;
    fail_closed_reason_codes: string[];
  };
};

export type RuntimeBootstrapPaths = {
  userDataPath: string;
  runtimeRoot: string;
  receiptPath: string;
  modelWarmupReceiptPath: string;
  capabilitiesRoot: string;
  capabilityPack: string;
  hermesRoot: string;
  hermesHome: string;
  hermesVenv: string;
  hermesWrapper: string;
  hermesShim: string;
  managedSkillsRoot: string;
  runtimeReconciliation: string;
  firstRunProfile: string;
};

export type RuntimeBootstrapReceipt = {
  version: string;
  app_release: string;
  mode: RuntimeBootstrapMode;
  status: 'ready' | 'blocked' | 'failed' | 'skipped';
  started_at: string;
  completed_at: string;
  runtime_root: string;
  hermes_home: string;
  provider: 'ollama';
  default_model: string;
  base_model?: string;
  ollama_base_url: string;
  egress_proxy_url: string;
  stages: RuntimeBootstrapStage[];
  next_action: string;
  warnings: string[];
  capabilities: {
    skills: number;
    connectors: number;
    capability_pack: string;
  };
  identity?: RuntimeBootstrapIdentityProfile & {
    profile_path: string;
  };
};

export type RuntimeBootstrapRunner = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
) => Promise<RuntimeBootstrapCommandResult>;

export type RuntimeBootstrapDetachedSpawner = (
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv }
) => void;

export type RuntimeBootstrapOptions = {
  userDataPath: string;
  appPath?: string;
  resourcesPath?: string;
  manifestPath?: string;
  capabilityManifestPath?: string;
  mode?: RuntimeBootstrapMode;
  env?: NodeJS.ProcessEnv;
  runner?: RuntimeBootstrapRunner;
  detachedSpawner?: RuntimeBootstrapDetachedSpawner;
  now?: () => Date;
  statfs?: (targetPath: string) => { bavail: number; bsize: number };
  totalMemoryBytes?: number;
  ollamaBinaryCandidates?: string[];
  bundledHermesWheelCandidates?: string[];
  displayNameLookup?: () => string;
};

export const DEFAULT_COMMAND_EVE_CAPABILITY_PACK: CommandEveCapabilityPack = {
  version: 'command-eve-capability-pack/v0',
  release: '1.0.0-alpha.5',
  policy: {
    default_mode: 'proposal_only',
    secret_rule: 'Never ask for passwords, cookies, recovery codes, raw tokens or .env contents in chat.',
    write_rule: 'Write-capable connectors require CEO/Codex review and the matching HumanGate before use.',
  },
  skills: [
    {
      id: 'first-run-company-discovery',
      name: 'First-run company discovery',
      tier: 'core',
      source: 'Command EVE first-run skill pack',
      default_state: 'active',
    },
    {
      id: 'system-inventory',
      name: 'Existing system inventory',
      tier: 'core',
      source: 'Command EVE first-run skill pack',
      default_state: 'active',
    },
    {
      id: 'connector-setup',
      name: 'Connector setup and verification',
      tier: 'core',
      source: 'Command EVE connector manifest',
      default_state: 'active',
    },
    {
      id: 'memory-ledger-setup',
      name: 'Memory and local ledger setup',
      tier: 'autonomy_core',
      source: 'Command EVE runtime policy',
      default_state: 'active',
    },
    {
      id: 'goal-materialization',
      name: 'Founder intent to CEO delegation and worker contracts',
      tier: 'autonomy_core',
      source: 'Company.OS worker contract doctrine',
      default_state: 'active',
    },
    {
      id: 'content-machine',
      name: 'Content Machine',
      tier: 'department',
      source: 'aionui-hermes-content-machine-skill',
      default_state: 'available',
    },
    {
      id: 'blog-department',
      name: 'Blog Department',
      tier: 'department',
      source: 'aionui-hermes-blog-department-skill',
      default_state: 'available',
    },
    {
      id: 'video-first-content-engine',
      name: 'Video-first Content Engine',
      tier: 'department',
      source: 'aionui-hermes-video-first-content-engine-skill',
      default_state: 'available',
    },
    {
      id: 'department-pack-creator',
      name: 'Department Capability Pack Creator',
      tier: 'department',
      source: 'aionui-hermes-department-pack-creator-skill',
      default_state: 'available',
    },
    {
      id: 'security-fortress-review',
      name: 'Security and Fortress review routing',
      tier: 'gated_department',
      source: 'Company.OS security productization gates',
      default_state: 'gated',
    },
    {
      id: 'local-kanban-ledger',
      name: 'Local Kanban and work-item ledger',
      tier: 'autonomy_core',
      source: 'Command EVE local ledger doctrine',
      default_state: 'available',
    },
    {
      id: 'voice-first-run',
      name: 'Voice first-run and speech IO',
      tier: 'autonomy_core',
      source: 'Command EVE L1 voice control plane',
      default_state: 'available',
    },
    {
      id: 'desktop-observation',
      name: 'Desktop observation and short command mode',
      tier: 'gated_department',
      source: 'Command EVE L1 screen/desktop policy',
      default_state: 'gated',
    },
    {
      id: 'crm-department',
      name: 'CRM and relationship operating layer',
      tier: 'department',
      source: 'Company.OS revenue department roadmap',
      default_state: 'available',
    },
  ],
  connectors: [
    {
      id: 'local-command-eve-runtime',
      name: 'Local Command EVE runtime',
      tier: 'core',
      setup_mode: 'bootstrap',
      default_state: 'installed',
      human_gate: 'HG-1 before persisting corrected company facts',
    },
    {
      id: 'hermes-gemma-ollama',
      name: 'Hermes + Gemma via Ollama',
      tier: 'core',
      setup_mode: 'bootstrap',
      default_state: 'installed',
      human_gate: 'HG-2 before changing runtime auth/model defaults',
    },
    {
      id: 'local-work-item-ledger',
      name: 'Local work-item ledger',
      tier: 'core',
      setup_mode: 'bootstrap',
      default_state: 'unverified',
      human_gate: 'HG-2 before durable state migration',
    },
    {
      id: 'codex-cli',
      name: 'Codex CLI',
      tier: 'autonomy_core',
      setup_mode: 'guided_connector',
      default_state: 'unverified',
      human_gate: 'HG-2.5 before worker dispatch',
    },
    {
      id: 'claude-code-cli',
      name: 'Claude Code CLI',
      tier: 'autonomy_core',
      setup_mode: 'guided_connector',
      default_state: 'unverified',
      human_gate: 'HG-2.5 before worker dispatch',
    },
    {
      id: 'github-gitnexus',
      name: 'GitHub + GitNexus',
      tier: 'autonomy_core',
      setup_mode: 'guided_connector',
      default_state: 'needs_auth',
      human_gate: 'HG-3 before write-capable GitHub actions',
    },
    {
      id: 'honcho-memory',
      name: 'Honcho Memory',
      tier: 'autonomy_core',
      setup_mode: 'guided_connector',
      default_state: 'needs_auth',
      human_gate: 'HG-2 before first durable memory write',
    },
    {
      id: 'plane-sync',
      name: 'Plane sync surface',
      tier: 'recommended',
      setup_mode: 'optional_sync_connector',
      default_state: 'needs_auth',
      human_gate: 'HG-3 before write-capable ledger changes',
    },
    {
      id: 'google-workspace',
      name: 'Google Calendar + Drive',
      tier: 'recommended',
      setup_mode: 'guided_connector',
      default_state: 'needs_auth',
      human_gate: 'HG-2 for read scopes; HG-3 for write/share actions',
    },
    {
      id: 'local-filesystem-workspaces',
      name: 'Local filesystem workspaces',
      tier: 'autonomy_core',
      setup_mode: 'permissioned_local_connector',
      default_state: 'unverified',
      human_gate: 'HG-2 before reading selected workspaces; HG-3 before file writes',
    },
    {
      id: 'macos-desktop-observation',
      name: 'macOS screen and app context',
      tier: 'gated',
      setup_mode: 'permissioned_local_connector',
      default_state: 'gated',
      human_gate: 'HG-3 before screen observation; HG-4 before unattended desktop actions',
    },
    {
      id: 'local-voice-io',
      name: 'Local voice input and speech output',
      tier: 'recommended',
      setup_mode: 'permissioned_local_connector',
      default_state: 'unverified',
      human_gate: 'HG-2 before microphone/speaker access',
    },
    {
      id: 'mcp-connectors',
      name: 'MCP connector registry',
      tier: 'recommended',
      setup_mode: 'guided_connector',
      default_state: 'unverified',
      human_gate: 'HG-2.5 before enabling tool access; HG-3 for write-capable MCPs',
    },
    {
      id: 'product-backend-stack',
      name: 'Supabase + Vercel + Stripe',
      tier: 'gated',
      setup_mode: 'deferred_gated_connector',
      default_state: 'gated',
      human_gate: 'HG-3/HG-4 for production/customer-impacting actions',
    },
    {
      id: 'marketing-publishing-stack',
      name: 'Upload-Post + Social + Analytics',
      tier: 'optional_gated',
      setup_mode: 'deferred_gated_connector',
      default_state: 'gated',
      human_gate: 'HG-4 before public publishing or brand voice changes',
    },
    {
      id: 'crm-revenue-stack',
      name: 'CRM + sales/revenue data',
      tier: 'optional_gated',
      setup_mode: 'deferred_gated_connector',
      default_state: 'gated',
      human_gate: 'HG-4 before customer-impacting CRM writes or outreach',
    },
    {
      id: 'command-eve-update-channel',
      name: 'Command EVE update channel',
      tier: 'core',
      setup_mode: 'bootstrap',
      default_state: 'unverified',
      human_gate: 'HG-2 before applying updates; HG-3 before changing release channel',
    },
    {
      id: 'license-entitlements',
      name: 'Account licensing and entitlements',
      tier: 'gated',
      setup_mode: 'deferred_gated_connector',
      default_state: 'gated',
      human_gate: 'HG-4 before billing, seat or entitlement changes',
    },
  ],
};

type CommandLookup = {
  ok: boolean;
  path: string;
};

type PythonLookup = CommandLookup & {
  version?: string;
  foundUnsupported?: string;
};

export const DEFAULT_RUNTIME_BOOTSTRAP_MANIFEST: RuntimeBootstrapManifest = {
  version: 'command-eve-runtime-bootstrap-manifest/v0',
  release: '1.0.0-alpha.5',
  hermes: {
    package: DEFAULT_HERMES_PACKAGE,
    version: DEFAULT_HERMES_VERSION,
    extras: ['acp'],
  },
  local_runtime: {
    provider: 'ollama',
    base_url: DEFAULT_OLLAMA_BASE_URL,
    egress_proxy_url: DEFAULT_EGRESS_PROXY_URL,
    default_tier_id: 'gemma-4-e4b-local-default',
    tiers: [
      {
        id: 'gemma-4-e4b-local-default',
        label: 'Gemma 4 E4B local default',
        model_ref: DEFAULT_MODEL_REF,
        default: true,
        context_length: DEFAULT_FAST_CONTEXT_LENGTH,
        ollama_num_ctx: DEFAULT_FAST_CONTEXT_LENGTH,
        max_tokens: DEFAULT_HERMES_MAX_TOKENS,
        min_unified_memory_gb: 16,
        min_free_disk_gb: 10,
      },
      {
        id: 'gemma-4-12b-local-planning',
        label: 'Gemma 4 12B local planning opt-in',
        model_ref: 'gemma4:12b',
        context_length: DEFAULT_LONG_CONTEXT_LENGTH,
        ollama_num_ctx: DEFAULT_LONG_CONTEXT_LENGTH,
        max_tokens: DEFAULT_HERMES_MAX_TOKENS,
        min_unified_memory_gb: 16,
        min_free_disk_gb: 20,
      },
      {
        id: 'gemma-4-31b-local-pro',
        label: 'Gemma 4 31B local pro opt-in',
        model_ref: 'gemma4:31b',
        context_length: DEFAULT_LONG_CONTEXT_LENGTH,
        ollama_num_ctx: DEFAULT_LONG_CONTEXT_LENGTH,
        max_tokens: DEFAULT_HERMES_MAX_TOKENS,
        min_unified_memory_gb: 64,
        min_free_disk_gb: 45,
      },
    ],
  },
  installer_policy: {
    allow_homebrew_install: true,
    allow_model_pull: true,
    model_weights_in_app_bundle: false,
    fail_closed_reason_codes: ['BLOCKED_RAM', 'BLOCKED_DISK', 'OLLAMA_MISSING', 'MODEL_NOT_FETCHED'],
  },
};

const compact = (value: unknown): string => String(value ?? '').trim();

const scrubOutput = (value: unknown): string => compact(value).slice(0, 1200);

const normalizeIdentityText = (value: unknown): string =>
  compact(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120);

const roundGb = (bytes: number): number => Math.round((bytes / ONE_GB) * 10) / 10;

const safeCommandName = (command: string): boolean => /^[a-zA-Z0-9._+-]{1,80}$/.test(command);

const safeModelRef = (modelRef: string): boolean => /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,127}$/.test(modelRef);

const safePythonPackage = (packageName: string): boolean => /^[a-zA-Z0-9_.-]{1,80}$/.test(packageName);

const safePythonExtra = (extra: string): boolean => /^[a-zA-Z0-9_.-]{1,40}$/.test(extra);

const safeVersion = (version: string): boolean => /^[a-zA-Z0-9_.+-]{1,80}$/.test(version);

const safeCapabilityId = (id: string): boolean => /^[a-z0-9][a-z0-9_.-]{1,96}$/.test(id);

const PLACEHOLDER_USER_NAMES = new Set(['admin', 'default', 'root', 'system_default_user', 'user', 'unknown']);

function isPlaceholderIdentityName(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '_');
  return !normalized || PLACEHOLDER_USER_NAMES.has(normalized);
}

function defaultDisplayNameLookup(): string {
  if (process.platform !== 'darwin') return '';
  try {
    return childProcess.execFileSync('id', ['-F'], { encoding: 'utf8', timeout: 2000 });
  } catch {
    return '';
  }
}

const isLoopbackHttpUrl = (urlText: string): boolean => {
  try {
    const url = new URL(urlText);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
};

function normalizeContextLength(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(4_096, Math.min(262_144, Math.floor(numeric)));
}

function tierContextLength(tier: RuntimeBootstrapTier): number {
  return normalizeContextLength(tier.context_length, DEFAULT_LONG_CONTEXT_LENGTH);
}

function tierOllamaNumCtx(tier: RuntimeBootstrapTier): number {
  return normalizeContextLength(tier.ollama_num_ctx, tierContextLength(tier));
}

function tierMaxTokens(tier: RuntimeBootstrapTier): number {
  const numeric = typeof tier.max_tokens === 'number' ? tier.max_tokens : Number(tier.max_tokens);
  if (!Number.isFinite(numeric)) return DEFAULT_HERMES_MAX_TOKENS;
  return Math.max(1, Math.min(8_192, Math.floor(numeric)));
}

function ollamaOpenAiCompatibleBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const pathname = url.pathname.replace(/\/+$/, '');
    url.pathname = pathname.endsWith('/v1') ? pathname : `${pathname === '' ? '' : pathname}/v1`;
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return baseUrl;
  }
}

const yamlScalar = (value: string): string => JSON.stringify(value);

function yamlStringList(values: string[], indent: string): string[] {
  return values.length ? values.map((value) => `${indent}- ${yamlScalar(value)}`) : [`${indent}[]`];
}

const makeStage = (
  id: RuntimeBootstrapStageId,
  status: RuntimeBootstrapStageStatus,
  fields: Omit<RuntimeBootstrapStage, 'id' | 'status'> = {}
): RuntimeBootstrapStage => ({
  id,
  status,
  ...fields,
});

const ensureDir = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
};

const writeJsonAtomic = (file: string, data: unknown): void => {
  ensureDir(path.dirname(file));
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, file);
};

const defaultRunner: RuntimeBootstrapRunner = async (command, args, options) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = childProcess.spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill('SIGTERM');
      settled = true;
      resolve({
        command,
        args,
        ok: false,
        status: null,
        signal: 'SIGTERM',
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        error: `Command timed out after ${Date.now() - started}ms`,
      });
    }, options.timeoutMs ?? DEFAULT_STAGE_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', (error) => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      resolve({ command, args, ok: false, status: null, stdout: '', stderr: '', error: error.message });
    });
    child.on('close', (status, signal) => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      resolve({
        command,
        args,
        ok: status === 0,
        status,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });

const defaultDetachedSpawner: RuntimeBootstrapDetachedSpawner = (command, args, options) => {
  const child = childProcess.spawn(command, args, {
    env: { ...process.env, ...options.env },
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
};

export function resolveCommandEveRuntimeBootstrapPaths(userDataPath: string): RuntimeBootstrapPaths {
  const root = path.resolve(userDataPath || path.join(os.homedir(), '.command-eve'));
  const runtimeRoot = path.join(root, 'command-eve-runtime');
  const capabilitiesRoot = path.join(runtimeRoot, 'capabilities');
  const hermesRoot = path.join(runtimeRoot, 'hermes');
  return {
    userDataPath: root,
    runtimeRoot,
    receiptPath: path.join(runtimeRoot, 'runtime-bootstrap-receipt.json'),
    modelWarmupReceiptPath: path.join(runtimeRoot, 'model-warmup-receipt.json'),
    capabilitiesRoot,
    capabilityPack: path.join(capabilitiesRoot, COMMAND_EVE_CAPABILITIES_FILE),
    hermesRoot,
    hermesHome: path.join(hermesRoot, 'home'),
    hermesVenv: path.join(hermesRoot, 'venv'),
    hermesWrapper: path.join(hermesRoot, 'hermes-command-eve'),
    hermesShim: path.join(hermesRoot, 'hermes'),
    managedSkillsRoot: path.join(hermesRoot, 'home', COMMAND_EVE_MANAGED_SKILLS_DIR),
    runtimeReconciliation: path.join(capabilitiesRoot, COMMAND_EVE_RUNTIME_RECONCILIATION_FILE),
    firstRunProfile: path.join(runtimeRoot, 'first-run-profile.json'),
  };
}

export function resolveCommandEveCapabilityManifestPath(options: {
  capabilityManifestPath?: string;
  appPath?: string;
  resourcesPath?: string;
}): string {
  const candidates = [
    compact(options.capabilityManifestPath),
    options.resourcesPath ? path.join(options.resourcesPath, COMMAND_EVE_CAPABILITIES_FILE) : '',
    options.appPath ? path.join(options.appPath, 'out', 'renderer', COMMAND_EVE_CAPABILITIES_FILE) : '',
    options.resourcesPath
      ? path.join(options.resourcesPath, 'app.asar', 'out', 'renderer', COMMAND_EVE_CAPABILITIES_FILE)
      : '',
    path.join(process.cwd(), 'public', COMMAND_EVE_CAPABILITIES_FILE),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function prependPathSegment(env: NodeJS.ProcessEnv, segment: string): void {
  const currentPath = env.PATH || '';
  const parts = currentPath.split(path.delimiter).filter(Boolean);
  if (parts.includes(segment)) return;
  env.PATH = [segment, ...parts].join(path.delimiter);
}

export function prepareCommandEveRuntimeProcessEnv(
  userDataPath: string,
  env: NodeJS.ProcessEnv = process.env
): RuntimeBootstrapPaths {
  const paths = resolveCommandEveRuntimeBootstrapPaths(userDataPath);
  ensureDir(paths.hermesRoot);
  ensureDir(paths.hermesHome);
  writeHermesCliShim(paths);
  prependPathSegment(env, paths.hermesRoot);
  return paths;
}

export function resolveCommandEveRuntimeBootstrapManifestPath(options: {
  manifestPath?: string;
  appPath?: string;
  resourcesPath?: string;
}): string {
  const candidates = [
    compact(options.manifestPath),
    options.resourcesPath ? path.join(options.resourcesPath, 'command-eve-runtime-bootstrap.json') : '',
    options.appPath ? path.join(options.appPath, 'out', 'renderer', 'command-eve-runtime-bootstrap.json') : '',
    options.resourcesPath
      ? path.join(options.resourcesPath, 'app.asar', 'out', 'renderer', 'command-eve-runtime-bootstrap.json')
      : '',
    path.join(process.cwd(), 'public', 'command-eve-runtime-bootstrap.json'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

export function loadCommandEveRuntimeBootstrapManifest(manifestPath = ''): RuntimeBootstrapManifest {
  if (!manifestPath) return DEFAULT_RUNTIME_BOOTSTRAP_MANIFEST;
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Partial<RuntimeBootstrapManifest>;
  return {
    ...DEFAULT_RUNTIME_BOOTSTRAP_MANIFEST,
    ...raw,
    hermes: {
      ...DEFAULT_RUNTIME_BOOTSTRAP_MANIFEST.hermes,
      ...raw.hermes,
    },
    local_runtime: {
      ...DEFAULT_RUNTIME_BOOTSTRAP_MANIFEST.local_runtime,
      ...raw.local_runtime,
      tiers: raw.local_runtime?.tiers?.length
        ? raw.local_runtime.tiers
        : DEFAULT_RUNTIME_BOOTSTRAP_MANIFEST.local_runtime.tiers,
    },
    installer_policy: {
      ...DEFAULT_RUNTIME_BOOTSTRAP_MANIFEST.installer_policy,
      ...raw.installer_policy,
    },
  };
}

export function loadCommandEveCapabilityPack(capabilityManifestPath = ''): CommandEveCapabilityPack {
  if (!capabilityManifestPath) return DEFAULT_COMMAND_EVE_CAPABILITY_PACK;
  const raw = JSON.parse(fs.readFileSync(capabilityManifestPath, 'utf8')) as Partial<CommandEveCapabilityPack>;
  return {
    ...DEFAULT_COMMAND_EVE_CAPABILITY_PACK,
    ...raw,
    policy: {
      ...DEFAULT_COMMAND_EVE_CAPABILITY_PACK.policy,
      ...raw.policy,
    },
    skills: raw.skills?.length ? raw.skills : DEFAULT_COMMAND_EVE_CAPABILITY_PACK.skills,
    connectors: raw.connectors?.length ? raw.connectors : DEFAULT_COMMAND_EVE_CAPABILITY_PACK.connectors,
  };
}

export function validateCommandEveCapabilityPack(capabilityPack: CommandEveCapabilityPack): string[] {
  const failures: string[] = [];
  if (capabilityPack.version !== 'command-eve-capability-pack/v0') failures.push('capabilities.version_unsupported');
  if (!safeVersion(capabilityPack.release)) failures.push('capabilities.release_unsafe');
  if (!['proposal_only', 'read_only_first'].includes(capabilityPack.policy.default_mode))
    failures.push('capabilities.default_mode_unsupported');
  if (!capabilityPack.skills.length) failures.push('capabilities.skills_empty');
  if (!capabilityPack.connectors.length) failures.push('capabilities.connectors_empty');
  if (!capabilityPack.skills.every((skill) => safeCapabilityId(skill.id)))
    failures.push('capabilities.skill_id_unsafe');
  if (!capabilityPack.connectors.every((connector) => safeCapabilityId(connector.id)))
    failures.push('capabilities.connector_id_unsafe');
  return failures;
}

function writeCommandEveCapabilityPack(paths: RuntimeBootstrapPaths, capabilityPack: CommandEveCapabilityPack): void {
  writeJsonAtomic(paths.capabilityPack, capabilityPack);
  writeJsonAtomic(path.join(paths.hermesHome, COMMAND_EVE_CAPABILITIES_FILE), capabilityPack);
}

function commandEveManagedSkillMarkdown(skill: CommandEveCapabilityPack['skills'][number]): string {
  return [
    `---`,
    `name: ${skill.id}`,
    `description: ${skill.name}. Command EVE managed core skill for local-first founder onboarding and governed work routing.`,
    `---`,
    ``,
    `# ${skill.name}`,
    ``,
    `Use this Command EVE managed skill only inside the local Command EVE runtime.`,
    ``,
    `## Scope`,
    ``,
    `- Keep execution local-first and proposal-only unless a HumanGate explicitly allows a write.`,
    `- Route durable work through Company.OS worker-contract doctrine.`,
    `- Never ask for raw secrets, passwords, cookies, recovery codes, or .env contents in chat.`,
    `- Surface uncertainty instead of claiming a capability is connected when evidence is missing.`,
    ``,
    `## Source`,
    ``,
    `Capability source: ${skill.source}`,
    ``,
  ].join('\n');
}

function writeCommandEveManagedSkills(
  paths: RuntimeBootstrapPaths,
  capabilityPack: CommandEveCapabilityPack
): string[] {
  ensureDir(paths.managedSkillsRoot);
  const executableSkillIds = capabilityPack.skills
    .filter((skill) => skill.default_state === 'active' && safeCapabilityId(skill.id))
    .map((skill) => skill.id);
  for (const skill of capabilityPack.skills) {
    if (!executableSkillIds.includes(skill.id)) continue;
    const skillDir = path.join(paths.managedSkillsRoot, skill.id);
    ensureDir(skillDir);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), commandEveManagedSkillMarkdown(skill), { mode: 0o600 });
  }
  return executableSkillIds;
}

function buildCommandEveRuntimeReconciliation(
  paths: RuntimeBootstrapPaths,
  capabilityPack: CommandEveCapabilityPack,
  executableSkillIds: string[]
): CommandEveRuntimeReconciliation {
  const executable = new Set(executableSkillIds);
  return {
    version: 'command-eve-runtime-reconciliation/v0',
    managed_skill_dir: paths.managedSkillsRoot,
    executable_skill_ids: executableSkillIds,
    prompt_label_skill_ids: capabilityPack.skills
      .filter((skill) => !executable.has(skill.id) && skill.default_state === 'available')
      .map((skill) => skill.id),
    gated_skill_ids: capabilityPack.skills
      .filter((skill) => !executable.has(skill.id) && skill.default_state === 'gated')
      .map((skill) => skill.id),
    connector_ids: capabilityPack.connectors.map((connector) => connector.id),
    hermes_config: {
      mcp_servers: [],
      skills_external_dirs: [`\${HERMES_HOME}/${COMMAND_EVE_MANAGED_SKILLS_DIR}`],
      disabled_skills: COMMAND_EVE_HERMES_DISABLED_SKILLS,
      kanban_dispatch_in_gateway: false,
      kanban_auto_decompose: false,
    },
    blocked_external_mcp_transports: ['http', 'sse'],
    warnings: [
      'Department capabilities with default_state=available are prompt labels until a real SKILL.md binding exists.',
      'HTTP/SSE MCP transports are blocked by default for the local_only lane because they can egress outside the model proxy.',
      'Hermes Kanban is read-first in Command EVE v1.1; dispatcher, auto-decompose, cron and worker auto-spawn remain off.',
    ],
  };
}

function writeCommandEveRuntimeReconciliation(
  paths: RuntimeBootstrapPaths,
  capabilityPack: CommandEveCapabilityPack,
  executableSkillIds: string[]
): void {
  const reconciliation = buildCommandEveRuntimeReconciliation(paths, capabilityPack, executableSkillIds);
  writeJsonAtomic(paths.runtimeReconciliation, reconciliation);
  writeJsonAtomic(path.join(paths.hermesHome, COMMAND_EVE_RUNTIME_RECONCILIATION_FILE), reconciliation);
}

function resolveCommandEveFirstRunProfile(options: {
  env: NodeJS.ProcessEnv;
  now: () => Date;
  displayNameLookup?: () => string;
}): RuntimeBootstrapIdentityProfile {
  const founderFromEnv = normalizeIdentityText(
    options.env.COMMAND_EVE_FOUNDER_NAME || options.env.COMMAND_EVE_USER_NAME
  );
  const companyFromEnv = normalizeIdentityText(options.env.COMMAND_EVE_COMPANY_NAME);
  const displayName = normalizeIdentityText((options.displayNameLookup || defaultDisplayNameLookup)());
  const userName = normalizeIdentityText(options.env.USER || options.env.USERNAME || options.env.LOGNAME);

  let founderName = '';
  let source: RuntimeBootstrapIdentitySource = 'unverified';
  let confidence: RuntimeBootstrapIdentityConfidence = 'placeholder';
  let needsConfirmation = true;

  if (founderFromEnv && !isPlaceholderIdentityName(founderFromEnv)) {
    founderName = founderFromEnv;
    source = 'env';
    confidence = 'verified';
    needsConfirmation = false;
  } else if (displayName && !isPlaceholderIdentityName(displayName)) {
    founderName = displayName;
    source = 'macos_full_name';
    confidence = 'needs_confirmation';
  } else if (userName && !isPlaceholderIdentityName(userName)) {
    founderName = userName;
    source = 'os_user';
    confidence = 'needs_confirmation';
  }

  const profile: RuntimeBootstrapIdentityProfile = {
    version: 'command-eve-first-run-profile/v0',
    source,
    confidence,
    needs_confirmation: needsConfirmation,
    updated_at: options.now().toISOString(),
  };
  if (founderName) profile.founder_name = founderName;
  if (companyFromEnv) profile.company_name = companyFromEnv;
  if (!founderName && companyFromEnv) {
    profile.source = 'env';
    profile.confidence = 'needs_confirmation';
    profile.needs_confirmation = true;
  }
  return profile;
}

export function selectRuntimeBootstrapTier(
  manifest: RuntimeBootstrapManifest,
  preferredTierId = ''
): RuntimeBootstrapTier {
  const tiers = manifest.local_runtime.tiers;
  return (
    tiers.find((tier) => tier.id === preferredTierId) ||
    tiers.find((tier) => tier.id === manifest.local_runtime.default_tier_id) ||
    tiers.find((tier) => tier.default) ||
    tiers[0] ||
    DEFAULT_RUNTIME_BOOTSTRAP_MANIFEST.local_runtime.tiers[0]
  );
}

export function validateRuntimeBootstrapManifest(
  manifest: RuntimeBootstrapManifest,
  tier: RuntimeBootstrapTier
): string[] {
  const failures: string[] = [];
  if (manifest.local_runtime.provider !== 'ollama') failures.push('manifest.provider_not_ollama');
  if (!isLoopbackHttpUrl(manifest.local_runtime.base_url)) failures.push('manifest.ollama_url_not_loopback');
  if (!isLoopbackHttpUrl(manifest.local_runtime.egress_proxy_url)) failures.push('manifest.egress_proxy_not_loopback');
  if (!safePythonPackage(manifest.hermes.package)) failures.push('manifest.hermes_package_unsafe');
  if (!safeVersion(manifest.hermes.version)) failures.push('manifest.hermes_version_unsafe');
  if (!manifest.hermes.extras.every(safePythonExtra)) failures.push('manifest.hermes_extras_unsafe');
  if (!safeModelRef(tier.model_ref)) failures.push('manifest.model_ref_unsafe');
  if (tierContextLength(tier) < 8_192) failures.push('manifest.context_length_too_small');
  if (tierOllamaNumCtx(tier) < tierContextLength(tier)) failures.push('manifest.ollama_num_ctx_too_small');
  if (manifest.installer_policy.model_weights_in_app_bundle !== false)
    failures.push('manifest.model_weights_bundle_forbidden');
  return failures;
}

async function commandExists(
  command: string,
  runner: RuntimeBootstrapRunner,
  env: NodeJS.ProcessEnv
): Promise<CommandLookup> {
  if (!safeCommandName(command)) return { ok: false, path: '' };
  const result = await runner('bash', ['-lc', 'command -v -- "$1"', 'bash', command], { env, timeoutMs: 10_000 });
  return { ok: result.ok && Boolean(compact(result.stdout)), path: compact(result.stdout) };
}

function parsePythonVersion(output: string): { major: number; minor: number; patch: number; text: string } | null {
  const match = compact(output).match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] || 0),
    text: `Python ${match[1]}.${match[2]}${match[3] ? `.${match[3]}` : ''}`,
  };
}

function pythonVersionSupported(version: { major: number; minor: number }): boolean {
  if (version.major !== 3) return false;
  return version.minor >= 11 && version.minor < 14;
}

async function resolvePythonCommand(
  runner: RuntimeBootstrapRunner,
  env: NodeJS.ProcessEnv,
  candidates = PYTHON_BINARY_CANDIDATES
): Promise<PythonLookup> {
  let foundUnsupported = '';
  for (const candidate of candidates) {
    const lookup = await commandExists(candidate, runner, env);
    if (!lookup.ok) continue;

    const versionResult = await runner(lookup.path, ['--version'], { env, timeoutMs: 10_000 });
    const version = parsePythonVersion(`${versionResult.stdout || ''}\n${versionResult.stderr || ''}`);
    if (version && pythonVersionSupported(version)) {
      return { ...lookup, version: version.text };
    }

    const detail = version?.text || lookup.path;
    foundUnsupported = foundUnsupported || `${detail} is outside Hermes 0.16 supported range >=3.11,<3.14.`;
  }
  return { ok: false, path: '', foundUnsupported };
}

async function resolveOllamaCommand(
  runner: RuntimeBootstrapRunner,
  env: NodeJS.ProcessEnv,
  binaryCandidates: string[] = LOCAL_OLLAMA_BINARY_CANDIDATES
): Promise<CommandLookup> {
  const lookup = await commandExists('ollama', runner, env);
  if (lookup.ok) return lookup;
  for (const candidate of binaryCandidates) {
    if (fs.existsSync(candidate)) return { ok: true, path: candidate };
  }
  return lookup;
}

function pythonBinary(paths: RuntimeBootstrapPaths): string {
  return process.platform === 'win32'
    ? path.join(paths.hermesVenv, 'Scripts', 'python.exe')
    : path.join(paths.hermesVenv, 'bin', 'python');
}

function hermesConsoleBinary(paths: RuntimeBootstrapPaths): string {
  return process.platform === 'win32'
    ? path.join(paths.hermesVenv, 'Scripts', 'hermes.exe')
    : path.join(paths.hermesVenv, 'bin', 'hermes');
}

function parseHermesVersion(output: string): string {
  const match = compact(output).match(/Hermes Agent v([0-9]+(?:\.[0-9]+){1,3})/i);
  return match?.[1] || '';
}

async function readInstalledHermesVersion(
  paths: RuntimeBootstrapPaths,
  runner: RuntimeBootstrapRunner,
  env: NodeJS.ProcessEnv
): Promise<string> {
  const binary = hermesConsoleBinary(paths);
  if (!fs.existsSync(binary)) return '';
  const result = await runner(binary, ['--version'], { env, timeoutMs: 10_000 });
  return result.ok ? parseHermesVersion(`${result.stdout || ''}\n${result.stderr || ''}`) : '';
}

function hermesExtrasSpecifier(manifest: RuntimeBootstrapManifest): string {
  return manifest.hermes.extras.length ? `[${manifest.hermes.extras.join(',')}]` : '';
}

function hermesWheelFileName(manifest: RuntimeBootstrapManifest): string {
  return `${manifest.hermes.package.replace(/-/g, '_')}-${manifest.hermes.version}-py3-none-any.whl`;
}

function resolveBundledHermesWheel(
  manifest: RuntimeBootstrapManifest,
  env: NodeJS.ProcessEnv,
  options: RuntimeBootstrapOptions
): string {
  const wheelName = hermesWheelFileName(manifest);
  const candidates = [
    compact(env.COMMAND_EVE_HERMES_WHEEL),
    ...(options.bundledHermesWheelCandidates || []),
    options.resourcesPath ? path.join(options.resourcesPath, BUNDLED_HERMES_DIR, wheelName) : '',
    path.join(process.cwd(), 'resources', BUNDLED_HERMES_DIR, wheelName),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function buildHermesPackageSpec(manifest: RuntimeBootstrapManifest, wheelPath = ''): string {
  const extras = hermesExtrasSpecifier(manifest);
  if (wheelPath) return `${wheelPath}${extras}`;
  // This is a fallback for developer environments. Release installers should
  // ship a bundled Hermes wheel because hermes-agent is not guaranteed to be
  // available from the public Python package index.
  return `${manifest.hermes.package}${extras}==${manifest.hermes.version}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function writeHermesCliShim(paths: RuntimeBootstrapPaths): void {
  const consoleBinary = hermesConsoleBinary(paths);
  if (!fs.existsSync(consoleBinary)) return;
  const shim = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `export HERMES_HOME=${shellQuote(paths.hermesHome)}`,
    `exec ${shellQuote(consoleBinary)} "$@"`,
    '',
  ].join('\n');
  fs.writeFileSync(paths.hermesShim, shim, { mode: 0o700 });
}

function writeHermesOllamaProviderOverride(paths: RuntimeBootstrapPaths): void {
  const providerDir = path.join(paths.hermesHome, 'plugins', 'model-providers', 'custom');
  ensureDir(providerDir);
  const pluginYaml = [
    'name: custom',
    'kind: model-provider',
    'version: command-eve-ollama/v0',
    'description: Command EVE local Ollama provider override.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(providerDir, 'plugin.yaml'), pluginYaml, { mode: 0o600 });

  const initPy = [
    '"""Command EVE custom/Ollama provider override."""',
    '',
    'from typing import Any',
    '',
    'from providers import register_provider',
    'from providers.base import ProviderProfile',
    '',
    '',
    'class CommandEveCustomProfile(ProviderProfile):',
    '    """Local custom provider tuned for Ollama Gemma first-run inference."""',
    '',
    '    def build_api_kwargs_extras(',
    '        self,',
    '        *,',
    '        reasoning_config: dict | None = None,',
    '        ollama_num_ctx: int | None = None,',
    '        **ctx: Any,',
    '    ) -> tuple[dict[str, Any], dict[str, Any]]:',
    '        extra_body: dict[str, Any] = {}',
    '        top_level: dict[str, Any] = {}',
    '',
    '        if ollama_num_ctx:',
    '            extra_body["options"] = {"num_ctx": ollama_num_ctx}',
    '',
    '        if reasoning_config and isinstance(reasoning_config, dict):',
    '            effort = str(reasoning_config.get("effort") or "").strip().lower()',
    '            enabled = reasoning_config.get("enabled", True)',
    '            if effort == "none" or enabled is False:',
    '                extra_body["think"] = False',
    '                top_level["reasoning_effort"] = "none"',
    '',
    '        return extra_body, top_level',
    '',
    '',
    'register_provider(',
    '    CommandEveCustomProfile(',
    '        name="custom",',
    '        aliases=("ollama", "local", "vllm", "llamacpp", "llama.cpp", "llama-cpp"),',
    '        env_vars=(),',
    '        base_url="",',
    '    )',
    ')',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(providerDir, '__init__.py'), initPy, { mode: 0o600 });
}

function writeHermesContextLengthCache(paths: RuntimeBootstrapPaths, manifest: RuntimeBootstrapManifest): void {
  const hermesBaseUrl = ollamaOpenAiCompatibleBaseUrl(manifest.local_runtime.egress_proxy_url);
  const cacheLines = [
    'context_lengths:',
    ...manifest.local_runtime.tiers.map(
      (tier) =>
        `  ${commandEveOllamaContextModelRef(tier.model_ref, tierOllamaNumCtx(tier))}@${hermesBaseUrl}: ${tierContextLength(tier)}`
    ),
    '',
  ];
  fs.writeFileSync(path.join(paths.hermesHome, 'context_length_cache.yaml'), cacheLines.join('\n'), { mode: 0o600 });
}

function writeHermesRuntimeFiles(
  paths: RuntimeBootstrapPaths,
  manifest: RuntimeBootstrapManifest,
  tier: RuntimeBootstrapTier,
  capabilityPack: CommandEveCapabilityPack,
  runtimeModelRef = commandEveOllamaContextModelRef(tier.model_ref, tierOllamaNumCtx(tier))
): void {
  ensureDir(paths.hermesHome);
  const executableSkillIds = writeCommandEveManagedSkills(paths, capabilityPack);
  writeCommandEveRuntimeReconciliation(paths, capabilityPack, executableSkillIds);
  const hermesBaseUrl = ollamaOpenAiCompatibleBaseUrl(manifest.local_runtime.egress_proxy_url);
  const contextLength = tierContextLength(tier);
  const ollamaNumCtx = tierOllamaNumCtx(tier);
  const maxTokens = tierMaxTokens(tier);
  const commandEveSkillDir = `\${HERMES_HOME}/${COMMAND_EVE_MANAGED_SKILLS_DIR}`;
  const config = [
    '# Command EVE managed Hermes config.',
    '# Generated by the first-run runtime bootstrapper; keep secrets out of this file.',
    'model:',
    '  provider: custom',
    `  default: ${runtimeModelRef}`,
    `  base_url: ${hermesBaseUrl}`,
    `  context_length: ${contextLength}`,
    `  ollama_num_ctx: ${ollamaNumCtx}`,
    `  max_tokens: ${maxTokens}`,
    'agent:',
    '  reasoning_effort: none',
    'skills:',
    '  creation_nudge_interval: 0',
    '  external_dirs:',
    ...yamlStringList([commandEveSkillDir], '    '),
    '  disabled:',
    ...yamlStringList(COMMAND_EVE_HERMES_DISABLED_SKILLS, '    '),
    'platform_toolsets:',
    '  cli: []',
    '  acp: []',
    'mcp_servers: {}',
    'kanban:',
    '  dispatch_in_gateway: false',
    '  auto_decompose: false',
    'inference:',
    '  provider: ollama',
    `  default: ${runtimeModelRef}`,
    `  model_url: ${manifest.local_runtime.base_url}`,
    `  base_url: ${manifest.local_runtime.base_url}`,
    'data_boundary:',
    '  default_lane: local_only',
    '  block_raw_secrets: true',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(paths.hermesHome, 'config.yaml'), config, { mode: 0o600 });
  writeHermesContextLengthCache(paths, manifest);
  const soul = [
    '# EVE SOUL',
    '',
    'You are EVE, Command EVE Chief of Staff.',
    'Default to local-first execution, ask for explicit consent before external model/provider routing, and keep receipts for runtime decisions.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(paths.hermesHome, 'SOUL.md'), soul, { mode: 0o600 });
  writeHermesOllamaProviderOverride(paths);
  const wrapper = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `export HERMES_HOME=${shellQuote(paths.hermesHome)}`,
    `exec ${shellQuote(hermesConsoleBinary(paths))} "$@"`,
    '',
  ].join('\n');
  fs.writeFileSync(paths.hermesWrapper, wrapper, { mode: 0o700 });
  writeHermesCliShim(paths);
}

function freeDiskGb(targetPath: string, statfs: RuntimeBootstrapOptions['statfs']): number {
  try {
    ensureDir(targetPath);
    const stats = statfs ? statfs(targetPath) : fs.statfsSync(targetPath);
    return roundGb(Number(stats.bavail) * Number(stats.bsize));
  } catch {
    return 0;
  }
}

export function parseOllamaListHasModel(stdout: string, modelRef: string): boolean {
  const target = compact(modelRef);
  return compact(stdout)
    .split(/\r?\n/)
    .slice(1)
    .some((line) => line.trim().split(/\s+/)[0] === target);
}

export function commandEveOllamaContextModelRef(modelRef: string, numCtx = DEFAULT_LONG_CONTEXT_LENGTH): string {
  const safeBase = compact(modelRef)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${COMMAND_EVE_OLLAMA_MODEL_PREFIX}-${safeBase}-${Math.round(normalizeContextLength(numCtx, DEFAULT_LONG_CONTEXT_LENGTH) / 1024)}k:latest`;
}

function writeOllamaContextModelfile(
  paths: RuntimeBootstrapPaths,
  sourceModelRef: string,
  runtimeModelRef: string,
  ollamaNumCtx: number,
  maxTokens: number
): string {
  const modelfileDir = path.join(paths.runtimeRoot, 'ollama-modelfiles');
  ensureDir(modelfileDir);
  const modelfilePath = path.join(modelfileDir, `${runtimeModelRef.replace(/[:/]/g, '-')}.Modelfile`);
  const modelfile = [
    `FROM ${sourceModelRef}`,
    `PARAMETER num_ctx ${ollamaNumCtx}`,
    `PARAMETER num_predict ${maxTokens}`,
    '',
  ].join('\n');
  fs.writeFileSync(modelfilePath, modelfile, { mode: 0o600 });
  return modelfilePath;
}

async function waitForOllama(baseUrl: string, attempts = 20): Promise<boolean> {
  if (!isLoopbackHttpUrl(baseUrl)) return false;
  const attempt = async (remaining: number): Promise<boolean> => {
    if (await pingOllama(baseUrl)) return true;
    if (remaining <= 1) return false;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return attempt(remaining - 1);
  };
  return attempt(attempts);
}

async function pingOllama(baseUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL('/api/tags', baseUrl);
    const request = http.get(url, { timeout: 2000 }, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 500));
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

function buildReceipt(options: {
  paths: RuntimeBootstrapPaths;
  manifest: RuntimeBootstrapManifest;
  capabilityPack?: CommandEveCapabilityPack;
  identity?: RuntimeBootstrapIdentityProfile;
  tier: RuntimeBootstrapTier;
  runtimeModelRef: string;
  mode: RuntimeBootstrapMode;
  startedAt: string;
  completedAt: string;
  stages: RuntimeBootstrapStage[];
}): RuntimeBootstrapReceipt {
  const blocked = options.stages.some((stage) => stage.status === 'blocked');
  const failed = options.stages.some((stage) => stage.status === 'failed');
  const skipped = options.mode === 'off';
  const status = skipped ? 'skipped' : failed ? 'failed' : blocked ? 'blocked' : 'ready';
  const firstBlocked = options.stages.find((stage) => stage.status === 'blocked' || stage.status === 'failed');
  return {
    version: COMMAND_EVE_RUNTIME_BOOTSTRAP_VERSION,
    app_release: options.manifest.release,
    mode: options.mode,
    status,
    started_at: options.startedAt,
    completed_at: options.completedAt,
    runtime_root: options.paths.runtimeRoot,
    hermes_home: options.paths.hermesHome,
    provider: 'ollama',
    default_model: options.runtimeModelRef,
    base_model: options.tier.model_ref,
    ollama_base_url: options.manifest.local_runtime.base_url,
    egress_proxy_url: options.manifest.local_runtime.egress_proxy_url,
    stages: options.stages,
    next_action:
      firstBlocked?.detail ||
      (status === 'ready' ? 'Runtime ready for EVE first session.' : 'Runtime bootstrap skipped.'),
    warnings: options.stages
      .filter((stage) => stage.status === 'skip' && stage.detail)
      .map((stage) => stage.detail as string),
    capabilities: {
      skills: options.capabilityPack?.skills.length ?? 0,
      connectors: options.capabilityPack?.connectors.length ?? 0,
      capability_pack: options.paths.capabilityPack,
    },
    ...(options.identity
      ? {
          identity: {
            ...options.identity,
            profile_path: options.paths.firstRunProfile,
          },
        }
      : {}),
  };
}

export async function ensureCommandEveRuntimeBootstrap(
  options: RuntimeBootstrapOptions
): Promise<RuntimeBootstrapReceipt> {
  const env = { ...process.env, ...options.env };
  const mode = (env.COMMAND_EVE_RUNTIME_BOOTSTRAP as RuntimeBootstrapMode) || options.mode || 'auto';
  const now = options.now || (() => new Date());
  const runner = options.runner || defaultRunner;
  const detachedSpawner = options.detachedSpawner || defaultDetachedSpawner;
  const paths = resolveCommandEveRuntimeBootstrapPaths(options.userDataPath);
  const manifestPath = resolveCommandEveRuntimeBootstrapManifestPath(options);
  const capabilityManifestPath = resolveCommandEveCapabilityManifestPath(options);
  ensureDir(paths.runtimeRoot);

  let manifest = DEFAULT_RUNTIME_BOOTSTRAP_MANIFEST;
  let capabilityPack = DEFAULT_COMMAND_EVE_CAPABILITY_PACK;
  let firstRunProfile: RuntimeBootstrapIdentityProfile | undefined;
  let manifestLoadFailure = '';
  let capabilityPackLoadFailure = '';
  try {
    manifest = loadCommandEveRuntimeBootstrapManifest(manifestPath);
  } catch (error) {
    manifestLoadFailure = error instanceof Error ? error.message : String(error);
  }
  try {
    capabilityPack = loadCommandEveCapabilityPack(capabilityManifestPath);
  } catch (error) {
    capabilityPackLoadFailure = error instanceof Error ? error.message : String(error);
  }
  const preferredTierId = compact(env.COMMAND_EVE_LOCAL_MODEL_TIER);
  const tier = selectRuntimeBootstrapTier(manifest, preferredTierId);
  const runtimeModelRef = commandEveOllamaContextModelRef(tier.model_ref, tierOllamaNumCtx(tier));
  const startedAt = now().toISOString();
  const stages: RuntimeBootstrapStage[] = [];
  const finishReceipt = (): RuntimeBootstrapReceipt =>
    buildReceipt({
      paths,
      manifest,
      capabilityPack,
      identity: firstRunProfile,
      tier,
      runtimeModelRef,
      mode,
      startedAt,
      completedAt: now().toISOString(),
      stages,
    });
  const pushStage = (stage: RuntimeBootstrapStage): void => {
    stages.push(stage);
    const receipt = finishReceipt();
    writeJsonAtomic(paths.receiptPath, receipt);
  };

  if (mode === 'off') {
    pushStage(makeStage('manifest', 'skip', { detail: 'COMMAND_EVE_RUNTIME_BOOTSTRAP=off' }));
    return finishReceipt();
  }

  if (manifestLoadFailure) {
    pushStage(
      makeStage('manifest', 'blocked', {
        code: 'BLOCKED_MANIFEST_PARSE',
        detail: `Runtime bootstrap manifest could not be parsed: ${scrubOutput(manifestLoadFailure)}`,
      })
    );
    return finishReceipt();
  }

  const manifestFailures = validateRuntimeBootstrapManifest(manifest, tier);
  pushStage(
    manifestFailures.length
      ? makeStage('manifest', 'blocked', {
          code: 'BLOCKED_MANIFEST',
          detail: `Runtime bootstrap manifest failed validation: ${manifestFailures.join(', ')}`,
        })
      : makeStage('manifest', 'pass', { detail: manifestPath ? `Loaded ${manifestPath}` : 'Using embedded defaults' })
  );
  if (manifestFailures.length) {
    return finishReceipt();
  }

  ensureDir(paths.hermesRoot);
  ensureDir(paths.hermesHome);
  ensureDir(paths.capabilitiesRoot);
  pushStage(makeStage('directories', 'pass', { detail: paths.runtimeRoot }));

  if (capabilityPackLoadFailure) {
    pushStage(
      makeStage('capabilities', 'blocked', {
        code: 'BLOCKED_CAPABILITY_PACK_PARSE',
        detail: `Command EVE capability pack could not be parsed: ${scrubOutput(capabilityPackLoadFailure)}`,
      })
    );
    return finishReceipt();
  }

  const capabilityFailures = validateCommandEveCapabilityPack(capabilityPack);
  if (capabilityFailures.length) {
    pushStage(
      makeStage('capabilities', 'blocked', {
        code: 'BLOCKED_CAPABILITY_PACK',
        detail: `Command EVE capability pack failed validation: ${capabilityFailures.join(', ')}`,
      })
    );
    return finishReceipt();
  }

  writeCommandEveCapabilityPack(paths, capabilityPack);
  pushStage(
    makeStage('capabilities', 'pass', {
      detail: `Installed ${capabilityPack.skills.length} EVE skills and ${capabilityPack.connectors.length} connector policies.`,
    })
  );

  firstRunProfile = resolveCommandEveFirstRunProfile({
    env,
    now,
    displayNameLookup: options.displayNameLookup,
  });
  writeJsonAtomic(paths.firstRunProfile, firstRunProfile);
  pushStage(
    makeStage('identity', firstRunProfile.confidence === 'placeholder' ? 'skip' : 'pass', {
      detail:
        firstRunProfile.confidence === 'placeholder'
          ? 'No reliable founder identity seed yet; EVE will ask for confirmation during onboarding.'
          : firstRunProfile.needs_confirmation
            ? 'Founder/company seed written for EVE greeting; user confirmation required.'
            : 'Founder/company seed written for EVE greeting.',
    })
  );

  const freeGb = freeDiskGb(paths.runtimeRoot, options.statfs);
  const totalMemoryGb = roundGb(options.totalMemoryBytes ?? os.totalmem());
  if (freeGb < tier.min_free_disk_gb) {
    pushStage(
      makeStage('capacity', 'blocked', {
        code: 'BLOCKED_DISK',
        detail: `Need ${tier.min_free_disk_gb}GB free disk for ${tier.label}; found ${freeGb}GB.`,
      })
    );
    return finishReceipt();
  }
  if (totalMemoryGb < tier.min_unified_memory_gb) {
    pushStage(
      makeStage('capacity', 'blocked', {
        code: 'BLOCKED_RAM',
        detail: `Need ${tier.min_unified_memory_gb}GB unified memory for ${tier.label}; found ${totalMemoryGb}GB.`,
      })
    );
    return finishReceipt();
  }
  pushStage(makeStage('capacity', 'pass', { detail: `${freeGb}GB free disk, ${totalMemoryGb}GB memory` }));

  const python = await resolvePythonCommand(runner, env);
  if (!python.ok) {
    pushStage(
      makeStage('python', 'blocked', {
        code: python.foundUnsupported ? 'PYTHON_UNSUPPORTED' : 'PYTHON_MISSING',
        detail:
          python.foundUnsupported ||
          'Install Python >=3.11,<3.14, then restart Command EVE. Python 3.14 is not supported by Hermes 0.16.',
      })
    );
    return finishReceipt();
  }

  if (mode === 'check') {
    pushStage(makeStage('python', 'pass', { detail: `${python.path} (${python.version || 'version checked'})` }));
  } else if (!fs.existsSync(pythonBinary(paths))) {
    const started = Date.now();
    const venv = await runner(python.path, ['-m', 'venv', paths.hermesVenv], {
      env,
      timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
    });
    pushStage(
      makeStage('python', venv.ok ? 'pass' : 'failed', {
        code: venv.ok ? undefined : 'PYTHON_VENV_FAILED',
        detail: venv.ok ? 'Hermes Python venv prepared.' : scrubOutput(venv.stderr || venv.error),
        command: 'python3 -m venv <command-eve-runtime>',
        duration_ms: Date.now() - started,
      })
    );
    if (!venv.ok) {
      return finishReceipt();
    }
  } else {
    pushStage(makeStage('python', 'pass', { detail: 'Hermes Python venv already exists.' }));
  }

  const bundledHermesWheel = resolveBundledHermesWheel(manifest, env, options);
  const hermesSpec = buildHermesPackageSpec(manifest, bundledHermesWheel);
  const hermesInstalled = fs.existsSync(hermesConsoleBinary(paths));
  const installedHermesVersion = hermesInstalled ? await readInstalledHermesVersion(paths, runner, env) : '';
  const hermesVersionMatches = installedHermesVersion === manifest.hermes.version;
  if (mode === 'check') {
    pushStage(
      makeStage('hermes', hermesInstalled && hermesVersionMatches ? 'pass' : 'blocked', {
        code:
          hermesInstalled && hermesVersionMatches
            ? undefined
            : hermesInstalled
              ? 'HERMES_VERSION_MISMATCH'
              : 'HERMES_MISSING',
        detail:
          hermesInstalled && hermesVersionMatches
            ? `Hermes ${installedHermesVersion} is installed.`
            : hermesInstalled
              ? `Hermes ${installedHermesVersion || 'unknown'} is installed, but Command EVE requires ${manifest.hermes.version}.`
              : 'Hermes is not installed in the Command EVE runtime venv.',
      })
    );
    if (!hermesInstalled || !hermesVersionMatches) {
      return finishReceipt();
    }
  } else if (!hermesInstalled || !hermesVersionMatches) {
    const started = Date.now();
    const pipUpgrade = await runner(pythonBinary(paths), ['-m', 'pip', 'install', '--upgrade', 'pip'], {
      env,
      timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
    });
    const install = pipUpgrade.ok
      ? await runner(pythonBinary(paths), ['-m', 'pip', 'install', hermesSpec], {
          env,
          timeoutMs: DEFAULT_LONG_STAGE_TIMEOUT_MS,
        })
      : pipUpgrade;
    pushStage(
      makeStage('hermes', install.ok ? 'pass' : 'failed', {
        code: install.ok ? undefined : 'HERMES_INSTALL_FAILED',
        detail: install.ok
          ? `${hermesInstalled ? 'Updated' : 'Installed'} ${manifest.hermes.package} ${manifest.hermes.version}.`
          : scrubOutput(install.stderr || install.error),
        command: `${pythonBinary(paths)} -m pip install ${hermesSpec}`,
        duration_ms: Date.now() - started,
      })
    );
    if (!install.ok) {
      return finishReceipt();
    }
  } else {
    pushStage(makeStage('hermes', 'pass', { detail: `Hermes ${installedHermesVersion} already installed.` }));
  }
  writeHermesRuntimeFiles(paths, manifest, tier, capabilityPack, runtimeModelRef);

  let ollama = await resolveOllamaCommand(runner, env, options.ollamaBinaryCandidates);
  if (!ollama.ok && mode === 'auto' && manifest.installer_policy.allow_homebrew_install) {
    const brew = await commandExists('brew', runner, env);
    if (brew.ok) {
      const started = Date.now();
      const install = await runner(brew.path, ['install', 'ollama'], { env, timeoutMs: DEFAULT_LONG_STAGE_TIMEOUT_MS });
      pushStage(
        makeStage('ollama', install.ok ? 'pass' : 'failed', {
          code: install.ok ? undefined : 'OLLAMA_HOMEBREW_INSTALL_FAILED',
          detail: install.ok
            ? 'Installed Ollama through Homebrew.'
            : `Homebrew could not install Ollama: ${scrubOutput(install.stderr || install.error)}`,
          command: 'brew install ollama',
          duration_ms: Date.now() - started,
        })
      );
      if (!install.ok) {
        return finishReceipt();
      }
      ollama = await resolveOllamaCommand(runner, env, options.ollamaBinaryCandidates);
    }
  }

  if (!ollama.ok) {
    pushStage(
      makeStage('ollama', 'blocked', {
        code: 'OLLAMA_MISSING',
        detail: 'Install Ollama or Homebrew, then restart Command EVE. No curl-pipe installer was executed.',
      })
    );
    return finishReceipt();
  }

  if (!(await pingOllama(manifest.local_runtime.base_url)) && mode === 'auto') {
    detachedSpawner(ollama.path, ['serve'], { env });
  }
  const ollamaReady = await waitForOllama(manifest.local_runtime.base_url, mode === 'auto' ? 20 : 1);
  pushStage(
    makeStage('ollama', ollamaReady ? 'pass' : 'blocked', {
      code: ollamaReady ? undefined : 'OLLAMA_NOT_RUNNING',
      detail: ollamaReady
        ? `Ollama ready at ${manifest.local_runtime.base_url}.`
        : 'Ollama exists but its local API is not reachable.',
    })
  );
  if (!ollamaReady) {
    return finishReceipt();
  }

  const listBefore = await runner(ollama.path, ['list'], { env, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS });
  let hasBaseModel = listBefore.ok && parseOllamaListHasModel(listBefore.stdout || '', tier.model_ref);
  if (
    !hasBaseModel &&
    mode === 'auto' &&
    manifest.installer_policy.allow_model_pull &&
    env.COMMAND_EVE_SKIP_MODEL_PULL !== '1'
  ) {
    const started = Date.now();
    const pull = await runner(ollama.path, ['pull', tier.model_ref], { env, timeoutMs: DEFAULT_LONG_STAGE_TIMEOUT_MS });
    if (!pull.ok) {
      pushStage(
        makeStage('model', 'failed', {
          code: 'MODEL_PULL_FAILED',
          detail: `Could not pull ${tier.model_ref}: ${scrubOutput(pull.stderr || pull.error)}`,
          command: `ollama pull ${tier.model_ref}`,
          duration_ms: Date.now() - started,
        })
      );
      return finishReceipt();
    }
    const listAfter = await runner(ollama.path, ['list'], { env, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS });
    hasBaseModel = listAfter.ok && parseOllamaListHasModel(listAfter.stdout || '', tier.model_ref);
  }

  if (!hasBaseModel) {
    pushStage(
      makeStage('model', 'blocked', {
        code: 'MODEL_NOT_FETCHED',
        detail: `${tier.model_ref} is not available locally; restart with network access or choose another local tier.`,
      })
    );
    return finishReceipt();
  }

  const listForAlias = await runner(ollama.path, ['list'], { env, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS });
  let hasRuntimeModel = listForAlias.ok && parseOllamaListHasModel(listForAlias.stdout || '', runtimeModelRef);
  if (!hasRuntimeModel && mode === 'auto') {
    const modelfilePath = writeOllamaContextModelfile(
      paths,
      tier.model_ref,
      runtimeModelRef,
      tierOllamaNumCtx(tier),
      tierMaxTokens(tier)
    );
    const started = Date.now();
    const create = await runner(ollama.path, ['create', runtimeModelRef, '-f', modelfilePath], {
      env,
      timeoutMs: DEFAULT_STAGE_TIMEOUT_MS,
    });
    if (!create.ok) {
      pushStage(
        makeStage('model', 'failed', {
          code: 'MODEL_CONTEXT_ALIAS_FAILED',
          detail: `Could not create ${runtimeModelRef}: ${scrubOutput(create.stderr || create.error)}`,
          command: `ollama create ${runtimeModelRef} -f ${modelfilePath}`,
          duration_ms: Date.now() - started,
        })
      );
      return finishReceipt();
    }
    const listAfterAlias = await runner(ollama.path, ['list'], { env, timeoutMs: DEFAULT_STAGE_TIMEOUT_MS });
    hasRuntimeModel = listAfterAlias.ok && parseOllamaListHasModel(listAfterAlias.stdout || '', runtimeModelRef);
  }

  pushStage(
    makeStage('model', hasRuntimeModel ? 'pass' : 'blocked', {
      code: hasRuntimeModel ? undefined : 'MODEL_CONTEXT_ALIAS_MISSING',
      detail: hasRuntimeModel
        ? `${runtimeModelRef} is available locally with ${tierOllamaNumCtx(tier)} context.`
        : `${runtimeModelRef} is not available locally; restart with auto setup to create the context alias.`,
    })
  );
  if (!hasRuntimeModel) {
    return finishReceipt();
  }

  return finishReceipt();
}
