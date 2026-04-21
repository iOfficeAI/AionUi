// src/common/types/teamTypes.ts
// Shared team types used by both main process and renderer.
// Renderer code should import from here instead of @process/team/types.

import type { AcpInitializeResult } from './acpTypes';

/**
 * Backends known to support team mode without needing a cached initialize result.
 * These are hardcoded so that team creation works even before the first conversation
 * populates cachedInitializeResult (e.g. right after an upgrade).
 *
 * TODO: temporary workaround — remove once cachedInitializeResult is populated
 * eagerly (e.g. at app startup or first backend detection) instead of lazily
 * after the first user conversation.
 */
const KNOWN_TEAM_CAPABLE_BACKENDS = new Set(['gemini', 'claude', 'codex', 'aionrs']);

/**
 * Check if an agent backend is team-capable.
 * Known backends (gemini, claude, codex, snow) are always team-capable.
 * Other ACP agents are team-capable when their cached initialize response includes mcpCapabilities.stdio.
 */
export function isTeamCapableBackend(
  backend: string,
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined
): boolean {
  if (KNOWN_TEAM_CAPABLE_BACKENDS.has(backend)) return true;
  const initResult = cachedInitResults?.[backend];
  return initResult?.capabilities.mcpCapabilities.stdio === true;
}

/**
 * Get all team-capable backends from cached initialize results.
 * Always includes 'gemini'. ACP backends included if their cached
 * initialize result shows mcpCapabilities.stdio === true.
 */
export function getTeamCapableBackends(
  detectedBackends: string[],
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined
): string[] {
  return detectedBackends.filter((b) => isTeamCapableBackend(b, cachedInitResults));
}

/** Role of a teammate within a team */
export type TeammateRole = 'leader' | 'teammate';

/** Lifecycle status of a teammate agent */
export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed';

/** Workspace sharing strategy for the team */
export type WorkspaceMode = 'shared' | 'isolated';

/** Persisted agent configuration within a team */
export type TeamAgent = {
  slotId: string;
  conversationId: string;
  role: TeammateRole;
  agentType: string;
  agentName: string;
  conversationType: string;
  status: TeammateStatus;
  cliPath?: string;
  customAgentId?: string;
  model?: string;
};

/** Persisted team record (stored in SQLite `teams` table) */
export type TTeam = {
  id: string;
  userId: string;
  name: string;
  workspace: string;
  workspaceMode: WorkspaceMode;
  leaderAgentId: string;
  agents: TeamAgent[];
  /** Current session permission mode (e.g. 'plan', 'auto'). Persisted so newly spawned agents inherit it. */
  sessionMode?: string;
  createdAt: number;
  updatedAt: number;
};

/** IPC event pushed to renderer when agent status changes */
export type ITeamAgentStatusEvent = {
  teamId: string;
  slotId: string;
  status: TeammateStatus;
  lastMessage?: string;
};

/** IPC event pushed to renderer when a new agent is spawned at runtime */
export type ITeamAgentSpawnedEvent = {
  teamId: string;
  agent: TeamAgent;
};

/** IPC event pushed to renderer when an agent is removed from the team */
export type ITeamAgentRemovedEvent = {
  teamId: string;
  slotId: string;
};

/** IPC event pushed to renderer when an agent is renamed */
export type ITeamAgentRenamedEvent = {
  teamId: string;
  slotId: string;
  oldName: string;
  newName: string;
};

/** IPC event pushed to renderer when the team list changes (created/removed/agent changes) */
export type ITeamListChangedEvent = {
  teamId: string;
  action: 'created' | 'removed' | 'agent_added' | 'agent_removed';
};

/** IPC event for streaming agent messages to renderer */
export type ITeamMessageEvent = {
  teamId: string;
  slotId: string;
  type: string;
  data: unknown;
  msg_id: string;
  conversation_id: string;
};

/** Phase of the MCP injection pipeline */
export type TeamMcpPhase =
  | 'tcp_ready'
  | 'tcp_error'
  | 'session_injecting'
  | 'session_ready'
  | 'session_error'
  | 'load_failed'
  | 'degraded'
  | 'config_write_failed'
  | 'mcp_tools_waiting'
  | 'mcp_tools_ready';

/** IPC event for MCP injection pipeline status */
export type ITeamMcpStatusEvent = {
  teamId: string;
  slotId?: string;
  phase: TeamMcpPhase;
  serverCount?: number;
  port?: number;
  error?: string;
};
