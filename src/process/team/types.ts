// src/process/team/types.ts

export type TeamAgentRole = 'dispatch' | 'sub';
export type TeamAgentStatus = 'idle' | 'working' | 'done' | 'error';
export type WorkspaceMode = 'shared' | 'isolated';

/** Persisted agent configuration within a team */
export type TeamAgent = {
  slotId: string; // unique within this team, e.g. "slot-abc123"
  conversationId: string; // corresponding TChatConversation id
  role: TeamAgentRole;
  agentType: string; // 'acp' | 'gemini' | 'codex' | ...
  agentName: string; // display name shown in tab
  /** The conversation type for this agent (defaults to agentType if compatible) */
  conversationType?: 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote';
};

/** Persisted team record (stored in SQLite `teams` table) */
export type TTeam = {
  id: string;
  userId: string;
  name: string;
  workspace: string;
  workspaceMode: WorkspaceMode;
  agents: TeamAgent[]; // agents[0] is always the dispatch agent
  createdAt: number;
  updatedAt: number;
};

/** Runtime-only state (never persisted) */
export type TeamAgentRuntime = {
  slotId: string;
  status: TeamAgentStatus;
  lastMessage?: string; // short summary for status badge tooltip
};

/** IPC event pushed to renderer when agent status changes */
export type ITeamAgentStatusEvent = {
  teamId: string;
  slotId: string;
  status: TeamAgentStatus;
  lastMessage?: string;
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

/** Parsed assignment block from dispatch output */
export type AssignTask = {
  slotId: string;
  prompt: string;
};
