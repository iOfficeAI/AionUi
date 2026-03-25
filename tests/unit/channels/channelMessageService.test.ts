import { beforeEach, describe, expect, it, vi } from 'vitest';

let agentMessageListener: ((event: unknown) => void) | null = null;

vi.mock('@process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {
    getTask: vi.fn(() => undefined),
    getOrBuildTask: vi.fn(async () => {
      throw new Error('workerTaskManager should not be used in this test');
    }),
  },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => {
    throw new Error('getDatabase should not be used in this test');
  }),
}));

vi.mock('@process/bridge/services/AssistantHookRuntime', () => ({
  AssistantHookRuntime: vi.fn().mockImplementation(() => ({
    applyBeforeUserPrompt: vi.fn(async (_conversation: unknown, content: string) => ({
      content,
      appliedHooks: [],
    })),
  })),
}));

vi.mock('@process/services/i18n', () => ({
  default: {
    t: vi.fn((key: string) => key),
  },
  i18nReady: Promise.resolve(),
}));

vi.mock('@process/services/cron/cronServiceSingleton', () => ({
  cronService: {
    addJob: vi.fn(),
    listJobsByConversation: vi.fn(async () => []),
    removeJob: vi.fn(),
  },
}));

vi.mock('../../../src/process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {
    getTask: vi.fn(() => undefined),
    getOrBuildTask: vi.fn(async () => {
      throw new Error('workerTaskManager should not be used in this test');
    }),
  },
}));

vi.mock('../../../src/process/services/database', () => ({
  getDatabase: vi.fn(async () => {
    throw new Error('getDatabase should not be used in this test');
  }),
}));

vi.mock('../../../src/process/bridge/services/AssistantHookRuntime', () => ({
  AssistantHookRuntime: vi.fn().mockImplementation(() => ({
    applyBeforeUserPrompt: vi.fn(async (_conversation: unknown, content: string) => ({
      content,
      appliedHooks: [],
    })),
  })),
}));

vi.mock('../../../src/process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: {
    onAgentMessage: vi.fn((listener: (event: unknown) => void) => {
      agentMessageListener = listener;
      return () => {
        agentMessageListener = null;
      };
    }),
  },
}));

import { ChannelMessageService } from '../../../src/process/channels/agent/ChannelMessageService';

describe('ChannelMessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentMessageListener = null;
  });

  it('applies hooks and keeps raw content for ACP channel messages', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const service = new ChannelMessageService({
      taskManager: {
        getTask: vi.fn(() => undefined),
        getOrBuildTask: vi.fn(async () => ({
          type: 'acp',
          sendMessage,
        })),
      },
      getDatabase: async () =>
        ({
          getConversation: vi.fn(() => ({
            success: true,
            data: {
              id: 'conv-1',
              type: 'acp',
              source: 'telegram',
              extra: { backend: 'claude', enabledHooks: ['prompt-guard'] },
            },
          })),
        }) as unknown as Awaited<ReturnType<typeof import('../../../src/process/services/database').getDatabase>>,
      hookRuntime: {
        applyBeforeUserPrompt: vi.fn(async () => ({
          content: 'hooked content',
          appliedHooks: ['prompt-guard'],
        })),
      },
    });

    const promise = service.sendMessage('session-1', 'conv-1', 'raw content', vi.fn());
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'raw content',
          agentContent: 'hooked content',
        })
      );
    });

    agentMessageListener?.({ type: 'finish', conversation_id: 'conv-1', data: null });
    await expect(promise).resolves.toMatch(/^channel_msg_/);
  });

  it('applies hooks and keeps raw content for Gemini channel messages', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const service = new ChannelMessageService({
      taskManager: {
        getTask: vi.fn(() => undefined),
        getOrBuildTask: vi.fn(async () => ({
          type: 'gemini',
          sendMessage,
        })),
      },
      getDatabase: async () =>
        ({
          getConversation: vi.fn(() => ({
            success: true,
            data: {
              id: 'conv-2',
              type: 'gemini',
              source: 'lark',
              extra: { workspace: '/ws', enabledHooks: ['prompt-guard'] },
            },
          })),
        }) as unknown as Awaited<ReturnType<typeof import('../../../src/process/services/database').getDatabase>>,
      hookRuntime: {
        applyBeforeUserPrompt: vi.fn(async () => ({
          content: 'hooked input',
          appliedHooks: ['prompt-guard'],
        })),
      },
    });

    const promise = service.sendMessage('session-1', 'conv-2', 'raw input', vi.fn());
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          input: 'raw input',
          agentInput: 'hooked input',
        })
      );
    });

    agentMessageListener?.({ type: 'finish', conversation_id: 'conv-2', data: null });
    await expect(promise).resolves.toMatch(/^channel_msg_/);
  });
});
