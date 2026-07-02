// src/common/types/teamTypes.ts
// Shared team types used by both main process and renderer.
// Renderer code should import from here instead of @process/team/types.

/** Role of a teammate within a team */
export type TeammateRole = 'leader' | 'teammate';

/** Backend runtime status value as delivered by Team WebSocket events */
export type BackendTeammateStatus = string;

/** Lifecycle status of a teammate agent after frontend normalization */
export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed';

/** Workspace sharing strategy for the team */
export type WorkspaceMode = 'shared' | 'isolated';

/** Persisted assistant configuration within a team */
export type TeamAssistant = {
  slot_id: string;
  conversation_id: string;
  role: TeammateRole;
  assistant_backend: string;
  icon?: string;
  assistant_name: string;
  status: TeammateStatus;
  cli_path?: string;
  assistant_id?: string;
  model?: string;
  pending_confirmations?: number;
};

/** Persisted team record (stored in SQLite `teams` table) */
export type TTeam = {
  id: string;
  user_id: string;
  name: string;
  workspace: string;
  workspace_mode: WorkspaceMode;
  leader_assistant_id: string;
  assistants: TeamAssistant[];
  /** @deprecated Use leader_assistant_id. */
  leader_agent_id?: string;
  /** @deprecated Use assistants. */
  agents?: TeamAssistant[];
  /** Current session permission mode (e.g. 'plan', 'auto'). Persisted so newly spawned assistants inherit it. */
  session_mode?: string;
  created_at: number;
  updated_at: number;
};

export type ISendTeamMessageParams = {
  team_id: string;
  input: string;
  files?: string[];
};

export type ISendTeamAgentMessageParams = ISendTeamMessageParams & {
  slot_id: string;
};

export type TeamRunTargetRole = 'lead' | 'teammate';
export type TeamRunStatus = 'accepted' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed';

export type ITeamSlotWork = {
  slot_id: string;
  role: TeamRunTargetRole;
  pending_wake_count: number;
  starting_child_count: number;
  paused?: boolean;
  suppressed_wake_count?: number;
  active_turn_id?: string;
  active_turn_started_at_ms?: number;
  active_turn_elapsed_ms?: number;
  active_turn_slow?: boolean;
  active_turn_slow_threshold_ms?: number;
  runtime_health?: 'disconnected' | 'unhealthy';
};

export type ITeamRunAck = {
  team_run_id: string;
  team_id: string;
  target_slot_id: string;
  target_role: TeamRunTargetRole;
  accepted_slot_id: string;
  accepted_role: TeamRunTargetRole;
  status: TeamRunStatus;
  message_id?: string;
};

export type ICancelTeamRunParams = {
  team_id: string;
  team_run_id: string;
  target_slot_id?: string;
  reason?: string;
};

export type ICancelTeamChildTurnParams = ICancelTeamRunParams & {
  slot_id: string;
};

export type IPauseTeamSlotParams = ICancelTeamChildTurnParams;

export type ITeamRunEvent = {
  team_id: string;
  team_run_id: string;
  target_slot_id: string;
  target_role: TeamRunTargetRole;
  status: TeamRunStatus;
  active_child_count: number;
  pending_wake_count: number;
  starting_child_count: number;
  slot_work?: ITeamSlotWork[];
};

export type ITeamRunStateResponse = {
  active_run: ITeamRunEvent | null;
};

export type ITeamChildTurnEvent = {
  team_id: string;
  team_run_id: string;
  slot_id: string;
  role: TeamRunTargetRole;
  conversation_id: string;
  turn_id: string;
  status: TeamRunStatus;
};

/** IPC event pushed to renderer when agent status changes */
export type ITeamAgentStatusEvent = {
  team_id: string;
  slot_id: string;
  status: BackendTeammateStatus;
  last_message?: string;
};

/** IPC event pushed to renderer when a new agent is spawned at runtime */
export type ITeamAgentSpawnedEvent = {
  team_id: string;
  assistant: TeamAssistant;
  /** @deprecated Use assistant. */
  agent?: TeamAssistant;
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
  name: string;
};

/** IPC event pushed to renderer when the team list changes (created/removed/agent changes) */
export type ITeamListChangedEvent = {
  team_id: string;
  action: 'created' | 'removed' | 'renamed' | 'agent_added' | 'agent_removed';
};

/** IPC event pushed when a new team is created (backend `team.created` WS event) */
export type ITeamCreatedEvent = {
  team_id: string;
  team_name: string;
};

/** IPC event pushed when a team is removed */
export type ITeamRemovedEvent = {
  team_id: string;
};

/** IPC event pushed when a team is renamed */
export type ITeamRenamedEvent = {
  team_id: string;
  team_name: string;
};

/** IPC event for real-time teammate-to-teammate messages */
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

/** IPC event pushed when a Team task board item changes */
export type ITeamTaskChangedEvent = {
  team_id: string;
  task_id?: string;
  action?: string;
};

/** IPC event pushed when Team session lifecycle changes */
export type ITeamSessionChangedEvent = {
  team_id: string;
  status?: string;
  error?: string;
};
