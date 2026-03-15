import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('channels/SessionManager', () => {
  const db = {
    deleteChannelSession: vi.fn(),
    getChannelSessions: vi.fn(),
    getChannelUserByPlatform: vi.fn(),
    upsertChannelSession: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();

    db.getChannelSessions.mockReturnValue({ success: true, data: [] });
    db.getChannelUserByPlatform.mockReturnValue({ success: true, data: null });

    vi.doMock('../../../src/process/database', () => ({
      getDatabase: () => db,
    }));
  });

  it('clears only sessions that belong to the targeted plugin instance', async () => {
    const { SessionManager } = await import('../../../src/channels/core/SessionManager');
    const manager = new SessionManager();

    const botAUser = {
      id: 'user-a',
      platformUserId: 'platform-a',
      platformType: 'telegram',
      pluginId: 'telegram_bot_a',
      authorizedAt: 1,
    } as const;
    const botBUser = {
      id: 'user-b',
      platformUserId: 'platform-b',
      platformType: 'telegram',
      pluginId: 'telegram_bot_b',
      authorizedAt: 1,
    } as const;

    const sessionA = manager.createSessionWithConversation(botAUser, 'conv-a', 'gemini', 'C:\\workspace\\a', 'chat-a');
    const sessionB = manager.createSessionWithConversation(botBUser, 'conv-b', 'codex', 'C:\\workspace\\b', 'chat-b');

    expect(manager.clearSessionsByPlugin('telegram_bot_a')).toBe(1);
    expect(manager.getSession('user-a', 'chat-a')).toBeNull();
    expect(manager.getSession('user-b', 'chat-b')?.id).toBe(sessionB.id);
    expect(db.deleteChannelSession).toHaveBeenCalledWith(sessionA.id);
  });

  it('prefers the exact chat for confirmations and otherwise falls back within the same plugin only', async () => {
    vi.setSystemTime(new Date('2026-03-16T08:00:00.000Z'));

    const { SessionManager } = await import('../../../src/channels/core/SessionManager');
    const manager = new SessionManager();

    const pluginUser = {
      id: 'shared-user',
      platformUserId: 'platform-shared',
      platformType: 'telegram',
      pluginId: 'telegram_bot_a',
      authorizedAt: 1,
    } as const;
    const otherPluginUser = {
      ...pluginUser,
      pluginId: 'telegram_bot_b',
    } as const;

    const exactSession = manager.createSessionWithConversation(pluginUser, 'conv-1', 'gemini', undefined, 'chat-1');
    vi.setSystemTime(new Date('2026-03-16T08:01:00.000Z'));
    const latestSamePlugin = manager.createSessionWithConversation(pluginUser, 'conv-2', 'codex', undefined, 'chat-2');
    vi.setSystemTime(new Date('2026-03-16T08:02:00.000Z'));
    manager.createSessionWithConversation(otherPluginUser, 'conv-3', 'gemini', undefined, 'chat-3');

    expect(manager.findConfirmationSession('shared-user', 'telegram_bot_a', 'chat-1')?.id).toBe(exactSession.id);
    expect(manager.findConfirmationSession('shared-user', 'telegram_bot_a', 'missing-chat')?.id).toBe(latestSamePlugin.id);
    expect(manager.findConfirmationSession('shared-user', 'telegram_bot_b', 'missing-chat')?.pluginId).toBe('telegram_bot_b');
  });
});
