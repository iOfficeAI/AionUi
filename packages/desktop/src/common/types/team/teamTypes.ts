// src/common/types/teamTypes.ts
// Shared team types used by both main process and renderer.
// Renderer code should import from here instead of @process/team/types.

import type { ChatFileRef } from '@/common/types/chatFile';

/** Role of a teammate within a team */
export type TeammateRole = 'leader' | 'teammate';

/** Backend runtime status value as delivered by Team WebSocket events */
export type BackendTeammateStatus = string;

/** Lifecycle status of a teammate agent after frontend normalization */
export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed' | 'dormant';

/** Workspace sharing strategy for the team */
export type WorkspaceMode = 'shared' | 'isolated';

export type TeamContextResetAvailability =
  | 'ready'
  | 'initializing'
  | 'busy'
  | 'dormant'
  | 'failed'
  | 'removing'
  | 'session_stopped'
  | 'unsupported'
  | 'leader_not_targetable';

export type TeamContextResetCapability = {
  supported: boolean;
  availability: TeamContextResetAvailability;
};

export type TeamContextResetResponse = {
  reset_status: 'completed' | 'not_applied';
  runtime_status: 'ready' | 'failed';
  preserved_unread_count: number;
};

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
  context_reset: TeamContextResetCapability;
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
  /** Source-tagged file refs; the backend resolves each to an absolute path and
   *  injects it into the message. See {@link ChatFileRef}. */
  files?: ChatFileRef[];
};

export type ISendTeamAgentMessageParams = ISendTeamMessageParams & {
  slot_id: string;
};

export type IInterruptTeamAgentParams = ISendTeamAgentMessageParams & {
  reason?: string;
  queued_policy?: 'retain' | 'discard';
};

export type TeamRunTargetRole = 'lead' | 'teammate';
export type TeamRunStatus = 'accepted' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed';
export type TeamSlotWorkState = 'idle' | 'queued' | 'starting' | 'running' | 'paused' | 'blocked';
export type TeamSlotBlockedReason = 'runtime_starting' | 'runtime_failed' | 'removing' | 'session_stopped';
export type TeamMessageEnqueueStatus = 'accepted' | 'queued' | 'blocked_runtime_starting';

export type ITeamSlotWork = {
  slot_id: string;
  role: TeamRunTargetRole;
  state: TeamSlotWorkState;
  queued_foreground_count: number;
  queued_background_count: number;
  active_turn_id: string | null;
  active_turn_started_at_ms: number | null;
  active_turn_elapsed_ms: number | null;
  active_turn_slow: boolean | null;
  active_turn_slow_threshold_ms: number | null;
  blocked_reason: TeamSlotBlockedReason | null;
  team_run_id: string | null;
};

export type ITeamRunAck = {
  enqueue_status: TeamMessageEnqueueStatus;
  message_id: string;
  run: ITeamRunEvent;
};

export type ITeamInterruptAgentResponse = {
  outcome: 'interrupted' | 'queued_no_active_turn' | 'completed_race';
  interrupted_turn_id?: string;
  message_id: string;
  target: ITeamSlotWork;
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
  source: 'user_message' | 'system_lifecycle';
  has_user_intervention: boolean;
  target_slot_id: string;
  target_role: TeamRunTargetRole;
  status: TeamRunStatus;
  queued_intent_count: number;
  starting_batch_count: number;
  running_batch_count: number;
  active_enqueue_lease_count: number;
  slot_work: ITeamSlotWork[];
};

export type ITeamRunStateResponse = {
  session_generation?: string | null;
  active_run: ITeamRunEvent | null;
  slot_work?: ITeamSlotWork[];
};

export type ITeamChildTurnEvent = {
  team_id: string;
  team_run_id: string;
  slot_id: string;
  role: TeamRunTargetRole;
  conversation_id: string;
  turn_id: string;
  status: TeamRunStatus;
  reason?: string;
  replacement_message_id?: string;
};

/**
 * IPC event pushed to the renderer whenever a single slot's work state
 * transitions, independently of any team run. `team.run*` events only carry
 * `slot_work` for slots bound to the active tracked run, so run-less work (e.g.
 * a leader self-wake draining its mailbox) would otherwise leave the per-slot
 * view stale. Consumers update the one slot verbatim.
 */
export type ITeamSlotWorkChangedEvent = {
  team_id: string;
  slot_work: ITeamSlotWork;
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

export type TeamAgentRuntimeStatus = 'dormant' | 'pending' | 'ready' | 'failed';

/** IPC event pushed to renderer when a team member runtime attach/warmup status changes */
export type ITeamAgentRuntimeStatusEvent = {
  team_id: string;
  slot_id: string;
  conversation_id: string;
  status: TeamAgentRuntimeStatus;
  error?: string;
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

/** Team-level session availability status. */
export type TeamSessionStatus = 'starting' | 'ready' | 'failed' | 'stopped';

/** Diagnostic phase for team session startup. */
export type TeamSessionPhase = 'loading_team' | 'starting_bridge' | 'attaching_agents' | 'recovering';

/** IPC event for team session lifecycle status. */
export type ITeamSessionStatusChangedEvent = {
  team_id: string;
  status: TeamSessionStatus;
  phase?: TeamSessionPhase;
  server_count?: number;
  error?: string;
};

/** Read-only mailbox message for the team activity view (matches backend TeamMailboxMessageResponse). */
export type ITeamMailboxMessage = {
  id: string;
  team_id: string;
  from_agent_id: string;
  to_agent_id: string;
  msg_type: string;
  content: string;
  summary?: string;
  files: string[];
  read: boolean;
  created_at: number;
};

/** Read-only task for the team activity view (matches backend TeamTaskResponse; no metadata). */
export type ITeamTaskItem = {
  id: string;
  team_id: string;
  subject: string;
  description?: string;
  status: string;
  owner?: string;
  blocked_by: string[];
  blocks: string[];
  created_at: number;
  updated_at: number;
};

/** One entry of the unified team activity feed (matches backend TeamActivityItemResponse). */
export type ITeamActivityItem =
  | { kind: 'message'; created_at: number; id: string; message: ITeamMailboxMessage }
  | { kind: 'task'; created_at: number; id: string; task: ITeamTaskItem };

/** One keyset-paginated page of the unified activity feed. */
export type ITeamActivityPage = {
  items: ITeamActivityItem[];
  next_cursor?: { ts: number; id: string };
  has_more: boolean;
};

/** IPC event pushed when a Team task board item changes.
 *
 * The `task`/`change` fields carry the full payload used by the activity view;
 * the legacy `task_id`/`action` fields are kept optional for back-compat. */
export type ITeamTaskChangedEvent = {
  team_id: string;
  task_id?: string;
  action?: string;
  task?: ITeamTaskItem;
  change?: 'created' | 'updated';
};

/** IPC event pushed when a Team mailbox message is written or marked read. */
export type ITeamMailboxChangedEvent = {
  team_id: string;
  message: ITeamMailboxMessage;
  change: 'created' | 'read';
};

/** IPC event pushed when Team session lifecycle changes */
export type ITeamSessionChangedEvent = {
  team_id: string;
  status?: string;
  error?: string;
};
