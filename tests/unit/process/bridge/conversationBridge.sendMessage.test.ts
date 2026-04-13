import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture all provider callbacks registered during initConversationBridge
const providerCallbacks = new Map<string, (...args: unknown[]) => unknown>();

function mockProvider(name: string) {
  return {
    provider: vi.fn((cb: (...args: unknown[]) => unknown) => {
      providerCallbacks.set(name, cb);
    }),
    emit: vi.fn(),
  };
}

// Mock ipcBridge to capture provider registrations
vi.mock('@/common', () => ({
  ipcBridge: {
    openclawConversation: {
      getRuntime: mockProvider('openclawConversation.getRuntime'),
    },
    conversation: {
      create: mockProvider('conversation.create'),
      reloadContext: mockProvider('conversation.reloadContext'),
      getAssociateConversation: mockProvider('conversation.getAssociateConversation'),
      createWithConversation: mockProvider('conversation.createWithConversation'),
      remove: mockProvider('conversation.remove'),
      update: mockProvider('conversation.update'),
      reset: mockProvider('conversation.reset'),
      warmup: mockProvider('conversation.warmup'),
      get: mockProvider('conversation.get'),
      getWorkspace: mockProvider('conversation.getWorkspace'),
      stop: mockProvider('conversation.stop'),
      getSlashCommands: mockProvider('conversation.getSlashCommands'),
      askSideQuestion: mockProvider('conversation.askSideQuestion'),
      sendMessage: mockProvider('conversation.sendMessage'),
      confirmMessage: mockProvider('conversation.confirmMessage'),
      listChanged: { emit: vi.fn() },
      listByCronJob: mockProvider('conversation.listByCronJob'),
      responseStream: { emit: vi.fn() },
      confirmation: {
        confirm: mockProvider('conversation.confirmation.confirm'),
        list: mockProvider('conversation.confirmation.list'),
      },
      approval: {
        check: mockProvider('conversation.approval.check'),
      },
    },
    preview: {
      snapshotListChanged: { emit: vi.fn() },
    },
  },
}));

// Mock all external dependencies
vi.mock('@process/utils/initStorage', () => ({
  getSkillsDir: vi.fn(() => '/mock/skills'),
  getBuiltinSkillsCopyDir: vi.fn(() => '/mock/builtin-skills'),
  getSystemDir: vi.fn(() => ({ cacheDir: '/mock/cache' })),
  ProcessChat: { conversations: [] },
}));

vi.mock('@process/utils/tray', () => ({
  refreshTrayMenu: vi.fn(),
}));

vi.mock('@process/utils', () => ({
  copyFilesToDirectory: vi.fn(async () => []),
  readDirectoryRecursive: vi.fn(async () => []),
}));

vi.mock('@process/utils/openclawUtils', () => ({
  computeOpenClawIdentityHash: vi.fn(() => 'mock-hash'),
}));

vi.mock('@/process/bridge/migrationUtils', () => ({
  migrateConversationToDatabase: vi.fn(),
}));

vi.mock('@/process/bridge/services/ConversationSideQuestionService', () => ({
  ConversationSideQuestionService: class {
    ask = vi.fn();
  },
}));

vi.mock('@/process/task/agentUtils', () => ({
  prepareFirstMessage: vi.fn(async (input: string) => input),
}));

// Import after mocks
const { initConversationBridge } = await import('@/process/bridge/conversationBridge');

describe('conversationBridge.sendMessage', () => {
  const mockConversationService = {
    create: vi.fn(),
    getById: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
    reset: vi.fn(),
    list: vi.fn(),
  } as unknown as Record<string, unknown>;

  const mockWorkerTaskManager = {
    getOrBuildTask: vi.fn(),
    getTask: vi.fn(),
    removeTask: vi.fn(),
  } as unknown as Record<string, unknown>;

  beforeEach(() => {
    providerCallbacks.clear();
    vi.clearAllMocks();
    initConversationBridge(mockConversationService, mockWorkerTaskManager);
  });

  it('returns error when params is undefined (ELECTRON-FK)', async () => {
    const handler = providerCallbacks.get('conversation.sendMessage');
    expect(handler).toBeDefined();

    // Simulate WebSocket message with missing data payload
    const result = await handler!(undefined);
    expect(result).toEqual({ success: false, msg: 'Missing request parameters' });
  });

  it('returns error when params is null', async () => {
    const handler = providerCallbacks.get('conversation.sendMessage');

    const result = await handler!(null);
    expect(result).toEqual({ success: false, msg: 'Missing request parameters' });
  });

  it('returns error when conversation task is not found', async () => {
    const handler = providerCallbacks.get('conversation.sendMessage');
    mockWorkerTaskManager.getOrBuildTask.mockRejectedValue(new Error('not found'));

    const result = await handler!({
      conversation_id: 'missing-id',
      input: 'hello',
      msg_id: 'msg-1',
      files: [],
    });

    expect(result).toEqual({ success: false, msg: 'not found' });
  });

  it('defaults non-gemini files to an empty array when files are omitted', async () => {
    const handler = providerCallbacks.get('conversation.sendMessage');
    const task = {
      type: 'acp',
      workspace: '/mock/workspace',
      sendMessage: vi.fn(async () => undefined),
    };
    mockWorkerTaskManager.getOrBuildTask.mockResolvedValue(task);

    const result = await handler!({
      conversation_id: 'acp-conversation',
      input: 'hello',
      msg_id: 'msg-1',
    });

    expect(result).toEqual({
      success: true,
      data: { displayMessage: 'hello' },
    });
    expect(task.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'hello',
        files: [],
        agentContent: 'hello',
      })
    );
  });

  it('copies ACP files into the workspace before sending', async () => {
    const handler = providerCallbacks.get('conversation.sendMessage');
    const task = {
      type: 'acp',
      workspace: '/mock/workspace',
      sendMessage: vi.fn(async () => undefined),
    };
    const utilsMod = await vi.importMock<typeof import('@process/utils')>('@process/utils');
    utilsMod.copyFilesToDirectory.mockResolvedValueOnce(['/mock/workspace/photo.png']);
    mockWorkerTaskManager.getOrBuildTask.mockResolvedValue(task);

    const result = await handler!({
      conversation_id: 'acp-conversation',
      input: 'describe this image',
      msg_id: 'msg-2',
      files: ['/mock/cache/temp/photo.png'],
    });

    expect(result).toEqual({
      success: true,
      data: {
        displayMessage: 'describe this image\n\n[[AION_FILES]]\n/mock/workspace/photo.png',
      },
    });
    expect(utilsMod.copyFilesToDirectory).toHaveBeenCalledWith(
      '/mock/workspace',
      ['/mock/cache/temp/photo.png'],
      false,
      '/mock/cache'
    );
    expect(task.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        files: ['/mock/workspace/photo.png'],
      })
    );
  });

  it('rewrites the display message to the copied workspace path when filenames are renamed on copy', async () => {
    const handler = providerCallbacks.get('conversation.sendMessage');
    const task = {
      type: 'gemini',
      workspace: '/mock/workspace',
      sendMessage: vi.fn(async () => undefined),
    };
    const utilsMod = await vi.importMock<typeof import('@process/utils')>('@process/utils');
    utilsMod.copyFilesToDirectory.mockResolvedValueOnce(['/mock/workspace/photo_1712345678901.png']);
    mockWorkerTaskManager.getOrBuildTask.mockResolvedValue(task);

    const result = await handler!({
      conversation_id: 'gemini-conversation',
      input: 'describe this image',
      msg_id: 'msg-3',
      files: ['/mock/cache/temp/photo.png'],
    });

    expect(result).toEqual({
      success: true,
      data: {
        displayMessage: 'describe this image\n\n[[AION_FILES]]\n/mock/workspace/photo_1712345678901.png',
      },
    });
    expect(task.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'describe this image\n\n[[AION_FILES]]\n/mock/workspace/photo_1712345678901.png',
        content: 'describe this image\n\n[[AION_FILES]]\n/mock/workspace/photo_1712345678901.png',
        files: ['/mock/workspace/photo_1712345678901.png'],
      })
    );
  });
});
