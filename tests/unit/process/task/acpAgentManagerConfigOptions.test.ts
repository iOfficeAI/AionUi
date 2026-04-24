/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '../../../../src/common/adapter/ipcBridge';
import type { AcpModelInfo, AcpResult, AcpSessionConfigOption } from '../../../../src/common/types/acpTypes';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const responseStreamEmit = vi.fn();
const channelEmitAgentMessage = vi.fn();
const teamEventBusEmit = vi.fn();
const acpAgentStart = vi.fn<() => Promise<void>>();
const acpAgentGetModelInfo = vi.fn<() => AcpModelInfo | null>();
const acpAgentGetConfigOptions = vi.fn<() => AcpSessionConfigOption[]>();
const acpAgentSetConfigOption = vi.fn<(configId: string, value: string) => Promise<AcpSessionConfigOption[]>>();
const dbGetConversation = vi.fn();
const dbUpdateConversation = vi.fn();

class MockAcpAgentV2 {
  private readonly config: { onStreamEvent?: (message: IResponseMessage) => void };

  constructor(config: { onStreamEvent?: (message: IResponseMessage) => void }) {
    this.config = config;
  }

  start(): Promise<void> {
    return acpAgentStart();
  }

  getModelInfo(): AcpModelInfo | null {
    return acpAgentGetModelInfo();
  }

  getConfigOptions(): AcpSessionConfigOption[] {
    return acpAgentGetConfigOptions();
  }

  setConfigOption(configId: string, value: string): Promise<AcpSessionConfigOption[]> {
    return acpAgentSetConfigOption(configId, value);
  }

  setMode(): Promise<{ success: true }> {
    return Promise.resolve({ success: true });
  }

  setModelByConfigOption(): Promise<AcpModelInfo | null> {
    return Promise.resolve(null);
  }

  sendMessage(): Promise<AcpResult> {
    return Promise.resolve({ success: true, data: null });
  }

  emitStream(message: IResponseMessage): void {
    this.config.onStreamEvent?.(message);
  }
}

vi.mock('@process/acp/compat', () => ({
  AcpAgentV2: MockAcpAgentV2,
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: {
    emitAgentMessage: channelEmitAgentMessage,
  },
}));

vi.mock('@process/team/teamEventBus', () => ({
  teamEventBus: {
    emit: teamEventBusEmit,
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
    getConversation: dbGetConversation,
    updateConversation: dbUpdateConversation,
  })),
  getDatabaseSync: vi.fn(() => ({
    recordConversationTokenUsage: vi.fn(() => ({ success: true })),
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
    setProcessing: vi.fn(),
    touchActivity: vi.fn(),
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
      notifyPotentialCompletion: vi.fn(),
    })),
  },
}));

vi.mock('@process/task/codexConfig', () => ({
  getCodexSandboxModeForSessionMode: vi.fn(() => 'workspace-write'),
  writeCodexSandboxMode: vi.fn(async () => {}),
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('../../../../src/process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn(async (content: string) => content),
}));

vi.mock('../../../../src/process/task/BaseAgentManager', () => ({
  default: class MockBaseAgentManager {
    protected yoloMode: boolean = false;
    status: string | undefined;
    type: string;
    data: unknown;

    constructor(type: string, data: unknown) {
      this.type = type;
      this.data = data;
    }

    protected addConfirmation(): void {}

    getConfirmations(): unknown[] {
      return [];
    }
  },
}));

vi.mock('../../../../src/process/task/IpcAgentEventEmitter', () => ({
  IpcAgentEventEmitter: class MockIpcAgentEventEmitter {},
}));

vi.mock('../../../../src/process/task/CronCommandDetector', () => ({
  hasCronCommands: vi.fn(() => false),
}));

vi.mock('../../../../src/process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(() => ''),
  processCronInMessage: vi.fn(async () => {}),
}));

vi.mock('../../../../src/process/task/ThinkTagDetector', () => ({
  extractAndStripThinkTags: vi.fn((content: string) => ({ thinking: '', content })),
}));

vi.mock('@process/team/prompts/teamGuideCapability.ts', () => ({
  shouldInjectTeamGuideMcp: vi.fn(async () => false),
}));

describe('AcpAgentManager codex UX state', () => {
  beforeEach(() => {
    responseStreamEmit.mockReset();
    channelEmitAgentMessage.mockReset();
    teamEventBusEmit.mockReset();
    acpAgentStart.mockReset();
    acpAgentStart.mockResolvedValue(undefined);
    acpAgentGetModelInfo.mockReset();
    acpAgentGetModelInfo.mockReturnValue(null);
    acpAgentGetConfigOptions.mockReset();
    acpAgentGetConfigOptions.mockReturnValue([]);
    acpAgentSetConfigOption.mockReset();
    acpAgentSetConfigOption.mockResolvedValue([]);
    dbGetConversation.mockReset();
    dbGetConversation.mockReturnValue({
      success: true,
      data: {
        id: 'session-1',
        type: 'acp',
        extra: {
          backend: 'codex',
          configOptionValues: {
            reasoning_effort: 'xhigh',
          },
          pendingConfigOptions: {
            reasoning_effort: 'xhigh',
          },
        },
      },
    });
    dbUpdateConversation.mockReset();
    vi.resetModules();
  });

  const createManager = async (overrides: Record<string, unknown> = {}) => {
    const { default: AcpAgentManager } = await import('../../../../src/process/task/AcpAgentManager');
    return new AcpAgentManager({
      conversation_id: 'session-1',
      backend: 'codex',
      workspace: '/workspace',
      ...overrides,
    });
  };

  it('falls back to codex reasoning config options when the ACP bridge has not cached options yet', async () => {
    const manager = await createManager();

    await manager.initAgent();

    expect(manager.getConfigOptions()).toEqual([
      expect.objectContaining({
        id: 'reasoning_effort',
        currentValue: 'medium',
      }),
    ]);
  });

  it('emits active status as soon as bootstrap connects', async () => {
    const manager = await createManager();

    await manager.initAgent();

    expect(responseStreamEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent_status',
        conversation_id: 'session-1',
        data: {
          status: 'session_active',
          backend: 'codex',
        },
      })
    );
  });

  it('persists selected config option values used by the next ACP startup', async () => {
    const updatedOptions: AcpSessionConfigOption[] = [
      {
        id: 'reasoning_effort',
        category: 'reasoning',
        type: 'select',
        currentValue: 'medium',
        selectedValue: 'medium',
        options: [
          { value: 'medium', name: 'Medium' },
          { value: 'xhigh', name: 'Xhigh' },
        ],
      },
    ];
    acpAgentGetConfigOptions.mockReturnValue(updatedOptions);
    acpAgentSetConfigOption.mockResolvedValue(updatedOptions);
    const manager = await createManager({
      configOptionValues: {
        reasoning_effort: 'xhigh',
      },
      pendingConfigOptions: {
        reasoning_effort: 'xhigh',
      },
    });

    await manager.initAgent();
    await manager.setConfigOption('reasoning_effort', 'medium');

    await vi.waitFor(() => {
      expect(dbUpdateConversation).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          extra: expect.objectContaining({
            cachedConfigOptions: updatedOptions,
            configOptionValues: {
              reasoning_effort: 'medium',
            },
            pendingConfigOptions: undefined,
          }),
        })
      );
    });
  });
});
