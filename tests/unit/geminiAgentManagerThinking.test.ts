import { describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';

vi.mock('@/common', () => ({
  ipcBridge: {
    geminiConversation: {
      responseStream: { emit: vi.fn() },
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
  getProviderAuthType: vi.fn(() => 'api_key'),
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('@process/team/teamEventBus', () => ({
  teamEventBus: { emit: vi.fn() },
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  flushConversationMessages: vi.fn().mockResolvedValue(undefined),
  nextTickToLocalFinish: vi.fn(),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn().mockResolvedValue('en-US') },
  getSkillsDir: vi.fn(() => '/fake/skills'),
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(() => false),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn().mockResolvedValue({}),
  getDatabaseSync: vi.fn(() => ({})),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn(), touchActivity: vi.fn(), isProcessing: vi.fn(() => false) },
}));

vi.mock('@process/services/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: vi.fn(() => ({
      notifyPotentialCompletion: vi.fn(),
    })),
  },
}));

vi.mock('@process/team/mcp/guide/teamGuideSingleton', () => ({
  getTeamGuideStdioConfig: vi.fn(() => undefined),
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: vi.fn(() => ({ getExtensions: vi.fn(() => []) })) },
}));

vi.mock('../../src/process/task/AcpSkillManager', () => ({
  detectSkillLoadRequest: vi.fn(() => []),
  AcpSkillManager: {
    getInstance: vi.fn(() => ({
      discoverSkills: vi.fn().mockResolvedValue(undefined),
      getSkills: vi.fn().mockResolvedValue([]),
    })),
  },
  buildSkillContentText: vi.fn(() => ''),
}));

vi.mock('../../src/process/task/CronCommandDetector', () => ({
  hasCronCommands: vi.fn(() => false),
}));

vi.mock('../../src/process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(() => ''),
  processCronInMessage: vi.fn(),
}));

vi.mock('../../src/process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((content: string) =>
    content.replace(/<\s*think(?:ing)?\s*>/gi, '').replace(/<\s*\/\s*think(?:ing)?\s*>/gi, '')
  ),
}));

vi.mock('../../src/process/task/BaseAgentManager', () => ({
  default: vi.fn(function BaseAgentManager() {}),
}));

vi.mock('../../src/process/task/IpcAgentEventEmitter', () => ({
  IpcAgentEventEmitter: vi.fn(function IpcAgentEventEmitter() {}),
}));

vi.mock('@office-ai/aioncli-core', () => ({
  AuthType: { LOGIN_WITH_GOOGLE: 'LOGIN_WITH_GOOGLE', USE_VERTEX_AI: 'USE_VERTEX_AI' },
  getOauthInfoWithCache: vi.fn().mockResolvedValue(null),
  Storage: { getOAuthCredsPath: vi.fn(() => '/fake/oauth') },
}));

vi.mock('../../src/process/agent/gemini/GeminiApprovalStore', () => ({
  GeminiApprovalStore: class {
    approveAll = vi.fn();
  },
}));

vi.mock('../../src/process/agent/gemini/cli/tools/tools', () => ({
  ToolConfirmationOutcome: {},
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ''),
}));

import { GeminiAgentManager } from '../../src/process/task/GeminiAgentManager';

function filterMessage(message: IResponseMessage): IResponseMessage {
  const manager = Object.create(GeminiAgentManager.prototype) as {
    filterThinkTagsFromMessage: (value: IResponseMessage) => IResponseMessage;
  };

  return manager.filterThinkTagsFromMessage(message);
}

describe('GeminiAgentManager think-tag filtering', () => {
  it('removes complete think blocks from content messages before emitting to UI', () => {
    const filtered = filterMessage({
      type: 'content',
      conversation_id: 'conv-1',
      msg_id: 'msg-1',
      data: 'Visible<think>hidden reasoning</think>Answer',
    } as IResponseMessage);

    expect(filtered).toMatchObject({
      type: 'content',
      data: 'VisibleAnswer',
    });
  });

  it('preserves orphan closing tags in content messages so downstream accumulation can detect them', () => {
    const filtered = filterMessage({
      type: 'content',
      conversation_id: 'conv-1',
      msg_id: 'msg-1',
      data: 'Visible</think>Answer',
    } as IResponseMessage);

    expect(filtered.data).toBe('Visible</think>Answer');
  });

  it('strips think tags from thought messages', () => {
    const filtered = filterMessage({
      type: 'thought',
      conversation_id: 'conv-1',
      msg_id: 'msg-1',
      data: '<thinking>deep reasoning</thinking>',
    } as IResponseMessage);

    expect(filtered).toMatchObject({
      type: 'thought',
      data: 'deep reasoning',
    });
  });

  it('leaves unrelated message types unchanged', () => {
    const original = {
      type: 'finish',
      conversation_id: 'conv-1',
      msg_id: 'msg-1',
      data: '',
    } as IResponseMessage;

    expect(filterMessage(original)).toBe(original);
  });
});
