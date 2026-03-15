import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('channels/channelConversationConfig', () => {
  const processConfigGet = vi.fn();
  const createGeminiConversation = vi.fn();
  const createConversation = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock('../../../src/process/initStorage', () => ({
      ProcessConfig: {
        get: processConfigGet,
      },
    }));

    vi.doMock('../../../src/process/services/conversationService', () => ({
      ConversationService: {
        createGeminiConversation,
        createConversation,
      },
    }));

    vi.doMock('../../../src/extensions', () => ({
      ExtensionRegistry: {
        getInstance: () => ({
          getAssistants: () => [],
        }),
      },
    }));
  });

  it('prefers plugin-scoped agent settings over platform fallback', async () => {
    processConfigGet.mockImplementation(async (key: string) => {
      if (key === 'assistant.plugin.telegram_bot.agent') {
        return { backend: 'codex', name: 'Codex' };
      }
      if (key === 'assistant.telegram.agent') {
        return { backend: 'gemini', name: 'Gemini' };
      }
      return undefined;
    });

    const { loadStoredChannelAgent } = await import('../../../src/channels/utils/channelConversationConfig');

    await expect(loadStoredChannelAgent('telegram', 'telegram_bot')).resolves.toEqual({
      backend: 'codex',
      customAgentId: undefined,
      name: 'Codex',
    });
  });

  it('falls back to the platform workspace when the plugin workspace is blank', async () => {
    processConfigGet.mockImplementation(async (key: string) => {
      if (key === 'assistant.plugin.lark_bot.workspace') {
        return '   ';
      }
      if (key === 'assistant.lark.workspace') {
        return ' C:\\workspace\\shared ';
      }
      return undefined;
    });

    const { loadStoredChannelWorkspace } = await import('../../../src/channels/utils/channelConversationConfig');

    await expect(loadStoredChannelWorkspace('lark', 'lark_bot')).resolves.toBe('C:\\workspace\\shared');
  });

  it('creates conversations with plugin-scoped workspace and plugin id', async () => {
    processConfigGet.mockImplementation(async (key: string) => {
      if (key === 'assistant.plugin.telegram_bot.agent') {
        return { backend: 'gemini', name: 'Gemini' };
      }
      if (key === 'assistant.plugin.telegram_bot.workspace') {
        return 'C:\\workspace\\bot';
      }
      return undefined;
    });

    createGeminiConversation.mockResolvedValue({
      success: true,
      conversation: {
        id: 'conv-gemini-1',
        extra: {
          workspace: 'C:\\workspace\\bot',
        },
      },
    });

    const { createChannelConversation } = await import('../../../src/channels/utils/channelConversationConfig');

    const result = await createChannelConversation({
      platform: 'telegram',
      pluginId: 'telegram_bot',
      source: 'telegram',
      chatId: 'chat-1',
      name: 'tg-chat-1',
      model: { id: 'provider-1', useModel: 'gemini-2.0-flash' } as any,
    });

    expect(createGeminiConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: 'C:\\workspace\\bot',
        customWorkspace: true,
        pluginId: 'telegram_bot',
        channelChatId: 'chat-1',
      })
    );
    expect(result.success).toBe(true);
    expect(result.channelAgentType).toBe('gemini');
    expect(createConversation).not.toHaveBeenCalled();
  });
});
