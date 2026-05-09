// src/common/types/teamTypes.ts
// Shared team types used by both main process and renderer.
// Renderer code should import from here instead of @process/team/types.

/** Role of a teammate within a team */
export type TeammateRole = 'leader' | 'teammate';

// Backend statuses: idle|working|thinking|tool_use|completed|error → mapped via teamMapper.toStatus()
/** Lifecycle status of a teammate agent */
export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed';

/** Workspace sharing strategy for the team */
export type WorkspaceMode = 'shared' | 'isolated';

/** Persisted agent configuration within a team */
export type TeamAgent = {
  slot_id: string;
  conversation_id: string;
  role: TeammateRole;
  agent_type: string;
  icon?: string;
  agent_name: string;
  conversation_type: string;
  status: TeammateStatus;
  cli_path?: string;
  custom_agent_id?: string;
  model?: string;
};

/** Persisted team record (stored in SQLite `teams` table) */
export type TTeam = {
  id: string;
  user_id: string;
  name: string;
  workspace: string;
  workspace_mode: WorkspaceMode;
  leader_agent_id: string;
  agents: TeamAgent[];
  /** Current session permission mode (e.g. 'plan', 'auto'). Persisted so newly spawned agents inherit it. */
  session_mode?: string;
  created_at: number;
  updated_at: number;
};

/** IPC event pushed to renderer when agent status changes */
export type ITeamAgentStatusEvent = {
  team_id: string;
  slot_id: string;
  status: TeammateStatus;
  last_message?: string;
};

/** IPC event pushed to renderer when a new agent is spawned at runtime */
export type ITeamAgentSpawnedEvent = {
  team_id: string;
  agent: TeamAgent;
};

/** IPC event pushed to renderer when an agent is removed from the team */
export type ITeamAgentRemovedEvent = {
  team_id: string;
  slot_id: string;
};

/** IPC event pushed to renderer when an agent is renamed */
export type ITeamAgentRenamedEvent = {
  team_id: string;
  slot_id: string;
  old_name: string;
  new_name: string;
};

/** IPC event pushed to renderer when the team list changes (created/removed/agent changes) */
export type ITeamListChangedEvent = {
  team_id: string;
  action: 'created' | 'removed' | 'agent_added' | 'agent_removed';
};

/** IPC event pushed when a new team is created (backend `team.created` WS event) */
export type ITeamCreatedEvent = {
  team_id: string;
  team_name: string;
};

/** IPC event for real-time teammate-to-teammate messages (`team.teammate.message` WS event) */
export type ITeamTeammateMessageEvent = {
  conversation_id: string;
  content: string;
  from_slot_id: string;
  from_name: string;
};

/** IPC event for streaming agent messages to renderer */
export type ITeamMessageEvent = {
  team_id: string;
  slot_id: string;
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
  team_id: string;
  slot_id?: string;
  phase: TeamMcpPhase;
  server_count?: number;
  port?: number;
  error?: string;
};
