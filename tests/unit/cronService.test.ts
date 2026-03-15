import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cronService } from '../../src/process/services/cron/CronService';
import { cronStore } from '../../src/process/services/cron/CronStore';
import { ipcBridge } from '../../src/common';

vi.mock('electron', () => ({
  powerSaveBlocker: {
    start: vi.fn(),
    stop: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => '/test/path'),
  },
}));

// Mock dependencies
vi.mock('../../src/process/services/cron/CronStore', () => ({
  cronStore: {
    listByConversation: vi.fn(),
    listEnabled: vi.fn(() => []),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
  },
}));

vi.mock('../../src/process/database', () => ({
  getDatabase: vi.fn(() => ({
    updateConversation: vi.fn(),
  })),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    cron: {
      onJobCreated: { emit: vi.fn() },
      onJobUpdated: { emit: vi.fn() },
      onJobRemoved: { emit: vi.fn() },
    },
  },
}));

vi.mock('../../src/common/utils', () => ({
  uuid: vi.fn(() => 'test-uuid'),
}));

describe('CronService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addJob', () => {
    it('should emit onJobCreated event when adding a job', async () => {
      vi.mocked(cronStore.listByConversation).mockReturnValue([]);

      const params = {
        name: 'Test Task',
        schedule: { kind: 'every', everyMs: 60000, description: 'Every minute' } as any,
        message: 'Hello',
        conversationId: 'conv-123',
        agentType: 'gemini' as any,
        createdBy: 'user' as any,
      };

      const job = await cronService.addJob(params);

      expect(cronStore.insert).toHaveBeenCalled();
      expect(ipcBridge.cron.onJobCreated.emit).toHaveBeenCalledWith(job);
    });
  });

  describe('removeJob', () => {
    it('should emit onJobRemoved event when removing a job', async () => {
      const jobId = 'cron_test-uuid';

      await cronService.removeJob(jobId);

      expect(cronStore.delete).toHaveBeenCalledWith(jobId);
      expect(ipcBridge.cron.onJobRemoved.emit).toHaveBeenCalledWith({ jobId });
    });
  });
});
