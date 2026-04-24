/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const responseStreamEmit = vi.fn();
const channelEmitAgentMessage = vi.fn();
const cronBusyGuardSetProcessing = vi.fn();
const cronBusyGuardTouchActivity = vi.fn();
const notifyPotentialCompletion = vi.fn();
const mainWarn = vi.fn();
const processCronInMessage = vi.fn(async () => {});
const hasCronCommands = vi.fn(() => false);
const recordConversationTokenUsage = vi.fn(() => ({ success: true }));
const acpAgentStart = vi.fn(async () => {});
const acpAgentSetMode = vi.fn(async () => ({ success: true }));
const acpAgentGetModelInfo = vi.fn(() => null);
const acpAgentSetModelByConfigOption = vi.fn(async () => null);
const acpAgentGetConfigOptions = vi.fn(() => []);
const acpAgentSetConfigOption = vi.fn(async () => []);
let capturedAcpAgentV2Config: Record<string, unknown> | null = null;

vi.mock('@process/agent/acp', () => ({
  AcpAgent: class MockAcpAgent {
    connection?: { onPromptUsage?: (usage: unknown) => void };

    start = acpAgentStart;
    setMode = acpAgentSetMode;
    getModelInfo = acpAgentGetModelInfo;
    setModelByConfigOption = acpAgentSetModelByConfigOption;
    getConfigOptions = acpAgentGetConfigOptions;
  },
}));

vi.mock('@process/acp/compat', () => ({
  AcpAgentV2: class MockAcpAgentV2 {
    constructor(config: Record<string, unknown>) {
      capturedAcpAgentV2Config = config;
    }

    start = acpAgentStart;
    setMode = acpAgentSetMode;
    getModelInfo = acpAgentGetModelInfo;
    setModelByConfigOption = acpAgentSetModelByConfigOption;
    getConfigOptions = acpAgentGetConfigOptions;
    setConfigOption = acpAgentSetConfigOption;
    sendMessage = vi.fn(async () => ({ success: true, data: null }));
  },
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: {
    emitAgentMessage: channelEmitAgentMessage,
  },
}));

vi.mock('@process/team/teamEventBus', () => ({
  teamEventBus: {
    emit: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      responseStream: {
        emit: responseStreamEmit,
      },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: vi.fn(() => null),
}));

vi.mock('@/common/utils', () => ({
  parseError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
  uuid: vi.fn(() => 'uuid-1'),
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: vi.fn(() => ({
      getAcpAdapters: vi.fn(() => []),
    })),
  },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({
    updateConversation: vi.fn(),
  })),
  getDatabaseSync: vi.fn(() => ({
    recordConversationTokenUsage,
  })),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn((cb: () => void) => cb()),
}));

vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(() => false),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: {
    setProcessing: cronBusyGuardSetProcessing,
    touchActivity: cronBusyGuardTouchActivity,
  },
}));

vi.mock('@process/services/cron/SkillSuggestWatcher', () => ({
  skillSuggestWatcher: {
    onFinish: vi.fn(),
  },
}));

vi.mock('@process/services/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: vi.fn(() => ({
      notifyPotentialCompletion,
    })),
  },
}));

vi.mock('../../../../src/process/task/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: vi.fn(() => ({
      notifyPotentialCompletion,
    })),
  },
}));

vi.mock('@process/task/codexConfig', () => ({
  getCodexSandboxModeForSessionMode: vi.fn(() => 'workspace-write'),
  writeCodexSandboxMode: vi.fn(async () => {}),
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn,
  mainError: vi.fn(),
}));

vi.mock('@process/utils/initAgent', () => ({
  hasNativeSkillSupport: vi.fn(() => false),
  resolveBuiltinCliPath: vi.fn(async (_backend: string | undefined, cliPath?: string) => cliPath),
}));

vi.mock('../../../../src/process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn(async (content: string) => content),
}));

vi.mock('../../../../src/process/task/BaseAgentManager', () => ({
  default: class MockBaseAgentManager {
    type: string;
    data: unknown;
    status: string | undefined;
    protected yoloMode: boolean = false;

    constructor(type: string, data: unknown) {
      this.type = type;
      this.data = data;
    }

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

    sendMessage(): Promise<{ success: true; data: null }> {
      return Promise.resolve({ success: true, data: null });
    }

    kill(): void {}
  },
}));

vi.mock('../../../../src/process/task/IpcAgentEventEmitter', () => ({
  IpcAgentEventEmitter: class MockIpcAgentEventEmitter {},
}));

vi.mock('../../../../src/process/task/CronCommandDetector', () => ({
  hasCronCommands,
}));

vi.mock('../../../../src/process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(() => ''),
  processCronInMessage,
}));

vi.mock('../../../../src/process/task/ThinkTagDetector', () => ({
  extractAndStripThinkTags: vi.fn((content: string) => ({ thinking: '', content })),
  stripThinkTags: vi.fn((content: string) => content),
}));

vi.mock('@process/team/prompts/teamGuideCapability.ts', () => ({
  shouldInjectTeamGuideMcp: vi.fn(async () => false),
}));

describe('AcpAgentManager turn completion fallback', () => {
  beforeEach(() => {
    responseStreamEmit.mockReset();
    channelEmitAgentMessage.mockReset();
    cronBusyGuardSetProcessing.mockReset();
    cronBusyGuardTouchActivity.mockReset();
    notifyPotentialCompletion.mockReset();
    mainWarn.mockReset();
    processCronInMessage.mockReset();
    processCronInMessage.mockImplementation(async () => {});
    hasCronCommands.mockReset();
    hasCronCommands.mockReturnValue(false);
    recordConversationTokenUsage.mockReset();
    recordConversationTokenUsage.mockReturnValue({ success: true });
    acpAgentStart.mockReset();
    acpAgentStart.mockResolvedValue(undefined);
    acpAgentSetMode.mockReset();
    acpAgentSetMode.mockResolvedValue({ success: true });
    acpAgentGetModelInfo.mockReset();
    acpAgentGetModelInfo.mockReturnValue(null);
    acpAgentSetModelByConfigOption.mockReset();
    acpAgentSetModelByConfigOption.mockResolvedValue(null);
    acpAgentGetConfigOptions.mockReset();
    acpAgentGetConfigOptions.mockReturnValue([]);
    acpAgentSetConfigOption.mockReset();
    acpAgentSetConfigOption.mockResolvedValue([]);
    capturedAcpAgentV2Config = null;
    vi.resetModules();
  });

  const createManager = async (overrides: Record<string, unknown> = {}) => {
    const { default: AcpAgentManager } = await import('../../../../src/process/task/AcpAgentManager');
    return new AcpAgentManager({
      conversation_id: 'session-1',
      backend: 'qwen',
      workspace: 'E:/workspace',
      configOptionValues: {},
      ...overrides,
    } as any) as any;
  };

  it('re-applies persisted mode for non-codex ACP backends after session start', async () => {
    const manager = await createManager({ backend: 'qwen', sessionMode: 'yolo' });

    await manager.initAgent();

    expect(acpAgentStart).toHaveBeenCalledTimes(1);
    expect(acpAgentSetMode).toHaveBeenCalledTimes(1);
    expect(acpAgentSetMode).toHaveBeenCalledWith('yolo');
  });

  it('does not call session/set_mode for codex when restoring session mode', async () => {
    const manager = await createManager({ backend: 'codex', sessionMode: 'yolo' });

    await manager.initAgent();

    expect(acpAgentStart).toHaveBeenCalledTimes(1);
    expect(acpAgentSetMode).not.toHaveBeenCalled();
  });

  it('forwards persisted and pending config options to ACP V2 startup', async () => {
    const manager = await createManager({
      backend: 'codex',
      configOptionValues: {
        reasoning_effort: 'medium',
      },
      pendingConfigOptions: {
        output_format: 'text',
      },
    });

    await manager.initAgent();

    expect(capturedAcpAgentV2Config?.extra).toEqual(
      expect.objectContaining({
        configOptionValues: {
          reasoning_effort: 'medium',
        },
        pendingConfigOptions: {
          output_format: 'text',
        },
      })
    );
  });

  it('emits acp_model_info after warmup completes so selectors can refresh without remounting', async () => {
    acpAgentGetModelInfo.mockReturnValue({
      currentModelId: 'gpt-5',
      currentModelLabel: 'GPT-5',
      canSwitch: true,
      availableModels: [{ id: 'gpt-5', label: 'GPT-5' }],
      source: 'models',
      sourceDetail: 'codex',
    });
    acpAgentGetConfigOptions.mockReturnValue([
      {
        id: 'reasoning_effort',
        category: 'reasoning',
        type: 'select',
        currentValue: 'medium',
        options: [
          { value: 'low', name: 'Low' },
          { value: 'medium', name: 'Medium' },
        ],
      },
    ]);

    const manager = await createManager({ backend: 'codex' });

    await manager.initAgent();

    expect(responseStreamEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp_model_info',
        conversation_id: 'session-1',
        data: expect.objectContaining({
          currentModelId: 'gpt-5',
        }),
      })
    );
  });

  it('keeps ACP runtime active when prompt dispatch resolves before finish arrives', async () => {
    const manager = await createManager();
    manager.persistCurrentTurnTokenUsage = vi.fn();
    manager.agent = {
      sendMessage: vi.fn(async () => {
        manager.activeTrackedTurnHasRuntimeActivity = true;
        return { success: true, data: null };
      }),
    };
    manager.initAgent = vi.fn(async () => manager.agent);

    await manager.sendMessage({ content: 'hello' });

    expect(manager.agent.sendMessage).toHaveBeenCalledWith({ content: 'hello' });
    expect(cronBusyGuardSetProcessing).toHaveBeenCalledTimes(1);
    expect(cronBusyGuardSetProcessing).toHaveBeenCalledWith('session-1', true);
    expect(mainWarn).not.toHaveBeenCalled();
    expect(responseStreamEmit).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'finish',
      })
    );
    expect(channelEmitAgentMessage).not.toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        type: 'finish',
      })
    );
    expect(notifyPotentialCompletion).not.toHaveBeenCalled();
    expect(manager.persistCurrentTurnTokenUsage).not.toHaveBeenCalled();
    expect(manager.status).toBe('running');
    expect(manager.missingFinishFallbackTimer).not.toBeNull();
  });

  it('keeps ACP runtime marked running while tool calls are still in progress', async () => {
    const manager = await createManager({ backend: 'codex' });
    manager.status = 'running';

    manager.handleStreamEvent(
      {
        type: 'acp_tool_call',
        conversation_id: 'session-1',
        msg_id: 'tool-1',
        data: {
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 'tool-1',
            title: 'Run npm test',
            status: 'in_progress',
            kind: 'execute',
          },
        },
      },
      'codex'
    );

    expect(manager.status).toBe('running');
  });

  it('does not synthesize a second finish when the backend already emitted one', async () => {
    const manager = await createManager();
    manager.persistCurrentTurnTokenUsage = vi.fn();
    const realFinishSignal = {
      type: 'finish',
      conversation_id: 'session-1',
      msg_id: 'finish-1',
      data: null,
    };

    manager.agent = {
      sendMessage: vi.fn(async () => {
        const shouldNotifyTurnCompleted = await manager.handleFinishSignal(realFinishSignal, 'qwen');
        if (shouldNotifyTurnCompleted) {
          notifyPotentialCompletion('session-1');
        }
        return { success: true, data: null };
      }),
    };
    manager.initAgent = vi.fn(async () => manager.agent);

    await manager.sendMessage({ content: 'hello' });

    expect(mainWarn).not.toHaveBeenCalled();
    expect(responseStreamEmit).toHaveBeenCalledTimes(1);
    expect(responseStreamEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        ...realFinishSignal,
      })
    );
    expect(channelEmitAgentMessage).toHaveBeenCalledTimes(1);
    expect(channelEmitAgentMessage).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({
        ...realFinishSignal,
      })
    );
    expect(notifyPotentialCompletion).toHaveBeenCalledTimes(1);
    expect(cronBusyGuardSetProcessing).toHaveBeenNthCalledWith(1, 'session-1', true);
    expect(cronBusyGuardSetProcessing).toHaveBeenNthCalledWith(2, 'session-1', false);
  });

  it('keeps cron continuation working when the follow-up turn misses finish', async () => {
    const manager = await createManager();
    hasCronCommands.mockImplementation((content: string) => content.includes('/cron'));
    processCronInMessage.mockImplementation(async (_conversationId, _backend, _message, emitSystemMessage) => {
      emitSystemMessage('cron created');
    });
    const realFinishSignal = {
      type: 'finish',
      conversation_id: 'session-1',
      msg_id: 'finish-1',
      data: null,
    };

    let callCount = 0;
    manager.agent = {
      sendMessage: vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          manager.currentMsgId = 'assistant-1';
          manager.currentMsgContent = 'please run /cron every day';
          const shouldNotifyTurnCompleted = await manager.handleFinishSignal(realFinishSignal, 'qwen');
          if (shouldNotifyTurnCompleted) {
            notifyPotentialCompletion('session-1');
          }
        } else {
          manager.currentMsgId = null;
          manager.currentMsgContent = '';
        }
        return { success: true, data: null };
      }),
    };
    manager.initAgent = vi.fn(async () => manager.agent);

    await manager.sendMessage({ content: 'hello' });

    expect(manager.agent.sendMessage).toHaveBeenCalledTimes(2);
    expect(processCronInMessage).toHaveBeenCalledTimes(1);
    expect(notifyPotentialCompletion).toHaveBeenCalledTimes(1);
    expect(mainWarn).not.toHaveBeenCalled();
    expect(responseStreamEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'system',
        data: 'cron created',
      })
    );
    const finishSignals = responseStreamEmit.mock.calls.filter(
      ([message]) => (message as { type?: string }).type === 'finish'
    );
    expect(finishSignals).toHaveLength(1);
  });

  it('synthesizes finish after prompt resolves without a terminal signal', async () => {
    vi.useFakeTimers();
    try {
      const manager = await createManager();
      manager.persistCurrentTurnTokenUsage = vi.fn();
      const turnId = manager.beginTrackedTurn();
      manager.activeTrackedTurnHasRuntimeActivity = true;
      manager.promptInFlight = false;
      manager.currentMsgId = 'assistant-1';
      manager.currentMsgContent = '你好！有什么我可以帮助你的吗？';

      manager.scheduleMissingFinishFallback();
      await vi.advanceTimersByTimeAsync(15000);

      expect(mainWarn).toHaveBeenCalledWith(
        '[AcpAgentManager]',
        expect.stringContaining('ACP turn became idle without finish signal')
      );
      expect(responseStreamEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'finish',
          conversation_id: 'session-1',
        })
      );
      expect(channelEmitAgentMessage).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          type: 'finish',
          conversation_id: 'session-1',
        })
      );
      expect(notifyPotentialCompletion).toHaveBeenCalledWith('session-1', expect.any(Object));
      expect(cronBusyGuardSetProcessing).toHaveBeenCalledWith('session-1', false);
      expect(manager.status).toBe('finished');
    } finally {
      vi.useRealTimers();
    }
  });
});
