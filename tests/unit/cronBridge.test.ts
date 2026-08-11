import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cron service and skill file functions
const { mockCronService, mockWriteRawCronSkillFile, mockHasCronSkillFile } = vi.hoisted(() => ({
  mockCronService: {
    listJobs: vi.fn(),
    listJobsByConversation: vi.fn(),
    getJob: vi.fn(),
    addJob: vi.fn(),
    updateJob: vi.fn(),
    removeJob: vi.fn(),
    runNow: vi.fn(),
  },
  mockWriteRawCronSkillFile: vi.fn(),
  mockHasCronSkillFile: vi.fn(),
}));

// Proxy-based provider map to capture IPC provider registrations
const providerMap = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

// Mock @/common (ipcBridge with proxy)
vi.mock('@/common', () => {
  function makeProviderProxy(prefix: string) {
    return new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        const key = `${prefix}.${prop}`;
        return {
          provider: (fn: (...args: unknown[]) => unknown) => {
            providerMap.set(key, fn);
          },
          emit: vi.fn(),
        };
      },
    });
  }
  return {
    ipcBridge: {
      cron: makeProviderProxy('cron'),
    },
  };
});

// Mock cron service singleton
vi.mock('@process/services/cron/cronServiceSingleton', () => ({
  cronService: mockCronService,
}));

// Mock cron skill file functions
vi.mock('@process/services/cron/cronSkillFile', () => ({
  writeRawCronSkillFile: mockWriteRawCronSkillFile,
  hasCronSkillFile: mockHasCronSkillFile,
}));

// Mock electron (required by some dependencies)
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp'),
  },
}));

import { initCronBridge } from '@/process/bridge/cronBridge';
import type { ICronJob, ICreateCronJobParams } from '@/common/adapter/ipcBridge';

describe('cronBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMap.clear();
    initCronBridge();
  });

  describe('listJobs', () => {
    it('should delegate to cronService.listJobs', async () => {
      const mockJobs: ICronJob[] = [
        {
          id: 'job-1',
          name: 'Test Job',
          enabled: true,
          schedule: { kind: 'every', everyMs: 60000, description: 'every 1 min' },
          target: { payload: { kind: 'message', text: 'hello' } },
          metadata: {
            conversationId: 'conv-1',
            agentType: 'gemini',
            createdBy: 'user',
            createdAt: 1000,
            updatedAt: 1000,
          },
          state: { runCount: 0, retryCount: 0, maxRetries: 3 },
        },
      ];
      mockCronService.listJobs.mockResolvedValue(mockJobs);

      const handler = providerMap.get('cron.listJobs');
      const result = await handler!();

      expect(mockCronService.listJobs).toHaveBeenCalled();
      expect(result).toEqual(mockJobs);
    });

    it('should return empty array when no jobs exist', async () => {
      mockCronService.listJobs.mockResolvedValue([]);

      const handler = providerMap.get('cron.listJobs');
      const result = await handler!();

      expect(result).toEqual([]);
    });
  });

  describe('listJobsByConversation', () => {
    it('should delegate to cronService.listJobsByConversation with conversationId', async () => {
      const mockJobs: ICronJob[] = [
        {
          id: 'job-1',
          name: 'Conv Job',
          enabled: true,
          schedule: { kind: 'every', everyMs: 60000, description: 'every 1 min' },
          target: { payload: { kind: 'message', text: 'hello' } },
          metadata: {
            conversationId: 'conv-123',
            agentType: 'gemini',
            createdBy: 'user',
            createdAt: 1000,
            updatedAt: 1000,
          },
          state: { runCount: 0, retryCount: 0, maxRetries: 3 },
        },
      ];
      mockCronService.listJobsByConversation.mockResolvedValue(mockJobs);

      const handler = providerMap.get('cron.listJobsByConversation');
      const result = await handler!({ conversationId: 'conv-123' });

      expect(mockCronService.listJobsByConversation).toHaveBeenCalledWith('conv-123');
      expect(result).toEqual(mockJobs);
    });
  });

  describe('getJob', () => {
    it('should delegate to cronService.getJob with jobId', async () => {
      const mockJob: ICronJob = {
        id: 'job-1',
        name: 'Test Job',
        enabled: true,
        schedule: { kind: 'every', everyMs: 60000, description: 'every 1 min' },
        target: { payload: { kind: 'message', text: 'hello' } },
        metadata: {
          conversationId: 'conv-1',
          agentType: 'gemini',
          createdBy: 'user',
          createdAt: 1000,
          updatedAt: 1000,
        },
        state: { runCount: 0, retryCount: 0, maxRetries: 3 },
      };
      mockCronService.getJob.mockResolvedValue(mockJob);

      const handler = providerMap.get('cron.getJob');
      const result = await handler!({ jobId: 'job-1' });

      expect(mockCronService.getJob).toHaveBeenCalledWith('job-1');
      expect(result).toEqual(mockJob);
    });

    it('should return null when job does not exist', async () => {
      mockCronService.getJob.mockResolvedValue(null);

      const handler = providerMap.get('cron.getJob');
      const result = await handler!({ jobId: 'missing-job' });

      expect(result).toBeNull();
    });
  });

  describe('addJob', () => {
    it('should delegate to cronService.addJob with params', async () => {
      const params: ICreateCronJobParams = {
        name: 'New Job',
        schedule: { kind: 'every', everyMs: 60000, description: 'every 1 min' },
        prompt: 'test prompt',
        conversationId: 'conv-1',
        agentType: 'gemini',
        createdBy: 'user',
      };
      const mockJob: ICronJob = {
        id: 'job-new',
        name: 'New Job',
        enabled: true,
        schedule: { kind: 'every', everyMs: 60000, description: 'every 1 min' },
        target: { payload: { kind: 'message', text: 'test prompt' } },
        metadata: {
          conversationId: 'conv-1',
          agentType: 'gemini',
          createdBy: 'user',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        state: { runCount: 0, retryCount: 0, maxRetries: 3 },
      };
      mockCronService.addJob.mockResolvedValue(mockJob);

      const handler = providerMap.get('cron.addJob');
      const result = await handler!(params);

      expect(mockCronService.addJob).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockJob);
    });
  });

  describe('updateJob', () => {
    it('should delegate to cronService.updateJob with jobId and updates', async () => {
      const updates = { enabled: false };
      const updatedJob: ICronJob = {
        id: 'job-1',
        name: 'Test Job',
        enabled: false,
        schedule: { kind: 'every', everyMs: 60000, description: 'every 1 min' },
        target: { payload: { kind: 'message', text: 'hello' } },
        metadata: {
          conversationId: 'conv-1',
          agentType: 'gemini',
          createdBy: 'user',
          createdAt: 1000,
          updatedAt: 2000,
        },
        state: { runCount: 0, retryCount: 0, maxRetries: 3 },
      };
      mockCronService.updateJob.mockResolvedValue(updatedJob);

      const handler = providerMap.get('cron.updateJob');
      const result = await handler!({ jobId: 'job-1', updates });

      expect(mockCronService.updateJob).toHaveBeenCalledWith('job-1', updates);
      expect(result).toEqual(updatedJob);
    });
  });

  describe('removeJob', () => {
    it('should delegate to cronService.removeJob with jobId', async () => {
      mockCronService.removeJob.mockResolvedValue(undefined);

      const handler = providerMap.get('cron.removeJob');
      await handler!({ jobId: 'job-1' });

      expect(mockCronService.removeJob).toHaveBeenCalledWith('job-1');
    });
  });

  describe('runNow', () => {
    it('should delegate to cronService.runNow and return conversationId shape', async () => {
      mockCronService.runNow.mockResolvedValue('conv-123');

      const handler = providerMap.get('cron.runNow');
      const result = await handler!({ jobId: 'job-1' });

      expect(mockCronService.runNow).toHaveBeenCalledWith('job-1');
      expect(result).toEqual({ conversationId: 'conv-123' });
    });

    it('should wrap conversationId string into object shape', async () => {
      mockCronService.runNow.mockResolvedValue('conv-xyz');

      const handler = providerMap.get('cron.runNow');
      const result = await handler!({ jobId: 'job-2' });

      expect(result).toEqual({ conversationId: 'conv-xyz' });
      expect(typeof result.conversationId).toBe('string');
    });
  });

  describe('saveSkill', () => {
    it('should delegate to writeRawCronSkillFile with jobId and content', async () => {
      mockWriteRawCronSkillFile.mockResolvedValue('/path/to/SKILL.md');

      const handler = providerMap.get('cron.saveSkill');
      await handler!({ jobId: 'job-1', content: '---\nname: test\n---\nContent' });

      expect(mockWriteRawCronSkillFile).toHaveBeenCalledWith('job-1', '---\nname: test\n---\nContent');
    });

    it('should propagate errors from writeRawCronSkillFile', async () => {
      mockWriteRawCronSkillFile.mockRejectedValue(new Error('Invalid SKILL.md'));

      const handler = providerMap.get('cron.saveSkill');

      await expect(handler!({ jobId: 'job-1', content: 'invalid' })).rejects.toThrow('Invalid SKILL.md');
    });
  });

  describe('hasSkill', () => {
    it('should delegate to hasCronSkillFile with jobId', async () => {
      mockHasCronSkillFile.mockResolvedValue(true);

      const handler = providerMap.get('cron.hasSkill');
      const result = await handler!({ jobId: 'job-1' });

      expect(mockHasCronSkillFile).toHaveBeenCalledWith('job-1');
      expect(result).toBe(true);
    });

    it('should return false when skill file does not exist', async () => {
      mockHasCronSkillFile.mockResolvedValue(false);

      const handler = providerMap.get('cron.hasSkill');
      const result = await handler!({ jobId: 'job-2' });

      expect(result).toBe(false);
    });
  });

  describe('provider registration', () => {
    it('should register all expected IPC providers', () => {
      const expectedProviders = [
        'cron.listJobs',
        'cron.listJobsByConversation',
        'cron.getJob',
        'cron.addJob',
        'cron.updateJob',
        'cron.removeJob',
        'cron.runNow',
        'cron.saveSkill',
        'cron.hasSkill',
      ];

      for (const providerName of expectedProviders) {
        expect(providerMap.has(providerName)).toBe(true);
      }
    });
  });
});
