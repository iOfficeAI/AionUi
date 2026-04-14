import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

// Capture provider handlers so tests can invoke them directly
type ProviderHandler = (...args: unknown[]) => unknown;

const handlers: Record<string, ProviderHandler> = {};
function makeChannel(name: string) {
  return {
    provider: vi.fn((fn: ProviderHandler) => {
      handlers[name] = fn;
    }),
    emit: vi.fn(),
    invoke: vi.fn(),
  };
}

vi.mock('../../src/common', () => ({
  ipcBridge: {
    conversation: {
      create: makeChannel('create'),
      createWithConversation: makeChannel('createWithConversation'),
      get: makeChannel('get'),
      getAssociateConversation: makeChannel('getAssociateConversation'),
      remove: makeChannel('remove'),
      update: makeChannel('update'),
      reset: makeChannel('reset'),
      stop: makeChannel('stop'),
      setConfig: makeChannel('setConfig'),
      sendMessage: makeChannel('sendMessage'),
      getSlashCommands: makeChannel('getSlashCommands'),
      askSideQuestion: makeChannel('askSideQuestion'),
      reloadContext: makeChannel('reloadContext'),
      getWorkspace: makeChannel('getWorkspace'),
      responseSearchWorkSpace: makeChannel('responseSearchWorkSpace'),
      warmup: makeChannel('warmup'),
      confirmation: {
        confirm: makeChannel('confirmation.confirm'),
        list: makeChannel('confirmation.list'),
      },
      approval: {
        check: makeChannel('approval.check'),
      },
      listChanged: { emit: vi.fn() },
      listByCronJob: makeChannel('listByCronJob'),
    },
    openclawConversation: {
      getRuntime: makeChannel('openclawConversation.getRuntime'),
    },
  },
}));

vi.mock('../../src/process/utils/initStorage', () => ({
  ProcessChat: { get: vi.fn(async () => []) },
  getSkillsDir: vi.fn(() => '/skills'),
  ProcessConfig: { get: vi.fn(async () => []) },
}));

vi.mock('../../src/process/bridge/migrationUtils', () => ({
  migrateConversationToDatabase: vi.fn(async () => {}),
}));

vi.mock('../../src/agent/gemini', () => ({
  GeminiAgent: { buildFileServer: vi.fn(() => ({})) },
  GeminiApprovalStore: { createKeysFromConfirmation: vi.fn(() => []) },
}));

vi.mock('../../src/process/utils', () => ({
  copyFilesToDirectory: vi.fn(async () => []),
  readDirectoryRecursive: vi.fn(async () => null),
}));

vi.mock('../../src/process/utils/openclawUtils', () => ({
  computeOpenClawIdentityHash: vi.fn(async () => 'hash'),
}));

vi.mock('../../src/process/task/agentUtils', () => ({
  prepareFirstMessage: vi.fn(async (msg: string) => msg),
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
    // Re-register providers by re-initializing the bridge
    service = makeService();
    taskManager = makeTaskManager();
    initConversationBridge(service, taskManager);
  });

  describe('create', () => {
    it('returns undefined and skips service when type is missing', async () => {
      const handler = handlers['create'];

      const result = await handler({
        name: 'missing type',
        model: { id: 'm1' },
        extra: {},
      } as unknown);

      expect(result).toBeUndefined();
      expect(service.createConversation).not.toHaveBeenCalled();
    });

    it('returns undefined and skips service when type is unknown', async () => {
      const handler = handlers['create'];

      const result = await handler({
        type: 'unknown-agent',
        name: 'invalid type',
        model: { id: 'm1' },
        extra: {},
      } as unknown);

      expect(result).toBeUndefined();
      expect(service.createConversation).not.toHaveBeenCalled();
    });
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

  describe('getWorkspace — ENOENT handling', () => {
    it('returns empty array when buildFileServer throws', async () => {
      const geminiMod = await vi.importMock<typeof import('../../src/agent/gemini')>('../../src/agent/gemini');
      geminiMod.GeminiAgent.buildFileServer.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const handler = handlers['getWorkspace'];
      const result = await handler({ workspace: '/missing/path', path: '/missing/path', search: '' });

      expect(result).toEqual([]);
      geminiMod.GeminiAgent.buildFileServer.mockReturnValue({});
    });

    it('returns empty array when readDirectoryRecursive rejects with ENOENT', async () => {
      const utilsMod = await vi.importMock<typeof import('../../src/process/utils')>('../../src/process/utils');
      utilsMod.readDirectoryRecursive.mockRejectedValueOnce(new Error('ENOENT: no such file or directory, stat'));

      const handler = handlers['getWorkspace'];
      const result = await handler({ workspace: '/missing', path: '/missing', search: '' });

      expect(result).toEqual([]);
    });
  });

  describe('sendMessage — copyFilesToDirectory failure', () => {
    it('does not reject when copyFilesToDirectory throws ENOENT', async () => {
      const utilsMod = await vi.importMock<typeof import('../../src/process/utils')>('../../src/process/utils');
      utilsMod.copyFilesToDirectory.mockRejectedValueOnce(new Error('ENOENT: no such file or directory, stat'));

      const mockTask = {
        workspace: '/deleted/workspace',
        sendMessage: vi.fn().mockResolvedValue(undefined),
      };
      const tm = makeTaskManager({
        getOrBuildTask: vi.fn().mockResolvedValue(mockTask),
      });
      initConversationBridge(service, tm);

      const handler = handlers['sendMessage'];
      const result = await handler({
        conversation_id: 'c1',
        input: 'hello',
        files: ['/some/file.txt'],
      });

      expect(result).toEqual({ success: true });
      // sendMessage should still be called with empty files array
      expect(mockTask.sendMessage).toHaveBeenCalled();
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
      const acpTask = { type: 'acp', initAgent } as unknown as Awaited<
        ReturnType<IWorkerTaskManager['getOrBuildTask']>
      >;
      vi.mocked(taskManager.getOrBuildTask).mockResolvedValue(acpTask);

      const handler = handlers['warmup'];
      await handler({ conversation_id: 'acp-id' });

      expect(taskManager.getOrBuildTask).toHaveBeenCalledWith('acp-id');
      expect(initAgent).toHaveBeenCalled();
    });

    it('does not call initAgent when task type is not "acp"', async () => {
      const initAgent = vi.fn();
      const geminiTask = {
        type: 'gemini',
        initAgent,
      } as unknown as Awaited<ReturnType<IWorkerTaskManager['getOrBuildTask']>>;
      vi.mocked(taskManager.getOrBuildTask).mockResolvedValue(geminiTask);

      const handler = handlers['warmup'];
      await handler({ conversation_id: 'gemini-id' });

      expect(taskManager.getOrBuildTask).toHaveBeenCalledWith('gemini-id');
      expect(initAgent).not.toHaveBeenCalled();
    });

    it('silently ignores errors (best-effort)', async () => {
      vi.mocked(taskManager.getOrBuildTask).mockRejectedValue(new Error('Task build failed'));

      const handler = handlers['warmup'];
      // Should not throw
      await expect(handler({ conversation_id: 'failing-id' })).resolves.toBeUndefined();

      expect(taskManager.getOrBuildTask).toHaveBeenCalledWith('failing-id');
    });
  });
});
