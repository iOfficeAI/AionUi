// src/common/types/teamTypes.ts
// Shared team types used by both main process and renderer.
// Renderer code should import from here instead of @process/team/types.

/**
 * Agent backends verified to support MCP tool injection in team mode.
 * This is the single source of truth — frontend UI, backend spawn validation,
 * and the available-agent-types list passed to the leader prompt all derive from here.
 */
export const TEAM_SUPPORTED_BACKENDS = new Set(['claude', 'codex', 'gemini']);

/** Role of a teammate within a team */
export type TeammateRole = 'lead' | 'teammate';

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
};

/** Persisted team record (stored in SQLite `teams` table) */
export type TTeam = {
  id: string;
  userId: string;
  name: string;
  workspace: string;
  workspaceMode: WorkspaceMode;
  leadAgentId: string;
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

/** IPC event pushed to renderer when the team list changes (created/removed) */
export type ITeamListChangedEvent = {
  teamId: string;
  action: 'created' | 'removed';
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
  | 'config_write_failed';

/** IPC event for MCP injection pipeline status */
export type ITeamMcpStatusEvent = {
  teamId: string;
  slotId?: string;
  phase: TeamMcpPhase;
  serverCount?: number;
  port?: number;
  error?: string;
};
