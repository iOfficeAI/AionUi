import { describe, expect, it, vi } from 'vitest';

vi.mock('@process/agent/codex', () => ({ CodexAgent: class {} }));
vi.mock('@process/agent/codex/handlers/CodexEventHandler', () => ({ CodexEventHandler: class {} }));
vi.mock('@process/agent/codex/handlers/CodexFileOperationHandler', () => ({ CodexFileOperationHandler: class {} }));
vi.mock('@process/agent/codex/handlers/CodexSessionManager', () => ({ CodexSessionManager: class {} }));
vi.mock('@process/channels/agent/ChannelEventBus', () => ({ channelEventBus: { emitAgentMessage: vi.fn() } }));
vi.mock('@/common', () => ({ ipcBridge: { codexConversation: { responseStream: { emit: vi.fn() } } } }));
vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: vi.fn(() => null),
  isCodexAutoApproveMode: vi.fn(() => false),
}));
vi.mock('@/common/types/codex/codexModes', () => ({ isCodexAutoApproveMode: vi.fn(() => false) }));
vi.mock('@/common/types/codex/codexModels', () => ({
  DEFAULT_CODEX_MODELS: [],
  DEFAULT_CODEX_MODEL_ID: 'default',
}));
vi.mock('@/common/types/codex/types/permissionTypes', () => ({ PERMISSION_DECISION_MAP: {} }));
vi.mock('@/common/types/codex/utils', () => ({ mapPermissionDecision: vi.fn() }));
vi.mock('@/common/config/constants', () => ({ AIONUI_FILES_MARKER: '__FILES__' }));
vi.mock('@/common/utils', () => ({ uuid: vi.fn(() => 'uuid-1') }));
vi.mock('@process/utils/message', () => ({ addMessage: vi.fn(), addOrUpdateMessage: vi.fn() }));
vi.mock('@process/services/cron/CronBusyGuard', () => ({ cronBusyGuard: { setProcessing: vi.fn() } }));
vi.mock('@process/services/database', () => ({ getDatabase: vi.fn() }));
vi.mock('@process/utils/initStorage', () => ({ ProcessConfig: { get: vi.fn().mockResolvedValue({}) } }));
vi.mock('@process/task/BaseAgentManager', () => ({
  default: class BaseAgentManager {
    conversation_id = '';
    workspace = '';
    status = 'pending';
    constructor() {}
  },
}));
vi.mock('@process/task/IpcAgentEventEmitter', () => ({ IpcAgentEventEmitter: class {} }));
vi.mock('@process/task/agentUtils', () => ({ prepareFirstMessageWithSkillsIndex: vi.fn(async (value: string) => value) }));
vi.mock('@process/utils/previewUtils', () => ({ handlePreviewOpenEvent: vi.fn(() => false) }));
vi.mock('@process/agent/codex/connection/codexConfig', () => ({
  getCodexSandboxModeForSessionMode: vi.fn(() => 'workspace-write'),
  writeCodexSandboxMode: vi.fn(),
}));
vi.mock('@process/services/i18n', () => ({ default: { t: vi.fn((key: string) => key) } }));
vi.mock('@/common/utils/appConfig', () => ({
  getConfiguredAppClientName: vi.fn(() => 'AionUI'),
  getConfiguredAppClientVersion: vi.fn(() => '1.0.0'),
  getConfiguredCodexMcpProtocolVersion: vi.fn(() => '1'),
  setAppConfig: vi.fn(),
}));

import CodexAgentManager from '../../src/process/task/CodexAgentManager';

describe('CodexAgentManager runtime status', () => {
  it('keeps runtime status running after streamed content', () => {
    const manager = Object.create(CodexAgentManager.prototype) as CodexAgentManager & {
      status: string;
      conversation_id: string;
    };
    manager.status = 'running';
    manager.conversation_id = 'conv-1';

    manager.emitAndPersistMessage(
      {
        type: 'content',
        conversation_id: 'conv-1',
        msg_id: 'msg-1',
        data: 'partial',
      },
      false
    );

    expect(manager.status).toBe('running');
  });

  it('marks runtime status finished on finish messages', () => {
    const manager = Object.create(CodexAgentManager.prototype) as CodexAgentManager & {
      status: string;
      conversation_id: string;
    };
    manager.status = 'running';
    manager.conversation_id = 'conv-1';

    manager.emitAndPersistMessage(
      {
        type: 'finish',
        conversation_id: 'conv-1',
        msg_id: 'msg-2',
        data: null,
      },
      false
    );

    expect(manager.status).toBe('finished');
  });

  it('marks runtime status finished on error messages', () => {
    const manager = Object.create(CodexAgentManager.prototype) as CodexAgentManager & {
      status: string;
      conversation_id: string;
    };
    manager.status = 'running';
    manager.conversation_id = 'conv-1';

    manager.emitAndPersistMessage(
      {
        type: 'error',
        conversation_id: 'conv-1',
        msg_id: 'msg-3',
        data: 'boom',
      },
      false
    );

    expect(manager.status).toBe('finished');
  });
});
