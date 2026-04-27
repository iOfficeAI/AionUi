// src/process/team/types.ts
//
// Re-export shared types from @/common so existing process-side imports
// continue to work. Renderer code should import from @/common/types/teamTypes.
export type {
  TeammateRole,
  TeammateStatus,
  WorkspaceMode,
  TeamAgent,
  TTeam,
  ITeamAgentSpawnedEvent,
  ITeamAgentStatusEvent,
} from '@/common/types/teamTypes';

// ---------- Process-only types (not needed by renderer) ----------

/**
 * An inter-agent mailbox message for asynchronous communication
 * between teammates inside a team.
 */
export type MailboxMessage = {
  id: string;
  team_id: string;
  to_agent_id: string;
  from_agent_id: string;
  type: 'message' | 'idle_notification' | 'shutdown_request';
  content: string;
  summary?: string;
  files?: string[];
  read: boolean;
  created_at: number;
};

/** A unit of work tracked inside a team's shared task board */
export type TeamTask = {
  id: string;
  team_id: string;
  subject: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
  owner?: string; // slot_id of the assigned agent
  blocked_by: string[]; // task ids this task depends on
  blocks: string[]; // task ids that depend on this task
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
};

/**
 * Payload sent by an agent when it becomes idle, carrying the
 * reason and an optional summary of completed work.
 */
export type IdleNotification = {
  type: 'idle_notification';
  idle_reason: 'available' | 'interrupted' | 'failed';
  summary: string;
  completed_task_id?: string;
  failure_reason?: string;
};
