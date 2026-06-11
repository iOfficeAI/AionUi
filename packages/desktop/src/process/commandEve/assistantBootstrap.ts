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
import path from 'path';
import { resolveCommandEveRuntimeBootstrapPaths } from './runtimeBootstrapCore';

export type EnsureCommandEveAssistantOptions = {
  userDataPath?: string;
};

export type CommandEveAssistantEnsureResult = {
  status: 'ready';
  assistant_id: string;
  preset_agent_type: string;
  enabled_skills: string[];
  custom_skill_names: string[];
  skill_count: number;
};

type CommandEveRuntimeReconciliationForSkillImport = {
  managed_skill_dir?: string;
  executable_skill_ids?: unknown;
};

type ImportedSkillResponse = {
  skill_name?: string;
};

type CommandEveAssistantRecord = {
  id: string;
  preset_agent_type?: string;
  enabled_skills?: string[];
  custom_skill_names?: string[];
};

const SAFE_COMMAND_EVE_SKILL_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

async function requestJson<T>(backendPort: number, path: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  try {
    const response = await fetch(`http://127.0.0.1:${backendPort}${path}`, {
      ...init,
      headers,
      signal: init?.signal || controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Command EVE assistant bootstrap failed: ${response.status} ${path} ${body.slice(0, 240)}`);
    }
    return unwrapCommandEveApiData<T>((await response.json()) as CommandEveApiEnvelope<T> | T);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Command EVE assistant bootstrap timed out after ${timeoutMs}ms: ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

export function resolveCommandEveManagedSkillImportPaths(userDataPath?: string): Array<{ id: string; path: string }> {
  if (!userDataPath) return [];
  const paths = resolveCommandEveRuntimeBootstrapPaths(userDataPath);
  const reconciliation = readJsonFile<CommandEveRuntimeReconciliationForSkillImport>(paths.runtimeReconciliation);
  const managedSkillDir = String(reconciliation?.managed_skill_dir || '').trim();
  if (!managedSkillDir) return [];
  return asStringArray(reconciliation?.executable_skill_ids)
    .filter((id) => SAFE_COMMAND_EVE_SKILL_ID.test(id))
    .map((id) => ({ id, path: path.join(managedSkillDir, id) }))
    .filter((skill) => fs.existsSync(path.join(skill.path, 'SKILL.md')));
}

async function importCommandEveManagedSkills(backendPort: number, userDataPath?: string): Promise<string[]> {
  const skillImports = resolveCommandEveManagedSkillImportPaths(userDataPath);
  const skillNames: string[] = [];
  for (const skill of skillImports) {
    let skillName = skill.id;
    try {
      const imported = await requestJson<ImportedSkillResponse>(
        backendPort,
        '/api/skills/import-symlink',
        {
          method: 'POST',
          body: JSON.stringify({ skill_path: skill.path }),
        },
        5_000
      );
      skillName = imported.skill_name || skill.id;
    } catch (error) {
      console.warn(
        `[CommandEVE] Could not import managed skill "${skill.id}" into AionUI custom skills: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    skillNames.push(skillName);
  }
  return Array.from(new Set(skillNames));
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

function buildCommandEveAssistantPayload(
  presetAgentType: string,
  customSkillNames: string[],
  appVersion: string
): ReturnType<typeof buildCommandEveAssistant> & { description: string } {
  const assistant = buildCommandEveAssistant(presetAgentType, customSkillNames);
  return {
    ...assistant,
    description: `${assistant.description}\n\n${buildCommandEveAssistantContext(appVersion)}`,
  };
}

function findCommandEveAssistant(assistants: CommandEveAssistantRecord[]): CommandEveAssistantRecord | undefined {
  return assistants.find((item) => item.id === COMMAND_EVE_ASSISTANT_ID);
}

function includesAll(values: string[] | undefined, expected: string[]): boolean {
  if (expected.length === 0) return true;
  const actual = new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean));
  return expected.every((value) => actual.has(value));
}

function commandEveAssistantIsReconciled(
  assistant: CommandEveAssistantRecord | undefined,
  presetAgentType: string,
  customSkillNames: string[]
): boolean {
  if (!assistant) return false;
  return (
    assistant.preset_agent_type === presetAgentType &&
    includesAll(assistant.enabled_skills, customSkillNames) &&
    includesAll(assistant.custom_skill_names, customSkillNames)
  );
}

async function loadCommandEveAssistant(backendPort: number): Promise<CommandEveAssistantRecord | undefined> {
  return findCommandEveAssistant(await requestJson<CommandEveAssistantRecord[]>(backendPort, '/api/assistants'));
}

function commandEveAssistantReconciliationError(
  assistant: CommandEveAssistantRecord | undefined,
  presetAgentType: string,
  customSkillNames: string[]
): string {
  const enabledMissing = customSkillNames.filter((skill) => !(assistant?.enabled_skills || []).includes(skill));
  const customMissing = customSkillNames.filter((skill) => !(assistant?.custom_skill_names || []).includes(skill));
  return [
    `expected preset_agent_type=${presetAgentType}`,
    `actual preset_agent_type=${assistant?.preset_agent_type || 'missing'}`,
    enabledMissing.length > 0 ? `missing enabled_skills=${enabledMissing.join(',')}` : '',
    customMissing.length > 0 ? `missing custom_skill_names=${customMissing.join(',')}` : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export async function ensureCommandEveAssistant(
  backendPort: number,
  appVersion: string,
  options: EnsureCommandEveAssistantOptions = {}
): Promise<CommandEveAssistantEnsureResult> {
  const agents = await loadCommandEveDetectedAgents(backendPort);
  const presetAgentType = selectCommandEvePresetAgentType(agents);
  const customSkillNames = await importCommandEveManagedSkills(backendPort, options.userDataPath);
  const assistant = buildCommandEveAssistantPayload(presetAgentType, customSkillNames, appVersion);
  const firstRunContext = loadCommandEveFirstRunContext(appVersion, options.userDataPath);
  const existingAssistant = await loadCommandEveAssistant(backendPort);
  const method = existingAssistant ? 'PUT' : 'POST';
  const path = method === 'PUT' ? `/api/assistants/${COMMAND_EVE_ASSISTANT_ID}` : '/api/assistants';
  const body =
    method === 'PUT' ? JSON.stringify({ ...assistant, id: COMMAND_EVE_ASSISTANT_ID }) : JSON.stringify(assistant);

  await requestJson(backendPort, path, { method, body });

  let reconciledAssistant = await loadCommandEveAssistant(backendPort);
  if (!commandEveAssistantIsReconciled(reconciledAssistant, presetAgentType, customSkillNames) && existingAssistant) {
    console.warn(
      `[CommandEVE] Existing EVE assistant did not reconcile via PUT (${commandEveAssistantReconciliationError(
        reconciledAssistant,
        presetAgentType,
        customSkillNames
      )}); recreating managed EVE assistant.`
    );
    await requestJson(backendPort, `/api/assistants/${COMMAND_EVE_ASSISTANT_ID}`, { method: 'DELETE' });
    await requestJson(backendPort, '/api/assistants', { method: 'POST', body: JSON.stringify(assistant) });
    reconciledAssistant = await loadCommandEveAssistant(backendPort);
  }

  if (!commandEveAssistantIsReconciled(reconciledAssistant, presetAgentType, customSkillNames)) {
    throw new Error(
      `Command EVE assistant reconciliation failed: ${commandEveAssistantReconciliationError(
        reconciledAssistant,
        presetAgentType,
        customSkillNames
      )}`
    );
  }

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

  const readyAssistant = await loadCommandEveAssistant(backendPort);
  if (!commandEveAssistantIsReconciled(readyAssistant, presetAgentType, customSkillNames)) {
    throw new Error(
      `Command EVE assistant final readiness failed: ${commandEveAssistantReconciliationError(
        readyAssistant,
        presetAgentType,
        customSkillNames
      )}`
    );
  }

  return {
    status: 'ready',
    assistant_id: COMMAND_EVE_ASSISTANT_ID,
    preset_agent_type: presetAgentType,
    enabled_skills: readyAssistant?.enabled_skills || [],
    custom_skill_names: readyAssistant?.custom_skill_names || [],
    skill_count: customSkillNames.length,
  };
}
