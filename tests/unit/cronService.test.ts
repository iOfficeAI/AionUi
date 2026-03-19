import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cronService } from '../../src/process/services/cron/CronService';
import { cronStore } from '../../src/process/services/cron/CronStore';
import { getDatabase } from '../../src/process/database';
import { ipcBridge } from '../../src/common';

vi.mock('electron', () => ({
  powerSaveBlocker: {
    start: vi.fn(),
    stop: vi.fn(),
  },
  app: {
    setName: vi.fn(),
    getPath: vi.fn(() => '/test/path'),
  },
}));

// Mock dependencies
vi.mock('../../src/process/services/cron/CronStore', () => ({
  cronStore: {
    listByConversation: vi.fn(),
    listEnabled: vi.fn(() => []),
    listAll: vi.fn(() => []),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
  },
}));

vi.mock('../../src/process/database', () => ({
  getDatabase: vi.fn(() => ({
    updateConversation: vi.fn(),
    getConversation: vi.fn(() => ({ success: true, data: {} })),
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

  describe('init', () => {
    it('should remove orphan jobs whose conversation no longer exists', async () => {
      const orphanJob = {
        id: 'cron_orphan',
        name: 'Orphan Job',
        enabled: true,
        schedule: { kind: 'every', everyMs: 60000, description: 'Every minute' } as any,
        target: { payload: { kind: 'message' as const, text: 'Hello' } },
        metadata: {
          conversationId: 'conv-deleted',
          conversationTitle: 'Deleted Conversation',
          agentType: 'gemini' as any,
          createdBy: 'user' as any,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        state: { runCount: 0, retryCount: 0, maxRetries: 3 },
      };

      vi.mocked(cronStore.listAll).mockReturnValue([orphanJob]);
      vi.mocked(cronStore.listEnabled).mockReturnValue([]);
      vi.mocked(getDatabase).mockReturnValue({
        updateConversation: vi.fn(),
        getConversation: vi.fn(() => ({ success: false, data: undefined })),
      } as any);

      // Reset initialized state by accessing private field via type cast
      (cronService as any).initialized = false;
      await cronService.init();

      expect(cronStore.delete).toHaveBeenCalledWith(orphanJob.id);
      expect(ipcBridge.cron.onJobRemoved.emit).toHaveBeenCalledWith({ jobId: orphanJob.id });
    });

    it('should not remove jobs whose conversation exists', async () => {
      const validJob = {
        id: 'cron_valid',
        name: 'Valid Job',
        enabled: true,
        schedule: { kind: 'every', everyMs: 60000, description: 'Every minute' } as any,
        target: { payload: { kind: 'message' as const, text: 'Hello' } },
        metadata: {
          conversationId: 'conv-exists',
          conversationTitle: 'Existing Conversation',
          agentType: 'gemini' as any,
          createdBy: 'user' as any,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        state: { runCount: 0, retryCount: 0, maxRetries: 3 },
      };

      vi.mocked(cronStore.listAll).mockReturnValue([validJob]);
      vi.mocked(cronStore.listEnabled).mockReturnValue([validJob]);
      vi.mocked(getDatabase).mockReturnValue({
        updateConversation: vi.fn(),
        getConversation: vi.fn(() => ({ success: true, data: { id: 'conv-exists' } })),
      } as any);

      (cronService as any).initialized = false;
      await cronService.init();

      expect(cronStore.delete).not.toHaveBeenCalled();
    });
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

  describe('updateJob', () => {
    it('should update metadata.conversationId when migrating a job', async () => {
      const jobId = 'cron_test-uuid';
      const existingJob = {
        id: jobId,
        name: 'Test Job',
        enabled: false,
        schedule: { kind: 'every', everyMs: 60000, description: 'Every minute' } as any,
        target: { payload: { kind: 'message' as const, text: 'Hello' } },
        metadata: {
          conversationId: 'conv-old',
          conversationTitle: 'Old Conversation',
          agentType: 'gemini' as any,
          createdBy: 'user' as any,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        state: { runCount: 0, retryCount: 0, maxRetries: 3 },
      };

      const updatedJob = {
        ...existingJob,
        metadata: { ...existingJob.metadata, conversationId: 'conv-new', conversationTitle: 'New Conversation' },
      };

      // First call returns existing, subsequent calls return updated
      vi.mocked(cronStore.getById).mockReturnValueOnce(existingJob).mockReturnValue(updatedJob);

      const updates = {
        metadata: {
          ...existingJob.metadata,
          conversationId: 'conv-new',
          conversationTitle: 'New Conversation',
        },
      };

      const result = await cronService.updateJob(jobId, updates);

      expect(cronStore.update).toHaveBeenCalledWith(jobId, updates);
      expect(ipcBridge.cron.onJobUpdated.emit).toHaveBeenCalled();
      expect(result.metadata.conversationId).toBe('conv-new');
    });

    it('should emit onJobUpdated after updating a job (no duplicate from caller needed)', async () => {
      const jobId = 'cron_test-uuid';
      const existingJob = {
        id: jobId,
        name: 'Test Job',
        enabled: false,
        schedule: { kind: 'every', everyMs: 60000, description: 'Every minute' } as any,
        target: { payload: { kind: 'message' as const, text: 'Hello' } },
        metadata: {
          conversationId: 'conv-123',
          conversationTitle: 'Test',
          agentType: 'gemini' as any,
          createdBy: 'user' as any,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        state: { runCount: 0, retryCount: 0, maxRetries: 3 },
      };

      vi.mocked(cronStore.getById).mockReturnValue(existingJob);

      await cronService.updateJob(jobId, { name: 'Updated Name' });

      // updateJob internally emits onJobUpdated — caller should not emit again
      expect(ipcBridge.cron.onJobUpdated.emit).toHaveBeenCalled();
    });
  });
});
