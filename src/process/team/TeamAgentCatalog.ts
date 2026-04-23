/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TeamAgentCatalog
 *
 * Single source of truth for "what agents are spawnable in team mode".
 *
 * Every team-related query (UI dropdown, leader prompt listing,
 * team_list_models, team_spawn_agent validation, AcpAgentManager CLI
 * resolution) goes through one of the methods here.
 *
 * Internally merges three existing data sources:
 *   1. agentRegistry.getDetectedAgents()   — builtin / extension / custom CLIs
 *   2. ProcessConfig 'assistants'          — preset assistants (prompt-only)
 *   3. ProcessConfig 'acp.cachedInitializeResult' — team capability cache
 *
 * All inline lookups of ACP_BACKENDS_ALL, ExtensionRegistry, or the
 * assistants config by consumer modules are being removed in favor of
 * calls into this catalog; the "resolve cliPath / customAgentId / preset
 * resources / team-capability" logic now lives in exactly one place.
 */

import { agentRegistry } from '@process/agent/AgentRegistry';
import { mcpService } from '@process/services/mcpServices/McpService';
import { ProcessConfig } from '@process/utils/initStorage';
import { ACP_BACKENDS_ALL, type AcpBackendAll, type AcpBackendConfig } from '@/common/types/acpTypes';
import type { AcpDetectedAgent, DetectedAgent } from '@/common/types/detectedAgent';
import { isAgentKind } from '@/common/types/detectedAgent';
import type { TeamAgentEntry, TeamAgentSource } from '@/common/types/teamAgentEntry';
import { isTeamCapableBackend } from '@/common/types/teamTypes';

/** Backends that are never team-capable even if a cached init result exists. */
const NON_TEAM_BACKENDS = new Set<string>(['remote', 'openclaw-gateway', 'nanobot']);

/**
 * Some detected agents are not ACP kind but are still team-capable
 * (gemini, aionrs). Build an entry for them so the renderer's dropdown
 * matches the pre-catalog UI, where these always appeared.
 */
function buildNonAcpEntry(agent: DetectedAgent): TeamAgentEntry | undefined {
  const anyAgent = agent as unknown as { cliPath?: string };
  return {
    key: `builtin:${agent.backend}`,
    backend: agent.backend,
    customAgentId: undefined,
    displayName: agent.name,
    cliPath: anyAgent.cliPath ?? agent.backend,
    acpArgs: undefined,
    env: undefined,
    source: 'builtin',
    isTeamCapable: false,
    supportedTransports: undefined,
    isPreset: false,
    isExtension: false,
  };
}

function buildBuiltinEntry(agent: AcpDetectedAgent): TeamAgentEntry {
  const backendCfg = ACP_BACKENDS_ALL[agent.backend as AcpBackendAll];
  return {
    key: `builtin:${agent.backend}`,
    backend: agent.backend,
    customAgentId: undefined,
    displayName: agent.name,
    cliPath: agent.cliPath ?? backendCfg?.cliCommand ?? agent.backend,
    acpArgs: agent.acpArgs ?? backendCfg?.acpArgs,
    env: backendCfg?.env,
    source: 'builtin',
    isTeamCapable: false, // filled by caller after capability check
    supportedTransports: undefined,
    isPreset: false,
    isExtension: false,
    avatar: backendCfg?.avatar,
  };
}

function buildExtensionEntry(agent: AcpDetectedAgent): TeamAgentEntry {
  const customAgentId = agent.customAgentId ?? `ext:${agent.extensionName ?? 'unknown'}:${agent.backend}`;
  return {
    key: customAgentId,
    backend: agent.backend,
    customAgentId,
    displayName: agent.name,
    cliPath: agent.cliPath ?? agent.backend,
    acpArgs: agent.acpArgs,
    env: undefined,
    source: 'extension',
    isTeamCapable: false,
    supportedTransports: undefined,
    isPreset: false,
    isExtension: true,
    extensionName: agent.extensionName,
  };
}

function buildCustomEntry(agent: AcpDetectedAgent): TeamAgentEntry {
  const customAgentId = agent.customAgentId ?? agent.backend;
  return {
    key: `custom:${customAgentId}`,
    backend: agent.backend,
    customAgentId,
    displayName: agent.name,
    cliPath: agent.cliPath ?? '',
    acpArgs: agent.acpArgs,
    env: undefined,
    source: 'custom',
    isTeamCapable: false,
    supportedTransports: undefined,
    isPreset: false,
    isExtension: false,
  };
}

function buildPresetEntry(cfg: AcpBackendConfig): TeamAgentEntry {
  const presetBackend = cfg.presetAgentType || 'gemini';
  const underlying = ACP_BACKENDS_ALL[presetBackend as AcpBackendAll];
  return {
    key: `preset:${cfg.id}`,
    backend: presetBackend,
    customAgentId: cfg.id,
    displayName: cfg.name,
    cliPath: cfg.defaultCliPath ?? underlying?.cliCommand ?? '',
    acpArgs: cfg.acpArgs ?? underlying?.acpArgs,
    env: cfg.env ?? underlying?.env,
    source: 'preset',
    isTeamCapable: false,
    supportedTransports: undefined,
    presetAgentType: cfg.presetAgentType,
    isPreset: true,
    isExtension: false,
    context: cfg.context,
    description: cfg.description,
    enabledSkills: cfg.enabledSkills,
    avatar: cfg.avatar,
  };
}

/**
 * Facade class. Exposed as a singleton (`teamAgentCatalog`) at the bottom.
 * Kept as a class — not a bag of functions — so tests can instantiate a fresh
 * copy per test with a stubbed AgentRegistry / ProcessConfig.
 */
export class TeamAgentCatalog {
  /**
   * Pull all entries known to the catalog.
   * Entries are tagged with `isTeamCapable`; filter on that for team-only views.
   *
   * Non-team backends (remote / openclaw-gateway / nanobot) are excluded entirely —
   * they can't be MCP-injected teammates, so we don't even advertise them here.
   */
  async list(): Promise<TeamAgentEntry[]> {
    const cachedInit = await ProcessConfig.get('acp.cachedInitializeResult');
    const detectedAgents = agentRegistry.getDetectedAgents();

    const entries: TeamAgentEntry[] = [];
    for (const agent of detectedAgents) {
      const entry = this.buildDetectedEntry(agent);
      if (!entry) continue;
      entry.isTeamCapable = isTeamCapableBackend(entry.backend, cachedInit, entry.customAgentId);
      entry.supportedTransports = this.resolveSupportedTransports(agent);
      entries.push(entry);
    }

    const assistants = (await ProcessConfig.get('assistants')) ?? [];
    for (const cfg of assistants) {
      if (!cfg.isPreset || cfg.enabled === false) continue;
      const entry = buildPresetEntry(cfg);
      entry.isTeamCapable = isTeamCapableBackend(entry.backend, cachedInit, entry.customAgentId);
      entries.push(entry);
    }

    return entries;
  }

  /** Team-only shortcut: list().filter(isTeamCapable). */
  async listTeamCapable(): Promise<TeamAgentEntry[]> {
    const all = await this.list();
    return all.filter((e) => e.isTeamCapable);
  }

  /**
   * Resolve the canonical entry for a bare backend string.
   *
   * Preference order for ambiguous backends:
   *   extension > builtin > custom
   * (e.g. if user installs a 'kaiwu' extension and also happens to have a
   *  'kaiwu' binary on PATH, extension wins because it carries the adapter
   *  metadata spawn layer needs.)
   *
   * Presets are NOT returned here — they are keyed by customAgentId, not
   * backend — use `resolveByCustomAgentId` instead.
   */
  async resolveByBackend(backend: string): Promise<TeamAgentEntry | undefined> {
    if (!backend) return undefined;
    const all = await this.list();
    const match =
      all.find((e) => e.backend === backend && e.source === 'extension') ??
      all.find((e) => e.backend === backend && e.source === 'builtin') ??
      all.find((e) => e.backend === backend && e.source === 'custom') ??
      all.find((e) => e.backend === backend && e.source === 'preset');
    return match;
  }

  /** Resolve by customAgentId (used for presets + extensions). */
  async resolveByCustomAgentId(customAgentId: string): Promise<TeamAgentEntry | undefined> {
    if (!customAgentId) return undefined;
    const all = await this.list();
    return all.find((e) => e.customAgentId === customAgentId);
  }

  /** Resolve by the opaque catalog key. */
  async resolveByKey(key: string): Promise<TeamAgentEntry | undefined> {
    if (!key) return undefined;
    const all = await this.list();
    return all.find((e) => e.key === key);
  }

  // ---- internals ----------------------------------------------------------

  private buildDetectedEntry(agent: DetectedAgent): TeamAgentEntry | undefined {
    if (NON_TEAM_BACKENDS.has(agent.backend)) return undefined;
    if (!isAgentKind(agent, 'acp')) return buildNonAcpEntry(agent);
    if (agent.isExtension) return buildExtensionEntry(agent);
    if (agent.backend === 'custom') return buildCustomEntry(agent);
    return buildBuiltinEntry(agent);
  }

  private resolveSupportedTransports(agent: DetectedAgent): string[] | undefined {
    try {
      return mcpService.getSupportedTransportsForAgent(agent);
    } catch {
      return undefined;
    }
  }
}

export const teamAgentCatalog = new TeamAgentCatalog();
