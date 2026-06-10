import {
  COMMAND_EVE_ASSISTANT_RULE_DE,
  COMMAND_EVE_ASSISTANT_RULE_EN,
  buildCommandEveAssistant,
  buildCommandEveAssistantContext,
  buildCommandEveAssistantSkill,
  selectCommandEvePresetAgentType,
  unwrapCommandEveApiData,
  type CommandEveApiEnvelope,
  type CommandEveAssistantCapabilityPackContext,
  type CommandEveAssistantFirstRunContext,
  type CommandEveAssistantLocalIdentity,
  type CommandEveAssistantRuntimeReceipt,
  type CommandEveDetectedAgent,
} from './assistantBootstrapCore';
import { COMMAND_EVE_ASSISTANT_ID } from '@/common/config/commandEveShell';
import fs from 'fs';
import { resolveCommandEveRuntimeBootstrapPaths } from './runtimeBootstrapCore';

export type EnsureCommandEveAssistantOptions = {
  userDataPath?: string;
};

async function requestJson<T>(backendPort: number, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  const response = await fetch(`http://127.0.0.1:${backendPort}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Command EVE assistant bootstrap failed: ${response.status} ${path} ${body.slice(0, 240)}`);
  }
  return unwrapCommandEveApiData<T>((await response.json()) as CommandEveApiEnvelope<T> | T);
}

async function writeAssistantResource(
  backendPort: number,
  kind: 'assistant-rule' | 'assistant-skill',
  locale: string,
  content: string
): Promise<void> {
  await requestJson<boolean>(backendPort, `/api/skills/${kind}/write`, {
    method: 'POST',
    body: JSON.stringify({
      assistant_id: COMMAND_EVE_ASSISTANT_ID,
      locale,
      content,
    }),
  });
}

function readJsonFile<T>(file: string): T | undefined {
  try {
    if (!file || !fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function loadCommandEveFirstRunContext(
  appVersion: string,
  userDataPath?: string
): CommandEveAssistantFirstRunContext | undefined {
  if (!userDataPath) return undefined;
  const paths = resolveCommandEveRuntimeBootstrapPaths(userDataPath);
  const receipt = readJsonFile<CommandEveAssistantRuntimeReceipt>(paths.receiptPath);
  const profile = readJsonFile<CommandEveAssistantLocalIdentity>(paths.firstRunProfile);
  const capabilityPack = readJsonFile<CommandEveAssistantCapabilityPackContext>(paths.capabilityPack);
  if (!receipt && !profile && !capabilityPack) return undefined;
  return {
    appVersion,
    receipt,
    profile,
    capabilityPack,
  };
}

function hasAvailableHermesAgent(agents: CommandEveDetectedAgent[]): boolean {
  return agents.some(
    (agent) => (agent.backend || agent.agent_type || '').toLowerCase() === 'hermes' && agent.available !== false
  );
}

async function loadCommandEveDetectedAgents(backendPort: number): Promise<CommandEveDetectedAgent[]> {
  let agents = await requestJson<CommandEveDetectedAgent[]>(backendPort, '/api/agents');
  if (hasAvailableHermesAgent(agents)) return agents;

  // The backend agent registry can finish Hermes detection just after the
  // initial app boot query. Do not persist EVE to Aionrs until Hermes had a
  // short chance to appear, otherwise old first-run state survives forever.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    agents = await requestJson<CommandEveDetectedAgent[]>(backendPort, '/api/agents');
    if (hasAvailableHermesAgent(agents)) break;
  }
  return agents;
}

export async function ensureCommandEveAssistant(
  backendPort: number,
  appVersion: string,
  options: EnsureCommandEveAssistantOptions = {}
): Promise<void> {
  const agents = await loadCommandEveDetectedAgents(backendPort);
  const presetAgentType = selectCommandEvePresetAgentType(agents);
  const assistant = buildCommandEveAssistant(presetAgentType);
  const firstRunContext = loadCommandEveFirstRunContext(appVersion, options.userDataPath);
  const assistants = await requestJson<Array<{ id: string }>>(backendPort, '/api/assistants');
  const method = assistants.some((item) => item.id === COMMAND_EVE_ASSISTANT_ID) ? 'PUT' : 'POST';
  const path = method === 'PUT' ? `/api/assistants/${COMMAND_EVE_ASSISTANT_ID}` : '/api/assistants';
  const body =
    method === 'PUT'
      ? JSON.stringify({
          ...assistant,
          id: COMMAND_EVE_ASSISTANT_ID,
          description: `${assistant.description}\n\n${buildCommandEveAssistantContext(appVersion)}`,
        })
      : JSON.stringify({
          ...assistant,
          description: `${assistant.description}\n\n${buildCommandEveAssistantContext(appVersion)}`,
        });

  await requestJson(backendPort, path, { method, body });
  await requestJson(backendPort, `/api/assistants/${COMMAND_EVE_ASSISTANT_ID}/state`, {
    method: 'PATCH',
    body: JSON.stringify({
      enabled: true,
      sort_order: -1000,
    }),
  });

  await Promise.all([
    writeAssistantResource(backendPort, 'assistant-rule', 'de-DE', COMMAND_EVE_ASSISTANT_RULE_DE),
    writeAssistantResource(backendPort, 'assistant-rule', 'en-US', COMMAND_EVE_ASSISTANT_RULE_EN),
    writeAssistantResource(
      backendPort,
      'assistant-skill',
      'de-DE',
      buildCommandEveAssistantSkill('de-DE', firstRunContext)
    ),
    writeAssistantResource(
      backendPort,
      'assistant-skill',
      'en-US',
      buildCommandEveAssistantSkill('en-US', firstRunContext)
    ),
  ]);
}
