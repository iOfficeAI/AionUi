import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetConversation, mockAcpManager } = vi.hoisted(() => ({
  mockGetConversation: vi.fn(),
  mockAcpManager: vi.fn(),
}));

vi.mock('../../src/process/services/database/SqliteConversationRepository', () => ({
  SqliteConversationRepository: class {
    getConversation = mockGetConversation;
  },
}));

vi.mock('../../src/process/task/AcpAgentManager', () => ({
  default: class {
    type = 'acp';
    kill = vi.fn();
    data: Record<string, unknown>;
    constructor(data: Record<string, unknown>) {
      this.data = data;
      mockAcpManager(data);
    }
  },
}));

vi.mock('../../src/process/task/GeminiAgentManager', () => ({
  GeminiAgentManager: vi.fn().mockImplementation(() => ({ type: 'gemini', kill: vi.fn() })),
}));

vi.mock('../../src/process/agent/codex', () => ({
  CodexAgentManager: vi.fn().mockImplementation(() => ({ type: 'codex', kill: vi.fn() })),
}));

vi.mock('../../src/process/task/OpenClawAgentManager', () => ({
  default: vi.fn().mockImplementation(() => ({ type: 'openclaw-gateway', kill: vi.fn() })),
}));

vi.mock('../../src/process/task/NanoBotAgentManager', () => ({
  default: vi.fn().mockImplementation(() => ({ type: 'nanobot', kill: vi.fn() })),
}));

import { workerTaskManager } from '../../src/process/task/workerTaskManagerSingleton';

describe('workerTaskManagerSingleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerTaskManager.clear();
  });

  it('prefers persisted currentModelId from conversation.extra for acp tasks', async () => {
    mockGetConversation.mockResolvedValue({
      id: 'conv-extra-model',
      type: 'acp',
      model: { useModel: 'gemini-2.0-flash' },
      extra: { backend: 'gemini', currentModelId: 'gemini-2.5-pro' },
    });

    await workerTaskManager.getOrBuildTask('conv-extra-model');

    expect(mockAcpManager).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-extra-model',
        currentModelId: 'gemini-2.5-pro',
      })
    );
  });

  it('falls back to conversation.model.useModel when no persisted currentModelId exists', async () => {
    mockGetConversation.mockResolvedValue({
      id: 'conv-model-fallback',
      type: 'acp',
      model: { useModel: 'gemini-2.0-flash' },
      extra: { backend: 'gemini' },
    });

    await workerTaskManager.getOrBuildTask('conv-model-fallback');

    expect(mockAcpManager).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-model-fallback',
        currentModelId: 'gemini-2.0-flash',
      })
    );
  });
});
