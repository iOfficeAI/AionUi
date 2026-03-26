import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

// Capture provider handlers so tests can invoke them directly
const handlers: Record<string, (...args: unknown[]) => unknown> = {};
function makeChannel(name: string) {
  return {
    provider: vi.fn((fn: (...args: unknown[]) => unknown) => {
      handlers[name] = fn;
    }),
    emit: vi.fn(),
    invoke: vi.fn(),
  };
}

const applyBeforeUserPromptMock = vi.fn(async (_conversation: unknown, input: string) => ({
  content: input,
  appliedHooks: [],
}));
const prepareFirstMessageMock = vi.fn(async (msg: string) => msg);

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: makeChannel('create'),
      createWithConversation: makeChannel('createWithConversation'),
      get: makeChannel('get'),
      getAssociateConversation: makeChannel('getAssociateConversation'),
      remove: makeChannel('remove'),
      update: makeChannel('update'),
      reset: makeChannel('reset'),
      warmup: makeChannel('warmup'),
      stop: makeChannel('stop'),
      sendMessage: makeChannel('sendMessage'),
      getSlashCommands: makeChannel('getSlashCommands'),
      reloadContext: makeChannel('reloadContext'),
      getWorkspace: makeChannel('getWorkspace'),
      responseSearchWorkSpace: makeChannel('responseSearchWorkSpace'),
      confirmation: {
        confirm: makeChannel('confirmation.confirm'),
        list: makeChannel('confirmation.list'),
      },
      approval: {
        check: makeChannel('approval.check'),
      },
      listChanged: { emit: vi.fn() },
    },
    openclawConversation: {
      getRuntime: makeChannel('openclawConversation.getRuntime'),
    },
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessChat: { get: vi.fn(async () => []) },
  ProcessConfig: { get: vi.fn(async () => undefined), set: vi.fn(async () => undefined) },
  getSkillsDir: vi.fn(() => '/skills'),
  getBuiltinSkillsCopyDir: vi.fn(() => '/builtin-skills'),
  getSystemDir: vi.fn(() => ({ cacheDir: '/cache' })),
}));

vi.mock('@process/bridge/migrationUtils', () => ({
  migrateConversationToDatabase: vi.fn(async () => {}),
}));

vi.mock('@process/agent/gemini', () => ({
  GeminiAgent: { buildFileServer: vi.fn(() => ({})) },
  GeminiApprovalStore: { createKeysFromConfirmation: vi.fn(() => []) },
}));

vi.mock('@process/utils', () => ({
  copyFilesToDirectory: vi.fn(async () => []),
  readDirectoryRecursive: vi.fn(async () => null),
}));

vi.mock('@process/utils/openclawUtils', () => ({
  computeOpenClawIdentityHash: vi.fn(async () => 'hash'),
}));

vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessage: (...args: unknown[]) => prepareFirstMessageMock(...args),
}));

vi.mock('@process/bridge/services/AssistantHookRuntime', () => ({
  AssistantHookRuntime: vi.fn(function AssistantHookRuntime() {
    return {
      applyBeforeUserPrompt: (...args: unknown[]) => applyBeforeUserPromptMock(...args),
    };
  }),
}));

vi.mock('@process/utils/tray', () => ({
  refreshTrayMenu: vi.fn(async () => undefined),
}));

import { initConversationBridge } from '../../src/process/bridge/conversationBridge';
import type { IConversationService } from '../../src/process/services/IConversationService';
import type { IWorkerTaskManager } from '../../src/process/task/IWorkerTaskManager';
import type { TChatConversation } from '../../src/common/config/storage';

function makeService(overrides?: Partial<IConversationService>): IConversationService {
  return {
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    updateConversation: vi.fn(),
    getConversation: vi.fn(async () => undefined),
    createWithMigration: vi.fn(),
    listAllConversations: vi.fn(async () => []),
    ...overrides,
  };
}

function makeTaskManager(overrides?: Partial<IWorkerTaskManager>): IWorkerTaskManager {
  return {
    getTask: vi.fn(() => undefined),
    getOrBuildTask: vi.fn(async () => {
      throw new Error('not found');
    }),
    addTask: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    listTasks: vi.fn(() => []),
    ...overrides,
  };
}

function makeConversation(id: string, workspace = '/ws'): TChatConversation {
  return { id, type: 'gemini', name: 'test', extra: { workspace } } as unknown as TChatConversation;
}

describe('conversationBridge', () => {
  let service: IConversationService;
  let taskManager: IWorkerTaskManager;

  beforeEach(() => {
    vi.clearAllMocks();
    applyBeforeUserPromptMock.mockResolvedValue({
      content: 'hooked prompt',
      appliedHooks: ['guard'],
    });
    prepareFirstMessageMock.mockImplementation(async (msg: string) => msg);
    // Re-register providers by re-initializing the bridge
    service = makeService();
    taskManager = makeTaskManager();
    initConversationBridge(service, taskManager);
  });

  describe('getAssociateConversation — listAllConversations path', () => {
    it('returns data from injected service without calling getDatabase()', async () => {
      const current = makeConversation('c1', '/ws/project');
      const sibling = makeConversation('c2', '/ws/project');
      const other = makeConversation('c3', '/other');

      vi.mocked(service.getConversation).mockResolvedValue(current);
      vi.mocked(service.listAllConversations).mockResolvedValue([current, sibling, other]);

      const handler = handlers['getAssociateConversation'];
      const result = await handler({ conversation_id: 'c1' });

      expect(service.listAllConversations).toHaveBeenCalled();
      // Only conversations with matching workspace should be returned
      expect(result).toHaveLength(2);
      expect(result.map((c: TChatConversation) => c.id)).toEqual(expect.arrayContaining(['c1', 'c2']));
    });

    it('returns empty array when repo returns empty list', async () => {
      const current = makeConversation('c1', '/ws/project');
      vi.mocked(service.getConversation).mockResolvedValue(current);
      vi.mocked(service.listAllConversations).mockResolvedValue([]);

      const handler = handlers['getAssociateConversation'];
      const result = await handler({ conversation_id: 'c1' });

      expect(result).toEqual([]);
    });

    it('returns empty array when current conversation has no workspace', async () => {
      const noWorkspace = { id: 'c1', type: 'gemini', name: 'test', extra: {} } as unknown as TChatConversation;
      vi.mocked(service.getConversation).mockResolvedValue(noWorkspace);

      const handler = handlers['getAssociateConversation'];
      const result = await handler({ conversation_id: 'c1' });

      expect(result).toEqual([]);
      // Should not call listAllConversations when conversation has no workspace
      expect(service.listAllConversations).not.toHaveBeenCalled();
    });

    it('returns empty array when current conversation is not found', async () => {
      vi.mocked(service.getConversation).mockResolvedValue(undefined);

      const handler = handlers['getAssociateConversation'];
      const result = await handler({ conversation_id: 'missing' });

      expect(result).toEqual([]);
    });
  });

  describe('createWithConversation — getOrBuildTask rejection', () => {
    it('does not produce unhandled rejection when getOrBuildTask fails', async () => {
      const conversation = makeConversation('new-id');
      vi.mocked(service.createWithMigration).mockResolvedValue(conversation);

      // getOrBuildTask rejects (conversation not yet persisted — race condition)
      const rejectingTaskManager = makeTaskManager({
        getOrBuildTask: vi.fn().mockRejectedValue(new Error('Conversation not found: new-id')),
      });
      initConversationBridge(service, rejectingTaskManager);

      // Should complete without throwing / unhandled rejection
      const result = await handlers['createWithConversation']({
        conversation,
        sourceConversationId: undefined,
        migrateCron: false,
      });

      expect(result).toEqual(conversation);
      expect(rejectingTaskManager.getOrBuildTask).toHaveBeenCalledWith('new-id');
    });
  });

  describe('sendMessage — hook runtime integration', () => {
    it('keeps raw user content but passes transformed prompt to gemini worker payload', async () => {
      const conversation = makeConversation('c1', '/ws/project');
      const sendMessage = vi.fn(async () => undefined);
      const geminiTask = {
        type: 'gemini',
        workspace: '/ws/project',
        sendMessage,
      } as unknown as import('../../src/process/task/IAgentManager').IAgentManager;

      vi.mocked(service.getConversation).mockResolvedValue(conversation);
      vi.mocked(taskManager.getOrBuildTask).mockResolvedValue(geminiTask);

      const handler = handlers['sendMessage'];
      const result = await handler({ conversation_id: 'c1', input: 'raw prompt', files: [] });

      expect(result).toEqual({ success: true });
      expect(applyBeforeUserPromptMock).toHaveBeenCalledWith(conversation, 'raw prompt');
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          input: 'raw prompt',
          content: 'raw prompt',
          agentInput: 'hooked prompt',
          agentContent: 'hooked prompt',
        })
      );
    });

    it('applies skills injection on top of hook-transformed prompt', async () => {
      const conversation = makeConversation('c2', '/ws/project');
      const sendMessage = vi.fn(async () => undefined);
      const acpTask = {
        type: 'acp',
        workspace: '/ws/project',
        sendMessage,
      } as unknown as import('../../src/process/task/IAgentManager').IAgentManager;

      vi.mocked(service.getConversation).mockResolvedValue(conversation);
      vi.mocked(taskManager.getOrBuildTask).mockResolvedValue(acpTask);
      prepareFirstMessageMock.mockResolvedValue('skills + hooked prompt');

      const handler = handlers['sendMessage'];
      const result = await handler({
        conversation_id: 'c2',
        input: 'raw prompt',
        files: [],
        injectSkills: ['star-office-helper'],
      });

      expect(result).toEqual({ success: true });
      expect(prepareFirstMessageMock).toHaveBeenCalledWith('hooked prompt', {
        enabledSkills: ['star-office-helper'],
      });
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'raw prompt',
          agentContent: expect.stringContaining('skills + hooked prompt'),
        })
      );
    });
  });

  describe('warmup', () => {
    it('calls getOrBuildTask for the given conversation_id', async () => {
      const handler = handlers['warmup'];
      await handler({ conversation_id: 'test-id' });

      expect(taskManager.getOrBuildTask).toHaveBeenCalledWith('test-id');
    });

    it('calls initAgent() when task type is "acp"', async () => {
      const initAgent = vi.fn();
      const acpTask = { type: 'acp', initAgent };
      vi.mocked(taskManager.getOrBuildTask).mockResolvedValue(acpTask as any);

      const handler = handlers['warmup'];
      await handler({ conversation_id: 'acp-id' });

      expect(taskManager.getOrBuildTask).toHaveBeenCalledWith('acp-id');
      expect(initAgent).toHaveBeenCalled();
    });

    it('does not call initAgent when task type is not "acp"', async () => {
      const initAgent = vi.fn();
      const geminiTask = { type: 'gemini', initAgent };
      vi.mocked(taskManager.getOrBuildTask).mockResolvedValue(geminiTask as any);

      const handler = handlers['warmup'];
      await handler({ conversation_id: 'gemini-id' });

      expect(taskManager.getOrBuildTask).toHaveBeenCalledWith('gemini-id');
      expect(initAgent).not.toHaveBeenCalled();
    });

    it('silently ignores errors (best-effort)', async () => {
      vi.mocked(taskManager.getOrBuildTask).mockRejectedValue(new Error('Task build failed'));

      const handler = handlers['warmup'];
      await expect(handler({ conversation_id: 'failing-id' })).resolves.toBeUndefined();

      expect(taskManager.getOrBuildTask).toHaveBeenCalledWith('failing-id');
    });
  });
});
