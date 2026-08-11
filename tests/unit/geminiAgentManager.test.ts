/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const flushConversationMessages = vi.fn(async () => {});
const getConversationMessages = vi.fn();
const notifyPotentialCompletion = vi.fn();
const hasCronCommands = vi.fn(() => false);
const extractTextFromMessage = vi.fn(() => 'done');
const cronBusyGuardSetProcessing = vi.fn();
const cronBusyGuardTouchActivity = vi.fn();
const buildDatabaseMock = () => ({
  getConversationMessages,
  updateConversation: vi.fn(),
});

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: {
    emitAgentMessage: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    geminiConversation: {
      responseStream: {
        emit: vi.fn(),
      },
    },
    conversation: {
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: vi.fn(() => null),
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => 'uuid-1'),
}));

vi.mock('@/common/utils/platformAuthType', () => ({
  getProviderAuthType: vi.fn(() => 'api-key'),
}));

vi.mock('@office-ai/aioncli-core', () => ({
  AuthType: {
    LOGIN_WITH_GOOGLE: 'login-with-google',
    USE_VERTEX_AI: 'use-vertex-ai',
  },
  getOauthInfoWithCache: vi.fn(),
  Storage: {
    getOAuthCredsPath: vi.fn(() => ''),
  },
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: vi.fn(() => ({
      getMcpServers: vi.fn(() => []),
    })),
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(),
    set: vi.fn(),
  },
  getSkillsDir: vi.fn(() => ''),
}));

vi.mock('../../src/process/task/agentUtils', () => ({
  buildSystemInstructionsWithSkillsIndex: vi.fn(async () => ''),
}));

vi.mock('../../src/process/task/AcpSkillManager', () => ({
  detectSkillLoadRequest: vi.fn(() => []),
  buildSkillContentText: vi.fn(() => ''),
  AcpSkillManager: {
    getInstance: vi.fn(() => ({
      discoverSkills: vi.fn(async () => {}),
      getSkills: vi.fn(async () => []),
      getBuiltinSkillsIndex: vi.fn(() => []),
    })),
  },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => Promise.resolve(buildDatabaseMock())),
  getDatabaseSync: vi.fn(() => buildDatabaseMock()),
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  flushConversationMessages,
  nextTickToLocalFinish: vi.fn(),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: {
    setProcessing: cronBusyGuardSetProcessing,
    touchActivity: cronBusyGuardTouchActivity,
  },
}));

vi.mock('@process/services/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: vi.fn(() => ({
      notifyPotentialCompletion,
    })),
  },
}));

vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(() => false),
}));

vi.mock('../../src/process/task/BaseAgentManager', () => ({
  default: class MockBaseAgentManager {
    type: string;
    data: unknown;

    constructor(type: string, data: unknown) {
      this.type = type;
      this.data = data;
    }

    protected init(): void {}

    protected addConfirmation(): void {}

    confirm(): void {}

    getConfirmations(): unknown[] {
      return [];
    }

    start(): Promise<void> {
      return Promise.resolve();
    }

    stop(): Promise<void> {
      return Promise.resolve();
    }

    sendMessage(): Promise<{ success: true }> {
      return Promise.resolve({ success: true });
    }

    kill(): void {}
  },
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('../../src/process/task/CronCommandDetector', () => ({
  hasCronCommands,
}));

vi.mock('../../src/process/task/MessageMiddleware', () => ({
  extractTextFromMessage,
  processCronInMessage: vi.fn(async () => {}),
}));

vi.mock('../../src/process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((content: string) => content),
  extractAndStripThinkTags: vi.fn((content: string) => ({ thinking: '', content })),
}));

vi.mock('@process/agent/gemini/GeminiApprovalStore', () => ({
  GeminiApprovalStore: class MockGeminiApprovalStore {
    readonly isMock = true;
  },
}));

vi.mock('@process/agent/gemini/cli/tools/tools', () => ({
  ToolConfirmationOutcome: {
    ProceedOnce: 'proceed_once',
    ProceedAlways: 'proceed_always',
    ProceedAlwaysTool: 'proceed_always_tool',
    ProceedAlwaysServer: 'proceed_always_server',
    Cancel: 'cancel',
  },
}));

describe('GeminiAgentManager turn completion', () => {
  beforeEach(() => {
    vi.useRealTimers();
    flushConversationMessages.mockClear();
    getConversationMessages.mockReset();
    notifyPotentialCompletion.mockClear();
    hasCronCommands.mockReset();
    hasCronCommands.mockReturnValue(false);
    extractTextFromMessage.mockReset();
    extractTextFromMessage.mockReturnValue('done');
    cronBusyGuardSetProcessing.mockReset();
    cronBusyGuardTouchActivity.mockReset();
    vi.resetModules();
  });

  it('runs the first completion check after the first retry delay', async () => {
    vi.useFakeTimers();
    const { GeminiAgentManager } = await import('../../src/process/task/GeminiAgentManager');
    const manager = Object.create(GeminiAgentManager.prototype) as {
      checkCronCommandsOnFinish: ReturnType<typeof vi.fn>;
      checkCronWithRetry: (attempt: number) => void;
    };

    manager.checkCronCommandsOnFinish = vi.fn(async () => true);
    manager.checkCronWithRetry(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(manager.checkCronCommandsOnFinish).toHaveBeenCalledTimes(1);
  });

  it('finds assistant output created after the finish timestamp', async () => {
    const { GeminiAgentManager } = await import('../../src/process/task/GeminiAgentManager');
    const manager = Object.create(GeminiAgentManager.prototype) as {
      conversation_id: string;
      enabledSkills: string[];
      lastProcessedFinishMessageKey: string | null;
      sendMessage: ReturnType<typeof vi.fn>;
      checkCronCommandsOnFinish: (afterTimestamp: number) => Promise<boolean>;
    };

    manager.conversation_id = 'session-1';
    manager.enabledSkills = [];
    manager.lastProcessedFinishMessageKey = null;
    manager.sendMessage = vi.fn();
    getConversationMessages.mockReturnValue({
      data: [
        {
          id: 'assistant-1',
          msg_id: 'assistant-1',
          type: 'text',
          position: 'left',
          content: { content: 'done' },
          createdAt: 1,
        },
      ],
    });

    const found = await manager.checkCronCommandsOnFinish(0);

    expect(found).toBe(true);
    expect(extractTextFromMessage).toHaveBeenCalledWith(expect.objectContaining({ msg_id: 'assistant-1' }));
  });

  it('marks the conversation busy while sending to the Gemini worker', async () => {
    const { GeminiAgentManager } = await import('../../src/process/task/GeminiAgentManager');
    const manager = Object.create(GeminiAgentManager.prototype) as {
      conversation_id: string;
      bootstrap: Promise<void>;
      refreshWorkerIfMcpChanged: () => Promise<void>;
      sendMessage: (data: { input: string; msg_id: string }) => Promise<unknown>;
    };

    manager.conversation_id = 'session-1';
    manager.bootstrap = Promise.resolve();
    manager.refreshWorkerIfMcpChanged = vi.fn(async () => {});

    await manager.sendMessage({
      input: 'hello',
      msg_id: 'user-1',
    });

    expect(cronBusyGuardSetProcessing).toHaveBeenCalledWith('session-1', true);
    expect(cronBusyGuardSetProcessing).toHaveBeenCalledWith('session-1', false);
  });

  it('marks the turn finished and schedules cron checks when the Gemini stream finishes', async () => {
    const { GeminiAgentManager } = await import('../../src/process/task/GeminiAgentManager');
    const handlers = new Map<string, (data: Record<string, unknown>) => void>();
    const manager = Object.create(GeminiAgentManager.prototype) as {
      conversation_id: string;
      status?: string;
      on: (event: string, handler: (data: Record<string, unknown>) => void) => void;
      filterThinkTagsFromMessage: (data: unknown) => unknown;
      persistCurrentTurnTokenUsage: () => void;
      checkCronWithRetry: (attempt: number) => void;
      handleConformationMessage: () => void;
      init: () => void;
    };

    manager.conversation_id = 'session-1';
    manager.on = vi.fn((event, handler) => {
      handlers.set(event, handler);
    });
    manager.filterThinkTagsFromMessage = vi.fn((data) => data);
    manager.persistCurrentTurnTokenUsage = vi.fn();
    manager.checkCronWithRetry = vi.fn();
    manager.handleConformationMessage = vi.fn();

    manager.init();

    const onGeminiMessage = handlers.get('gemini.message');
    expect(onGeminiMessage).toBeTypeOf('function');

    onGeminiMessage?.({
      type: 'content',
      data: 'chunk',
      msg_id: 'assistant-1',
    });

    onGeminiMessage?.({
      type: 'finish',
      data: '',
      msg_id: 'assistant-1',
    });

    expect(manager.status).toBe('finished');
    expect(manager.checkCronWithRetry).toHaveBeenCalledWith(0);
  });
});
