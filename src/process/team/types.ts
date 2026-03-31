// src/process/team/types.ts

/** Role of a teammate within a team */
export type TeammateRole = 'lead' | 'teammate'

/** Lifecycle status of a teammate agent */
export type TeammateStatus = 'pending' | 'idle' | 'active' | 'completed' | 'failed'

/** Workspace sharing strategy for the team */
export type WorkspaceMode = 'shared' | 'isolated'

/** Persisted agent configuration within a team */
export type TeamAgent = {
  slotId: string // unique within this team, e.g. "slot-abc123"
  conversationId: string // corresponding TChatConversation id
  role: TeammateRole
  agentType: string // claude, gemini, codex, qwen, etc.
  agentName: string // display name shown in tab
  conversationType: string // acp, gemini, codex, etc.
  status: TeammateStatus
}

/** Persisted team record (stored in SQLite `teams` table) */
export type TTeam = {
  id: string
  userId: string
  name: string
  workspace: string
  workspaceMode: WorkspaceMode
  leadAgentId: string // slotId of the lead agent
  agents: TeamAgent[]
  createdAt: number
  updatedAt: number
}

/**
 * An inter-agent mailbox message for asynchronous communication
 * between teammates inside a team.
 */
export type MailboxMessage = {
  id: string
  teamId: string
  toAgentId: string
  fromAgentId: string
  type: 'message' | 'idle_notification' | 'shutdown_request'
  content: string
  summary?: string
  read: boolean
  createdAt: number
}

/** A unit of work tracked inside a team's shared task board */
export type TeamTask = {
  id: string
  teamId: string
  subject: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'deleted'
  owner?: string // slotId of the assigned agent
  blockedBy: string[] // task ids this task depends on
  blocks: string[] // task ids that depend on this task
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

/**
 * Payload sent by an agent when it becomes idle, carrying the
 * reason and an optional summary of completed work.
 */
export type IdleNotification = {
  type: 'idle_notification'
  idleReason: 'available' | 'interrupted' | 'failed'
  summary: string
  completedTaskId?: string
  failureReason?: string
}

/** Platform capability flags used by the adapter layer */
export type PlatformCapability = {
  supportsToolUse: boolean
  supportsStreaming: boolean
}

/**
 * Discriminated union of all structured actions an agent can emit.
 * Replaces the old `AssignTask` type.
 */
export type ParsedAction =
  | { type: 'send_message'; to: string; content: string; summary?: string }
  | { type: 'task_create'; subject: string; description?: string; owner?: string }
  | { type: 'task_update'; taskId: string; status?: string; owner?: string }
  | { type: 'idle_notification'; reason: string; summary: string; completedTaskId?: string }
  | { type: 'plain_response'; content: string }

/** IPC event pushed to renderer when agent status changes */
export type ITeamAgentStatusEvent = {
  teamId: string
  slotId: string
  status: TeammateStatus
  lastMessage?: string
}

/** IPC event for streaming agent messages to renderer */
export type ITeamMessageEvent = {
  teamId: string
  slotId: string
  type: string
  data: unknown
  msg_id: string
  conversation_id: string
}
