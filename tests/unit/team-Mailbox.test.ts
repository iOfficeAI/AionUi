// tests/unit/team-Mailbox.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Mailbox } from '@process/team/Mailbox';
import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { MailboxMessage } from '@process/team/types';

function makeMessage(overrides: Partial<MailboxMessage> = {}): MailboxMessage {
  return {
    id: 'msg-1',
    teamId: 'team-1',
    toAgentId: 'slot-2',
    fromAgentId: 'slot-1',
    type: 'message',
    content: 'Hello teammate',
    read: false,
    createdAt: 1000,
    ...overrides,
  };
}

function makeRepo(): ITeamRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMailboxByTeam: vi.fn(),
    deleteTasksByTeam: vi.fn(),
    writeMessage: vi.fn(),
    readUnread: vi.fn(),
    readUnreadAndMark: vi.fn(),
    markRead: vi.fn(),
    getMailboxHistory: vi.fn(),
    createTask: vi.fn(),
    findTaskById: vi.fn(),
    updateTask: vi.fn(),
    findTasksByTeam: vi.fn(),
    findTasksByOwner: vi.fn(),
    deleteTask: vi.fn(),
    appendToBlocks: vi.fn(),
    removeFromBlockedBy: vi.fn(),
  } as unknown as ITeamRepository;
}

describe('Mailbox', () => {
  let repo: ITeamRepository;
  let mailbox: Mailbox;

  beforeEach(() => {
    repo = makeRepo();
    mailbox = new Mailbox(repo);
    vi.clearAllMocks();
  });

  describe('write', () => {
    it('creates a MailboxMessage with default type "message"', async () => {
      const persisted = makeMessage();
      vi.mocked(repo.writeMessage).mockResolvedValue(persisted);

      const result = await mailbox.write({
        teamId: 'team-1',
        toAgentId: 'slot-2',
        fromAgentId: 'slot-1',
        content: 'Hello teammate',
      });

      expect(repo.writeMessage).toHaveBeenCalledOnce();
      const arg = vi.mocked(repo.writeMessage).mock.calls[0][0];
      expect(arg.type).toBe('message');
      expect(arg.read).toBe(false);
      expect(arg.teamId).toBe('team-1');
      expect(arg.toAgentId).toBe('slot-2');
      expect(arg.fromAgentId).toBe('slot-1');
      expect(arg.content).toBe('Hello teammate');
      expect(typeof arg.id).toBe('string');
      expect(arg.id).toHaveLength(36); // UUID format
      expect(result).toBe(persisted);
    });

    it('respects explicit type "idle_notification"', async () => {
      const persisted = makeMessage({ type: 'idle_notification' });
      vi.mocked(repo.writeMessage).mockResolvedValue(persisted);

      await mailbox.write({
        teamId: 'team-1',
        toAgentId: 'slot-2',
        fromAgentId: 'slot-1',
        content: 'Done',
        type: 'idle_notification',
      });

      const arg = vi.mocked(repo.writeMessage).mock.calls[0][0];
      expect(arg.type).toBe('idle_notification');
    });

    it('passes through optional summary field', async () => {
      const persisted = makeMessage({ summary: 'brief summary' });
      vi.mocked(repo.writeMessage).mockResolvedValue(persisted);

      await mailbox.write({
        teamId: 'team-1',
        toAgentId: 'slot-2',
        fromAgentId: 'slot-1',
        content: 'Work done',
        summary: 'brief summary',
      });

      const arg = vi.mocked(repo.writeMessage).mock.calls[0][0];
      expect(arg.summary).toBe('brief summary');
    });

    it('passes through optional files array', async () => {
      const persisted = makeMessage({ files: ['/tmp/a.png', '/tmp/b.txt'] });
      vi.mocked(repo.writeMessage).mockResolvedValue(persisted);

      await mailbox.write({
        teamId: 'team-1',
        toAgentId: 'slot-2',
        fromAgentId: 'slot-1',
        content: 'With files',
        files: ['/tmp/a.png', '/tmp/b.txt'],
      });

      const arg = vi.mocked(repo.writeMessage).mock.calls[0][0];
      expect(arg.files).toEqual(['/tmp/a.png', '/tmp/b.txt']);
    });

    it('leaves files undefined when not provided', async () => {
      vi.mocked(repo.writeMessage).mockResolvedValue(makeMessage());

      await mailbox.write({
        teamId: 'team-1',
        toAgentId: 'slot-2',
        fromAgentId: 'slot-1',
        content: 'No files',
      });

      const arg = vi.mocked(repo.writeMessage).mock.calls[0][0];
      expect(arg.files).toBeUndefined();
    });

    it('assigns unique IDs to each message', async () => {
      const ids: string[] = [];
      vi.mocked(repo.writeMessage).mockImplementation(async (msg) => {
        ids.push(msg.id);
        return msg;
      });

      await mailbox.write({ teamId: 'team-1', toAgentId: 'a', fromAgentId: 'b', content: 'msg1' });
      await mailbox.write({ teamId: 'team-1', toAgentId: 'a', fromAgentId: 'b', content: 'msg2' });

      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  describe('readUnread', () => {
    it('returns messages from repo using atomic readUnreadAndMark', async () => {
      const messages = [makeMessage({ id: 'msg-1' }), makeMessage({ id: 'msg-2' })];
      vi.mocked(repo.readUnreadAndMark).mockResolvedValue(messages);

      const result = await mailbox.readUnread('team-1', 'slot-2');

      expect(result).toEqual(messages);
      expect(repo.readUnreadAndMark).toHaveBeenCalledWith('team-1', 'slot-2');
    });

    it('returns empty array when no unread messages', async () => {
      vi.mocked(repo.readUnreadAndMark).mockResolvedValue([]);

      const result = await mailbox.readUnread('team-1', 'slot-2');

      expect(result).toEqual([]);
    });
  });

  describe('getHistory', () => {
    it('delegates to repo.getMailboxHistory with teamId and agentId', async () => {
      const history = [makeMessage({ read: true })];
      vi.mocked(repo.getMailboxHistory).mockResolvedValue(history);

      const result = await mailbox.getHistory('team-1', 'slot-2');

      expect(result).toEqual(history);
      expect(repo.getMailboxHistory).toHaveBeenCalledWith('team-1', 'slot-2', undefined);
    });

    it('passes limit parameter to repo', async () => {
      vi.mocked(repo.getMailboxHistory).mockResolvedValue([]);

      await mailbox.getHistory('team-1', 'slot-2', 10);

      expect(repo.getMailboxHistory).toHaveBeenCalledWith('team-1', 'slot-2', 10);
    });
  });
});
