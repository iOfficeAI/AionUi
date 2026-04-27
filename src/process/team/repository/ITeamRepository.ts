// src/process/team/repository/ITeamRepository.ts
import type { MailboxMessage, TeamTask, TTeam } from '../types';

/** Team CRUD + cascade-delete operations */
export interface ITeamCrudRepository {
  create(team: TTeam): Promise<TTeam>;
  findById(id: string): Promise<TTeam | null>;
  findAll(user_id: string): Promise<TTeam[]>;
  update(id: string, updates: Partial<TTeam>): Promise<TTeam>;
  delete(id: string): Promise<void>;
  deleteMailboxByTeam(team_id: string): Promise<void>;
  deleteTasksByTeam(team_id: string): Promise<void>;
}

/** Mailbox message persistence */
export interface IMailboxRepository {
  writeMessage(message: MailboxMessage): Promise<MailboxMessage>;
  readUnread(team_id: string, to_agent_id: string): Promise<MailboxMessage[]>;
  /** Atomically read all unread messages and mark them as read in one transaction. */
  readUnreadAndMark(team_id: string, to_agent_id: string): Promise<MailboxMessage[]>;
  markRead(message_id: string): Promise<void>;
  getMailboxHistory(team_id: string, to_agent_id: string, limit?: number): Promise<MailboxMessage[]>;
}

/** Task board persistence */
export interface ITaskRepository {
  createTask(task: TeamTask): Promise<TeamTask>;
  findTaskById(id: string): Promise<TeamTask | null>;
  updateTask(id: string, updates: Partial<TeamTask>): Promise<TeamTask>;
  findTasksByTeam(team_id: string): Promise<TeamTask[]>;
  findTasksByOwner(team_id: string, owner: string): Promise<TeamTask[]>;
  deleteTask(id: string): Promise<void>;
  /** Atomically append a single ID to a task's `blocks` JSON array. */
  appendToBlocks(task_id: string, block_id: string): Promise<void>;
  /** Atomically remove a single ID from a task's `blocked_by` JSON array and return the updated task. */
  removeFromBlockedBy(task_id: string, unblocked_id: string): Promise<TeamTask>;
}

/**
 * Combined repository interface for backward compatibility.
 * New code should prefer the focused sub-interfaces above.
 */
export type ITeamRepository = ITeamCrudRepository & IMailboxRepository & ITaskRepository;
