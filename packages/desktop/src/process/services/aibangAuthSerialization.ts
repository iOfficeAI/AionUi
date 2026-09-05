import path from 'node:path';

export type AibangAuthUser = {
  id: number;
  username: string;
  quota: number;
};

export type AibangAuthSession = {
  accessToken: string;
  expiresAt: number;
  user: AibangAuthUser;
};

export type AibangAuthConfig = {
  middlewareUrl: string;
  publicModel: string;
  codexHome: string;
};

export type AgentEnvOverride = {
  name: string;
  value: string;
  description?: string;
};

export type ManagedCodexAgent = {
  id: string;
  backend?: string;
  agent_type: string;
  agent_source: string;
};

export const managedEnvKeys = ['CODEX_HOME', 'OPENAI_API_KEY', 'CODEX_API_KEY'] as const;

export function getCodexHome(userDataPath: string): string {
  return path.join(userDataPath, 'aibang', 'runtime', 'codex-home');
}

export function normalizeMiddlewareUrl(value: string | undefined): string {
  return (value ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
}

export function serializeCodexConfig(config: AibangAuthConfig): string {
  const baseUrl = `${normalizeMiddlewareUrl(config.middlewareUrl)}/v1`;
  return [
    `model_provider = ${JSON.stringify('aibang')}`,
    `model = ${JSON.stringify(config.publicModel)}`,
    '',
    '[model_providers.aibang]',
    `name = ${JSON.stringify('AIbang')}`,
    `base_url = ${JSON.stringify(baseUrl)}`,
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ].join('\n');
}

export function findBuiltinCodexAgent<T extends ManagedCodexAgent>(agents: readonly T[]): T | undefined {
  return agents.find(
    (agent) => agent.backend === 'codex' && agent.agent_type === 'acp' && agent.agent_source === 'builtin'
  );
}

export function mergeCodexEnvOverrides(existing: readonly AgentEnvOverride[], accessToken: string): AgentEnvOverride[] {
  const unrelated = existing.filter((entry) => !managedEnvKeys.includes(entry.name as (typeof managedEnvKeys)[number]));
  return [...unrelated, { name: 'OPENAI_API_KEY', value: accessToken }, { name: 'CODEX_API_KEY', value: accessToken }];
}

export function removeCodexEnvOverrides(existing: readonly AgentEnvOverride[]): AgentEnvOverride[] {
  return existing.filter((entry) => !managedEnvKeys.includes(entry.name as (typeof managedEnvKeys)[number]));
}
