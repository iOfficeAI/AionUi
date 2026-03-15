import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('channels/SystemActions', () => {
  const processConfigGet = vi.fn();
  const processConfigSet = vi.fn();
  const createChannelConversation = vi.fn();
  const loadStoredChannelAgent = vi.fn();
  const clearContext = vi.fn();
  const killConversation = vi.fn();
  const sessionManager = {
    clearSession: vi.fn(),
    createSessionWithConversation: vi.fn(),
    getSession: vi.fn(),
  };
  const syncChannelSettings = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    processConfigGet.mockImplementation(async (key: string) => {
      if (key === 'model.config') {
        return [
          {
            id: 'provider-1',
            platform: 'gemini',
            apiKey: 'test-key',
            model: ['gemini-2.0-flash'],
          },
        ];
      }
      return undefined;
    });

    sessionManager.getSession.mockReturnValue(null);
    syncChannelSettings.mockResolvedValue({ success: true });
    createChannelConversation.mockResolvedValue({
      success: true,
      channelAgentType: 'codex',
      conversation: {
        id: 'conv-codex-1',
        extra: {
          workspace: 'C:\\workspace\\bot',
        },
      },
    });
    loadStoredChannelAgent.mockResolvedValue({ backend: 'gemini', name: 'Gemini' });

    vi.doMock('../../../src/agent/acp/AcpDetector', () => ({
      acpDetector: {
        getDetectedAgents: () => [
          { backend: 'claude', name: 'Claude' },
          { backend: 'codex', name: 'Codex' },
        ],
      },
    }));

    vi.doMock('../../../src/process/initStorage', () => ({
      ProcessConfig: {
        get: processConfigGet,
        set: processConfigSet,
      },
    }));

    vi.doMock('../../../src/channels/utils/channelConversationConfig', () => ({
      createChannelConversation,
      loadStoredChannelAgent,
    }));

    vi.doMock('../../../src/channels/core/ChannelManager', () => ({
      getChannelManager: () => ({
        getSessionManager: () => sessionManager,
        syncChannelSettings,
      }),
    }));

    vi.doMock('../../../src/channels/agent/ChannelMessageService', () => ({
      getChannelMessageService: () => ({
        clearContext,
      }),
    }));

    vi.doMock('../../../src/process/WorkerManage', () => ({
      default: {
        kill: killConversation,
      },
    }));
  });

  it('shows the stored bot agent when there is no active session', async () => {
    loadStoredChannelAgent.mockResolvedValueOnce({ backend: 'codex', name: 'Codex' });

    const { handleAgentShow } = await import('../../../src/channels/actions/SystemActions');
    const result = await handleAgentShow({
      platform: 'telegram',
      pluginId: 'telegram_bot_1',
      pairingService: {} as any,
      userId: 'platform-user',
      chatId: 'chat-1',
      channelUser: { id: 'user-1' } as any,
      originalMessage: {} as any,
      sendMessage: vi.fn(),
      editMessage: vi.fn(),
    });

    expect(loadStoredChannelAgent).toHaveBeenCalledWith('telegram', 'telegram_bot_1');
    expect(result.message?.text).toContain('Current: <b>⚡ Codex</b>');
  });

  it('persists plugin-scoped agent settings and creates a real conversation for the new bot agent', async () => {
    const { handleAgentSelect } = await import('../../../src/channels/actions/SystemActions');

    const channelUser = {
      id: 'user-1',
      platformUserId: 'platform-user',
      platformType: 'telegram',
      pluginId: 'telegram_bot_1',
      authorizedAt: 1,
    };

    const result = await handleAgentSelect(
      {
        platform: 'telegram',
        pluginId: 'telegram_bot_1',
        pairingService: {} as any,
        userId: 'platform-user',
        chatId: 'chat-1',
        channelUser,
        originalMessage: {} as any,
        sendMessage: vi.fn(),
        editMessage: vi.fn(),
      },
      { agentType: 'codex' }
    );

    expect(processConfigSet).toHaveBeenCalledWith(
      'assistant.plugin.telegram_bot_1.agent',
      expect.objectContaining({
        backend: 'codex',
        name: 'Codex',
      })
    );
    expect(syncChannelSettings).toHaveBeenCalledWith('telegram', expect.objectContaining({ backend: 'codex' }), undefined, 'telegram_bot_1');
    expect(createChannelConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'telegram',
        pluginId: 'telegram_bot_1',
        chatId: 'chat-1',
      })
    );
    expect(sessionManager.createSessionWithConversation).toHaveBeenCalledWith(channelUser, 'conv-codex-1', 'codex', 'C:\\workspace\\bot', 'chat-1');
    expect(result.success).toBe(true);
    expect(result.message?.text).toContain('Switched to ⚡ Codex');
  });

  it('keeps legacy platform settings in sync for the default plugin instance', async () => {
    const { handleAgentSelect } = await import('../../../src/channels/actions/SystemActions');

    await handleAgentSelect(
      {
        platform: 'telegram',
        pluginId: 'telegram_default',
        pairingService: {} as any,
        userId: 'platform-user',
        chatId: 'chat-1',
        channelUser: {
          id: 'user-1',
          platformUserId: 'platform-user',
          platformType: 'telegram',
          pluginId: 'telegram_default',
          authorizedAt: 1,
        } as any,
        originalMessage: {} as any,
        sendMessage: vi.fn(),
        editMessage: vi.fn(),
      },
      { agentType: 'codex' }
    );

    expect(processConfigSet).toHaveBeenCalledWith('assistant.plugin.telegram_default.agent', expect.objectContaining({ backend: 'codex' }));
    expect(processConfigSet).toHaveBeenCalledWith('assistant.telegram.agent', expect.objectContaining({ backend: 'codex' }));
  });
});
