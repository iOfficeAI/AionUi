import path from 'node:path';

export type AibangAuthUser = {
  id: number;
  username: string;
  quota: number;
};

export type AibangAuthSession = {
  dashboardAccessToken: string;
  dashboardSessionId?: string;
  dashboardRefreshToken?: string;
  dashboardAccessTokenExpiresAt?: number;
  dashboardSessionExpiresAt?: number;
  apiTokenId?: number;
  apiToken: string;
  apiTokenExpiresAt?: number;
  expiresAt: number;
  user: AibangAuthUser;
};

export type AibangAuthConfig = {
  newApiUrl: string;
  publicModel: string;
  codexHome: string;
};

export type CodexMcpServerConfig = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
};

export type AgentEnvOverride = {
  name: string;
  value: string;
  description?: string;
};

export type ScopedApiTokenRequest = {
  name: string;
  expired_time: number;
  remain_quota: 0;
  unlimited_quota: true;
  model_limits_enabled: true;
  model_limits: string;
  group: string;
};

export type ManagedCodexAgent = {
  id: string;
  backend?: string;
  agent_type: string;
  agent_source: string;
};

export const managedEnvKeys = ['CODEX_HOME', 'OPENAI_API_KEY', 'CODEX_API_KEY'] as const;
export const BUNDLED_CODEX_VERSION = '0.149.1';

const BUNDLED_CODEX_TRIPLES: Record<string, string> = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-musl',
  'linux-x64': 'x86_64-unknown-linux-musl',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

export function buildBundledCodexPath(
  resourcesRoot: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string | null {
  const triple = BUNDLED_CODEX_TRIPLES[`${platform}-${arch}`];
  if (!triple) return null;
  return path.join(
    resourcesRoot,
    'bundled-aioncore',
    `${platform}-${arch}`,
    'managed-resources',
    'cli',
    'codex',
    BUNDLED_CODEX_VERSION,
    `${platform}-${arch}`,
    'vendor',
    triple,
    'bin',
    platform === 'win32' ? 'codex.exe' : 'codex'
  );
}

export function getCodexHome(userDataPath: string): string {
  return path.join(userDataPath, 'aibang', 'runtime', 'codex-home');
}

export function normalizeNewApiUrl(value: string | undefined): string {
  return (value ?? 'http://127.0.0.1:5000').replace(/\/+$/, '');
}

export function resolveScopedApiTokenExpiresAt(now: number, dashboardExpiresAt: number, ttlMinutes: number): number {
  return Math.min(dashboardExpiresAt, now + ttlMinutes * 60_000);
}

export function buildScopedApiTokenRequest(input: {
  name: string;
  model: string;
  expiresAt: number;
}): ScopedApiTokenRequest {
  if (!input.model || input.model.includes(',')) {
    throw new Error('The scoped API token model must be a single model identifier');
  }
  return {
    name: input.name,
    expired_time: Math.floor(input.expiresAt / 1000),
    remain_quota: 0,
    unlimited_quota: true,
    model_limits_enabled: true,
    model_limits: input.model,
    group: '',
  };
}

export function serializeCodexConfig(config: AibangAuthConfig, mcpServers: CodexMcpServerConfig[] = []): string {
  const baseUrl = `${normalizeNewApiUrl(config.newApiUrl)}/v1`;
  const lines = [
    `model_provider = ${JSON.stringify('aibang')}`,
    `model = ${JSON.stringify(config.publicModel)}`,
    '',
    '[model_providers.aibang]',
    `name = ${JSON.stringify('AIbang')}`,
    `base_url = ${JSON.stringify(baseUrl)}`,
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ];
  for (const server of mcpServers) {
    lines.push(`[mcp_servers.${server.name}]`);
    lines.push(`command = ${JSON.stringify(server.command)}`);
    lines.push(`args = ${JSON.stringify(server.args ?? [])}`);
    if (server.env && Object.keys(server.env).length > 0) {
      lines.push(`[mcp_servers.${server.name}.env]`);
      for (const [key, value] of Object.entries(server.env)) {
        lines.push(`${JSON.stringify(key)} = ${JSON.stringify(value)}`);
      }
    }
    if (server.enabled === false) lines.push('enabled = false');
    lines.push('');
  }
  return lines.join('\n');
}

export function findBuiltinCodexAgent<T extends ManagedCodexAgent>(agents: readonly T[]): T | undefined {
  return agents.find(
    (agent) => agent.backend === 'codex' && agent.agent_type === 'acp' && agent.agent_source === 'builtin'
  );
}

export function removeCodexEnvOverrides(existing: readonly AgentEnvOverride[]): AgentEnvOverride[] {
  return existing.filter((entry) => !managedEnvKeys.includes(entry.name as (typeof managedEnvKeys)[number]));
}
