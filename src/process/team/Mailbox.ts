// src/process/team/Mailbox.ts
import type { ITeamRepository } from './repository/ITeamRepository';
import type { MailboxMessage } from './types';

/** Thin service layer over ITeamRepository's mailbox methods. */
export class Mailbox {
  constructor(private readonly repo: ITeamRepository) {}

  /**
   * Write a message to an agent's mailbox.
   * @returns The persisted message.
   */
  async write(params: {
    teamId: string;
    toAgentId: string;
    fromAgentId: string;
    content: string;
    type?: MailboxMessage['type'];
    summary?: string;
    files?: string[];
  }): Promise<MailboxMessage> {
    const message: MailboxMessage = {
      id: crypto.randomUUID(),
      teamId: params.teamId,
      toAgentId: params.toAgentId,
      fromAgentId: params.fromAgentId,
      type: params.type ?? 'message',
      content: params.content,
      summary: params.summary,
      files: params.files,
      read: false,
      createdAt: Date.now(),
    };

    return this.repo.writeMessage(message);
  }

  /**
   * Read all unread messages for an agent, atomically marking them as read.
   * Uses a single transaction to prevent concurrent double-reads.
   */
  async readUnread(teamId: string, agentId: string): Promise<MailboxMessage[]> {
    return this.repo.readUnreadAndMark(teamId, agentId);
  }

  /**
   * Get message history for an agent (newest first).
   */
  async getHistory(teamId: string, agentId: string, limit?: number): Promise<MailboxMessage[]> {
    return this.repo.getMailboxHistory(teamId, agentId, limit);
  }
}
