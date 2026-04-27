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
    team_id: string;
    to_agent_id: string;
    from_agent_id: string;
    content: string;
    type?: MailboxMessage['type'];
    summary?: string;
    files?: string[];
  }): Promise<MailboxMessage> {
    const message: MailboxMessage = {
      id: crypto.randomUUID(),
      team_id: params.team_id,
      to_agent_id: params.to_agent_id,
      from_agent_id: params.from_agent_id,
      type: params.type ?? 'message',
      content: params.content,
      summary: params.summary,
      files: params.files,
      read: false,
      created_at: Date.now(),
    };

    return this.repo.writeMessage(message);
  }

  /**
   * Read all unread messages for an agent, atomically marking them as read.
   * Uses a single transaction to prevent concurrent double-reads.
   */
  async readUnread(team_id: string, agentId: string): Promise<MailboxMessage[]> {
    return this.repo.readUnreadAndMark(team_id, agentId);
  }

  /**
   * Get message history for an agent (newest first).
   */
  async getHistory(team_id: string, agentId: string, limit?: number): Promise<MailboxMessage[]> {
    return this.repo.getMailboxHistory(team_id, agentId, limit);
  }
}
