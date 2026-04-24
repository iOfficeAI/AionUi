import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcBridge = vi.hoisted(() => ({
  geminiConversation: {
    responseStream: { emit: vi.fn() },
  },
}));
const mockTeamEventBus = vi.hoisted(() => ({ emit: vi.fn() }));

vi.mock('@/common', () => ({ ipcBridge: mockIpcBridge }));
vi.mock('@/common/utils', () => ({ uuid: vi.fn(() => 'uuid-1') }));
vi.mock('@/common/chat/chatLib', () => ({ transformMessage: vi.fn(() => null) }));
vi.mock('@/common/utils/platformAuthType', () => ({ getProviderAuthType: vi.fn(() => 'api_key') }));
vi.mock('@process/channels/agent/ChannelEventBus', () => ({ channelEventBus: { emitAgentMessage: vi.fn() } }));
vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: vi.fn(() => ({ getExtensions: vi.fn(() => []) })) },
}));
vi.mock('@process/services/cron/CronBusyGuard', () => ({ cronBusyGuard: { setProcessing: vi.fn() } }));
vi.mock('@process/services/cron/SkillSuggestWatcher', () => ({ skillSuggestWatcher: { onFinish: vi.fn() } }));
vi.mock('@process/services/database', () => ({ getDatabase: vi.fn().mockResolvedValue({}) }));
vi.mock('@process/team/mcp/guide/teamGuideSingleton', () => ({ getTeamGuideStdioConfig: vi.fn() }));
vi.mock('@process/team/teamEventBus', () => ({ teamEventBus: mockTeamEventBus }));
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
  getSkillsDir: vi.fn(() => '/fake/skills'),
}));
vi.mock('@process/utils/mainLogger', () => ({ mainLog: vi.fn(), mainWarn: vi.fn(), mainError: vi.fn() }));
vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn(),
}));
vi.mock('@process/utils/previewUtils', () => ({ handlePreviewOpenEvent: vi.fn(() => false) }));
vi.mock('../../src/process/task/AcpSkillManager', () => ({
  detectSkillLoadRequest: vi.fn(() => false),
  AcpSkillManager: {
    getInstance: vi.fn(() => ({
      discoverSkills: vi.fn().mockResolvedValue(undefined),
      getBuiltinSkillsIndex: vi.fn(() => []),
    })),
  },
  buildSkillContentText: vi.fn(() => ''),
}));
vi.mock('../../src/process/task/CronCommandDetector', () => ({ hasCronCommands: vi.fn(() => false) }));
vi.mock('../../src/process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(() => ''),
  processCronInMessage: vi.fn(),
}));
vi.mock('../../src/process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((value: string) => value),
  extractAndStripThinkTags: vi.fn((value: string) => ({ thinking: '', content: value })),
}));
vi.mock('../../src/process/task/agentUtils', () => ({ buildSystemInstructionsWithSkillsIndex: vi.fn(() => '') }));
vi.mock('../../src/process/agent/gemini/GeminiApprovalStore', () => ({
  GeminiApprovalStore: class {
    allApproved() {
      return false;
    }
    approveAll() {}
  },
}));
vi.mock('../../src/process/agent/gemini/cli/tools/tools', () => ({ ToolConfirmationOutcome: {} }));
vi.mock('@office-ai/aioncli-core', () => ({
  AuthType: { LOGIN_WITH_GOOGLE: 'LOGIN_WITH_GOOGLE', USE_VERTEX_AI: 'USE_VERTEX_AI' },
  getOauthInfoWithCache: vi.fn().mockResolvedValue(null),
  Storage: { getOAuthCredsPath: vi.fn(() => '/fake/oauth') },
}));
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false) }));
vi.mock('../../src/process/task/IpcAgentEventEmitter', () => ({ IpcAgentEventEmitter: vi.fn() }));
vi.mock('../../src/process/task/BaseAgentManager', () => ({
  default: class BaseAgentManager {
    conversation_id = 'conv-test';
    status = 'pending';
    type = 'gemini';
    yoloMode = false;
    confirmations: unknown[] = [];
    private listeners = new Map<string, Array<(data: unknown) => void>>();

    constructor(_type: string, _data: unknown, _emitter: unknown) {
      if (typeof (this as { init?: () => void }).init === 'function') {
        (this as { init: () => void }).init();
      }
    }

    init() {}

    on(name: string, handler: (data: unknown) => void) {
      const list = this.listeners.get(name) ?? [];
      list.push(handler);
      this.listeners.set(name, list);
      return () => {};
    }

    emit(name: string, data: unknown) {
      for (const handler of this.listeners.get(name) ?? []) {
        handler(data);
      }
    }

    stop = vi.fn().mockResolvedValue(undefined);
    kill = vi.fn();
    getConfirmations() {
      return this.confirmations;
    }
    addConfirmation(c: unknown) {
      this.confirmations.push(c);
    }
    confirm = vi.fn();
    postMessagePromise = vi.fn().mockResolvedValue(undefined);
  },
}));

import { GeminiAgentManager } from '../../src/process/task/GeminiAgentManager';

const MODEL = {
  name: 'gemini',
  useModel: 'gemini-2.0-flash',
  platform: 'google',
  baseUrl: '',
} as Parameters<typeof GeminiAgentManager.prototype.constructor>[1];

function createManager(): GeminiAgentManager {
  vi.spyOn(GeminiAgentManager.prototype as unknown as Record<string, unknown>, 'createBootstrap').mockResolvedValue(
    undefined
  );

  return new GeminiAgentManager(
    {
      workspace: '/ws',
      conversation_id: 'conv-test',
    },
    MODEL
  );
}

describe('GeminiAgentManager crash forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards unexpected worker exits as finish events with agentCrash', () => {
    const manager = createManager() as unknown as { emit: (name: string, data: unknown) => void };

    manager.emit('exit', { code: 1, signal: null });

    expect(mockIpcBridge.geminiConversation.responseStream.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-test',
        type: 'finish',
        data: expect.objectContaining({ agentCrash: true, error: expect.stringContaining('code: 1') }),
      })
    );
    expect(mockTeamEventBus.emit).toHaveBeenCalledWith(
      'responseStream',
      expect.objectContaining({
        conversation_id: 'conv-test',
        type: 'finish',
        data: expect.objectContaining({ agentCrash: true }),
      })
    );
  });
});
