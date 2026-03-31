import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshServerHierarchicalMemoryMock } = vi.hoisted(() => ({
  refreshServerHierarchicalMemoryMock: vi.fn(),
}));

vi.mock('@office-ai/aioncli-core', async () => {
  const actual = await vi.importActual<typeof import('@office-ai/aioncli-core')>('@office-ai/aioncli-core');
  return {
    ...actual,
    refreshServerHierarchicalMemory: refreshServerHierarchicalMemoryMock,
  };
});

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: {
      isPackaged: () => false,
      getAppPath: () => null,
      getDataDir: () => '/tmp',
      getHomeDir: () => '/tmp',
      getTempDir: () => '/tmp',
      needsCliSafeSymlinks: () => false,
    },
    worker: {
      fork: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        postMessage: vi.fn(),
        kill: vi.fn(),
      })),
    },
  }),
}));

vi.mock('../../src/process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({})),
}));

import { GeminiAgent } from '../../src/process/agent/gemini';
import { GeminiAgentManager } from '../../src/process/task/GeminiAgentManager';

describe('Gemini abort recovery', () => {
  beforeEach(() => {
    refreshServerHierarchicalMemoryMock.mockReset();
    refreshServerHierarchicalMemoryMock.mockResolvedValue({ memoryContent: 'Persisted memory' });
  });

  it('reloads persisted history after stop()', async () => {
    const postMessagePromise = vi.fn().mockResolvedValue(undefined);
    const injectHistoryFromDatabase = vi.fn().mockResolvedValue(undefined);

    await GeminiAgentManager.prototype.stop.call({
      postMessagePromise,
      injectHistoryFromDatabase,
    } as unknown as GeminiAgentManager);

    expect(postMessagePromise).toHaveBeenCalledWith('stop.stream', {});
    expect(injectHistoryFromDatabase).toHaveBeenCalledTimes(1);
  });

  it('resets the Gemini chat before reinjecting recent history', async () => {
    const resetChat = vi.fn().mockResolvedValue(undefined);
    const setUserMemory = vi.fn();
    const fakeAgent = {
      config: { setUserMemory },
      workspace: '/tmp/workspace',
      settings: {},
      geminiClient: { resetChat },
      historyPrefix: null,
      historyUsedOnce: true,
      skillsIndexPrependedOnce: true,
    } as unknown as GeminiAgent;

    await GeminiAgent.prototype.injectConversationHistory.call(fakeAgent, 'User: hi\nAssistant: hello');

    expect(resetChat).toHaveBeenCalledTimes(1);
    expect(refreshServerHierarchicalMemoryMock).toHaveBeenCalledWith((fakeAgent as { config: unknown }).config);
    expect((fakeAgent as { historyPrefix: string | null }).historyPrefix).toBe(
      'Conversation history (recent):\nUser: hi\nAssistant: hello\n\n'
    );
    expect((fakeAgent as { historyUsedOnce: boolean }).historyUsedOnce).toBe(false);
    expect((fakeAgent as { skillsIndexPrependedOnce: boolean }).skillsIndexPrependedOnce).toBe(false);
    expect(setUserMemory).toHaveBeenCalledWith('Persisted memory\n\n[Recent Chat]\nUser: hi\nAssistant: hello');
  });
});
