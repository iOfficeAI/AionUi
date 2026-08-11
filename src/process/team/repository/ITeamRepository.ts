// src/process/team/repository/ITeamRepository.ts
import type { MailboxMessage, TeamTask, TTeam } from '../types';

/** Team CRUD + cascade-delete operations */
export interface ITeamCrudRepository {
  create(team: TTeam): Promise<TTeam>;
  findById(id: string): Promise<TTeam | null>;
  findAll(userId: string): Promise<TTeam[]>;
  update(id: string, updates: Partial<TTeam>): Promise<TTeam>;
  delete(id: string): Promise<void>;
  deleteMailboxByTeam(teamId: string): Promise<void>;
  deleteTasksByTeam(teamId: string): Promise<void>;
}

/** Mailbox message persistence */
export interface IMailboxRepository {
  writeMessage(message: MailboxMessage): Promise<MailboxMessage>;
  readUnread(teamId: string, toAgentId: string): Promise<MailboxMessage[]>;
  /** Atomically read all unread messages and mark them as read in one transaction. */
  readUnreadAndMark(teamId: string, toAgentId: string): Promise<MailboxMessage[]>;
  markRead(messageId: string): Promise<void>;
  getMailboxHistory(teamId: string, toAgentId: string, limit?: number): Promise<MailboxMessage[]>;
}

/** Task board persistence */
export interface ITaskRepository {
  createTask(task: TeamTask): Promise<TeamTask>;
  findTaskById(id: string): Promise<TeamTask | null>;
  updateTask(id: string, updates: Partial<TeamTask>): Promise<TeamTask>;
  findTasksByTeam(teamId: string): Promise<TeamTask[]>;
  findTasksByOwner(teamId: string, owner: string): Promise<TeamTask[]>;
  deleteTask(id: string): Promise<void>;
  /** Atomically append a single ID to a task's `blocks` JSON array. */
  appendToBlocks(taskId: string, blockId: string): Promise<void>;
  /** Atomically remove a single ID from a task's `blockedBy` JSON array and return the updated task. */
  removeFromBlockedBy(taskId: string, unblockedId: string): Promise<TeamTask>;
}

/**
 * Combined repository interface for backward compatibility.
 * New code should prefer the focused sub-interfaces above.
 */
export type ITeamRepository = ITeamCrudRepository & IMailboxRepository & ITaskRepository;
