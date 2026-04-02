/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CronJob } from '@process/services/cron/CronStore';

// Mock electron
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/test') } }));

// Mock database with SQLite-style prepare() API
const mockPrepareInstance = vi.hoisted(() => ({
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
}));

const mockDriver = vi.hoisted(() => ({
  prepare: vi.fn(() => mockPrepareInstance),
}));

const mockDb = vi.hoisted(() => ({
  getDriver: vi.fn(() => mockDriver),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => Promise.resolve(mockDb)),
}));

// Import after mocks are set up
import { cronStore } from '@process/services/cron/CronStore';

describe('CronStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('jobToRow / rowToJob round-trip', () => {
    it('correctly converts "every" schedule kind', async () => {
      const job: CronJob = {
        id: 'job-1',
        name: 'Test Every Job',
        enabled: true,
        schedule: {
          kind: 'every',
          everyMs: 60000,
          description: 'Every minute',
        },
        target: {
          payload: { kind: 'message', text: 'Hello' },
          executionMode: 'existing',
        },
        metadata: {
          conversationId: 'conv-1',
          conversationTitle: 'Test Conversation',
          agentType: 'gemini',
          createdBy: 'user',
          createdAt: 1000,
          updatedAt: 2000,
          agentConfig: {
            backend: 'gemini',
            name: 'Test Agent',
            isPreset: true,
          },
        },
        state: {
          nextRunAtMs: 3000,
          lastRunAtMs: 4000,
          lastStatus: 'ok',
          lastError: undefined,
          runCount: 5,
          retryCount: 0,
          maxRetries: 3,
        },
      };

      // Mock insert to store and retrieve
      mockPrepareInstance.run.mockImplementation(() => ({ changes: 1 }));
      await cronStore.insert(job);

      // Verify the INSERT was called
      expect(mockDriver.prepare).toHaveBeenCalled();
      const insertSql = mockDriver.prepare.mock.calls[0][0];
      expect(insertSql).toContain('INSERT INTO cron_jobs');

      // Verify the values passed to run()
      const runArgs = mockPrepareInstance.run.mock.calls[0];
      expect(runArgs[0]).toBe('job-1'); // id
      expect(runArgs[1]).toBe('Test Every Job'); // name
      expect(runArgs[2]).toBe(1); // enabled (true -> 1)
      expect(runArgs[3]).toBe('every'); // schedule_kind
      expect(runArgs[4]).toBe('60000'); // schedule_value
      expect(runArgs[5]).toBeNull(); // schedule_tz
      expect(runArgs[6]).toBe('Every minute'); // schedule_description
      expect(runArgs[7]).toBe('Hello'); // payload_message
      expect(runArgs[8]).toBe('existing'); // execution_mode
      expect(runArgs[9]).toBe(JSON.stringify(job.metadata.agentConfig)); // agent_config
      expect(runArgs[10]).toBe('conv-1'); // conversation_id
      expect(runArgs[11]).toBe('Test Conversation'); // conversation_title
      expect(runArgs[12]).toBe('gemini'); // agent_type
      expect(runArgs[13]).toBe('user'); // created_by
      expect(runArgs[14]).toBe(1000); // created_at
      expect(runArgs[15]).toBe(2000); // updated_at
      expect(runArgs[16]).toBe(3000); // next_run_at
      expect(runArgs[17]).toBe(4000); // last_run_at
      expect(runArgs[18]).toBe('ok'); // last_status
      expect(runArgs[19]).toBeNull(); // last_error (undefined -> null in jobToRow)
      expect(runArgs[20]).toBe(5); // run_count
      expect(runArgs[21]).toBe(0); // retry_count
      expect(runArgs[22]).toBe(3); // max_retries

      // Now test retrieval (round-trip)
      mockPrepareInstance.get.mockReturnValue({
        id: 'job-1',
        name: 'Test Every Job',
        enabled: 1,
        schedule_kind: 'every',
        schedule_value: '60000',
        schedule_tz: null,
        schedule_description: 'Every minute',
        payload_message: 'Hello',
        execution_mode: 'existing',
        agent_config: JSON.stringify({
          backend: 'gemini',
          name: 'Test Agent',
          isPreset: true,
        }),
        conversation_id: 'conv-1',
        conversation_title: 'Test Conversation',
        agent_type: 'gemini',
        created_by: 'user',
        created_at: 1000,
        updated_at: 2000,
        next_run_at: 3000,
        last_run_at: 4000,
        last_status: 'ok',
        last_error: null,
        run_count: 5,
        retry_count: 0,
        max_retries: 3,
      });

      const retrieved = await cronStore.getById('job-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('job-1');
      expect(retrieved!.name).toBe('Test Every Job');
      expect(retrieved!.enabled).toBe(true);
      expect(retrieved!.schedule).toEqual({
        kind: 'every',
        everyMs: 60000,
        description: 'Every minute',
      });
      expect(retrieved!.target.payload.text).toBe('Hello');
      expect(retrieved!.target.executionMode).toBe('existing');
      expect(retrieved!.metadata.agentConfig).toEqual({
        backend: 'gemini',
        name: 'Test Agent',
        isPreset: true,
      });
      expect(retrieved!.state.lastStatus).toBe('ok');
    });

    it('correctly converts "cron" schedule kind with timezone', async () => {
      const job: CronJob = {
        id: 'job-2',
        name: 'Test Cron Job',
        enabled: false,
        schedule: {
          kind: 'cron',
          expr: '0 0 * * *',
          tz: 'America/New_York',
          description: 'Daily at midnight EST',
        },
        target: {
          payload: { kind: 'message', text: 'Daily report' },
          executionMode: 'new_conversation',
        },
        metadata: {
          conversationId: 'conv-2',
          agentType: 'claude',
          createdBy: 'agent',
          createdAt: 5000,
          updatedAt: 6000,
        },
        state: {
          runCount: 0,
          retryCount: 0,
          maxRetries: 5,
        },
      };

      mockPrepareInstance.run.mockImplementation(() => ({ changes: 1 }));
      await cronStore.insert(job);

      const runArgs = mockPrepareInstance.run.mock.calls[0];
      expect(runArgs[2]).toBe(0); // enabled (false -> 0)
      expect(runArgs[3]).toBe('cron'); // schedule_kind
      expect(runArgs[4]).toBe('0 0 * * *'); // schedule_value
      expect(runArgs[5]).toBe('America/New_York'); // schedule_tz
      expect(runArgs[8]).toBe('new_conversation'); // execution_mode
      expect(runArgs[9]).toBeNull(); // agent_config (undefined)

      // Test retrieval
      mockPrepareInstance.get.mockReturnValue({
        id: 'job-2',
        name: 'Test Cron Job',
        enabled: 0,
        schedule_kind: 'cron',
        schedule_value: '0 0 * * *',
        schedule_tz: 'America/New_York',
        schedule_description: 'Daily at midnight EST',
        payload_message: 'Daily report',
        execution_mode: 'new_conversation',
        agent_config: null,
        conversation_id: 'conv-2',
        conversation_title: null,
        agent_type: 'claude',
        created_by: 'agent',
        created_at: 5000,
        updated_at: 6000,
        next_run_at: null,
        last_run_at: null,
        last_status: null,
        last_error: null,
        run_count: 0,
        retry_count: 0,
        max_retries: 5,
      });

      const retrieved = await cronStore.getById('job-2');
      expect(retrieved).toBeDefined();
      expect(retrieved!.enabled).toBe(false); // 0 -> false
      expect(retrieved!.schedule).toEqual({
        kind: 'cron',
        expr: '0 0 * * *',
        tz: 'America/New_York',
        description: 'Daily at midnight EST',
      });
      expect(retrieved!.metadata.agentConfig).toBeUndefined();
      expect(retrieved!.state.nextRunAtMs).toBeUndefined();
      // Note: lastStatus is not converted from null to undefined in rowToJob (line 181)
      expect(retrieved!.state.lastStatus).toBeNull();
    });

    it('correctly converts "at" schedule kind', async () => {
      const job: CronJob = {
        id: 'job-3',
        name: 'Test At Job',
        enabled: true,
        schedule: {
          kind: 'at',
          atMs: 1735689600000,
          description: 'Once on Jan 1, 2025',
        },
        target: {
          payload: { kind: 'message', text: 'New year message' },
        },
        metadata: {
          conversationId: 'conv-3',
          agentType: 'gemini',
          createdBy: 'user',
          createdAt: 7000,
          updatedAt: 8000,
        },
        state: {
          runCount: 0,
          retryCount: 0,
          maxRetries: 0,
        },
      };

      mockPrepareInstance.run.mockImplementation(() => ({ changes: 1 }));
      await cronStore.insert(job);

      const runArgs = mockPrepareInstance.run.mock.calls[0];
      expect(runArgs[3]).toBe('at'); // schedule_kind
      expect(runArgs[4]).toBe('1735689600000'); // schedule_value
      expect(runArgs[5]).toBeNull(); // schedule_tz
      expect(runArgs[8]).toBe('existing'); // execution_mode (default)

      // Test retrieval
      mockPrepareInstance.get.mockReturnValue({
        id: 'job-3',
        name: 'Test At Job',
        enabled: 1,
        schedule_kind: 'at',
        schedule_value: '1735689600000',
        schedule_tz: null,
        schedule_description: 'Once on Jan 1, 2025',
        payload_message: 'New year message',
        execution_mode: 'existing',
        agent_config: null,
        conversation_id: 'conv-3',
        conversation_title: null,
        agent_type: 'gemini',
        created_by: 'user',
        created_at: 7000,
        updated_at: 8000,
        next_run_at: null,
        last_run_at: null,
        last_status: null,
        last_error: null,
        run_count: 0,
        retry_count: 0,
        max_retries: 0,
      });

      const retrieved = await cronStore.getById('job-3');
      expect(retrieved).toBeDefined();
      expect(retrieved!.schedule).toEqual({
        kind: 'at',
        atMs: 1735689600000,
        description: 'Once on Jan 1, 2025',
      });
    });

    it('correctly handles enabled boolean mapping', async () => {
      // Test enabled: true -> 1
      mockPrepareInstance.get.mockReturnValue({
        id: 'job-enabled',
        name: 'Enabled Job',
        enabled: 1,
        schedule_kind: 'every',
        schedule_value: '1000',
        schedule_tz: null,
        schedule_description: 'Test',
        payload_message: 'Test',
        execution_mode: 'existing',
        agent_config: null,
        conversation_id: 'conv-1',
        conversation_title: null,
        agent_type: 'gemini',
        created_by: 'user',
        created_at: 1000,
        updated_at: 1000,
        next_run_at: null,
        last_run_at: null,
        last_status: null,
        last_error: null,
        run_count: 0,
        retry_count: 0,
        max_retries: 0,
      });

      const enabled = await cronStore.getById('job-enabled');
      expect(enabled!.enabled).toBe(true);

      // Test enabled: false -> 0
      mockPrepareInstance.get.mockReturnValue({
        ...mockPrepareInstance.get.mock.results[0].value,
        id: 'job-disabled',
        enabled: 0,
      });

      const disabled = await cronStore.getById('job-disabled');
      expect(disabled!.enabled).toBe(false);
    });

    it('correctly parses agent_config JSON and handles null', async () => {
      // Test with valid JSON
      mockPrepareInstance.get.mockReturnValue({
        id: 'job-with-config',
        name: 'Job',
        enabled: 1,
        schedule_kind: 'every',
        schedule_value: '1000',
        schedule_tz: null,
        schedule_description: 'Test',
        payload_message: 'Test',
        execution_mode: 'existing',
        agent_config: JSON.stringify({
          backend: 'claude',
          name: 'Custom Agent',
          cliPath: '/path/to/cli',
        }),
        conversation_id: 'conv-1',
        conversation_title: null,
        agent_type: 'gemini',
        created_by: 'user',
        created_at: 1000,
        updated_at: 1000,
        next_run_at: null,
        last_run_at: null,
        last_status: null,
        last_error: null,
        run_count: 0,
        retry_count: 0,
        max_retries: 0,
      });

      const withConfig = await cronStore.getById('job-with-config');
      expect(withConfig!.metadata.agentConfig).toEqual({
        backend: 'claude',
        name: 'Custom Agent',
        cliPath: '/path/to/cli',
      });

      // Test with null
      mockPrepareInstance.get.mockReturnValue({
        ...mockPrepareInstance.get.mock.results[0].value,
        id: 'job-without-config',
        agent_config: null,
      });

      const withoutConfig = await cronStore.getById('job-without-config');
      expect(withoutConfig!.metadata.agentConfig).toBeUndefined();
    });
  });

  describe('CRUD operations', () => {
    it('insert creates a new cron job', async () => {
      const job: CronJob = {
        id: 'new-job',
        name: 'New Job',
        enabled: true,
        schedule: { kind: 'every', everyMs: 5000, description: 'Every 5s' },
        target: { payload: { kind: 'message', text: 'Test' } },
        metadata: {
          conversationId: 'conv-1',
          agentType: 'gemini',
          createdBy: 'user',
          createdAt: 1000,
          updatedAt: 1000,
        },
        state: { runCount: 0, retryCount: 0, maxRetries: 3 },
      };

      mockPrepareInstance.run.mockImplementation(() => ({ changes: 1 }));
      await cronStore.insert(job);

      expect(mockDriver.prepare).toHaveBeenCalled();
      expect(mockPrepareInstance.run).toHaveBeenCalled();

      const sql = mockDriver.prepare.mock.calls[0][0];
      expect(sql).toContain('INSERT INTO cron_jobs');
    });

    it('getById returns job when found', async () => {
      mockPrepareInstance.get.mockReturnValue({
        id: 'found-job',
        name: 'Found Job',
        enabled: 1,
        schedule_kind: 'every',
        schedule_value: '1000',
        schedule_tz: null,
        schedule_description: 'Test',
        payload_message: 'Test',
        execution_mode: 'existing',
        agent_config: null,
        conversation_id: 'conv-1',
        conversation_title: null,
        agent_type: 'gemini',
        created_by: 'user',
        created_at: 1000,
        updated_at: 1000,
        next_run_at: null,
        last_run_at: null,
        last_status: null,
        last_error: null,
        run_count: 0,
        retry_count: 0,
        max_retries: 0,
      });

      const job = await cronStore.getById('found-job');

      expect(mockDriver.prepare).toHaveBeenCalledWith('SELECT * FROM cron_jobs WHERE id = ?');
      expect(mockPrepareInstance.get).toHaveBeenCalledWith('found-job');
      expect(job).toBeDefined();
      expect(job!.id).toBe('found-job');
    });

    it('getById returns null when not found', async () => {
      mockPrepareInstance.get.mockReturnValue(undefined);

      const job = await cronStore.getById('missing-job');

      expect(job).toBeNull();
    });

    it('update modifies an existing job', async () => {
      // Mock getById to return existing job
      mockPrepareInstance.get.mockReturnValue({
        id: 'update-job',
        name: 'Old Name',
        enabled: 1,
        schedule_kind: 'every',
        schedule_value: '1000',
        schedule_tz: null,
        schedule_description: 'Old desc',
        payload_message: 'Old message',
        execution_mode: 'existing',
        agent_config: null,
        conversation_id: 'conv-1',
        conversation_title: null,
        agent_type: 'gemini',
        created_by: 'user',
        created_at: 1000,
        updated_at: 1000,
        next_run_at: null,
        last_run_at: null,
        last_status: null,
        last_error: null,
        run_count: 0,
        retry_count: 0,
        max_retries: 0,
      });

      mockPrepareInstance.run.mockImplementation(() => ({ changes: 1 }));

      await cronStore.update('update-job', {
        name: 'New Name',
        enabled: false,
      });

      expect(mockDriver.prepare).toHaveBeenCalledWith('SELECT * FROM cron_jobs WHERE id = ?');

      const updateSql = mockDriver.prepare.mock.calls[1][0];
      expect(updateSql).toContain('UPDATE cron_jobs SET');

      const updateArgs = mockPrepareInstance.run.mock.calls[0];
      expect(updateArgs[0]).toBe('New Name'); // name
      expect(updateArgs[1]).toBe(0); // enabled (false -> 0)
      expect(updateArgs[updateArgs.length - 1]).toBe('update-job'); // WHERE id = ?
    });

    it('update throws error when job not found', async () => {
      mockPrepareInstance.get.mockReturnValue(undefined);

      await expect(cronStore.update('missing-job', { name: 'New' })).rejects.toThrow('Cron job not found: missing-job');
    });

    it('update updates schedule correctly', async () => {
      mockPrepareInstance.get.mockReturnValue({
        id: 'update-schedule',
        name: 'Job',
        enabled: 1,
        schedule_kind: 'every',
        schedule_value: '1000',
        schedule_tz: null,
        schedule_description: 'Old',
        payload_message: 'Test',
        execution_mode: 'existing',
        agent_config: null,
        conversation_id: 'conv-1',
        conversation_title: null,
        agent_type: 'gemini',
        created_by: 'user',
        created_at: 1000,
        updated_at: 1000,
        next_run_at: null,
        last_run_at: null,
        last_status: null,
        last_error: null,
        run_count: 0,
        retry_count: 0,
        max_retries: 0,
      });

      mockPrepareInstance.run.mockImplementation(() => ({ changes: 1 }));

      await cronStore.update('update-schedule', {
        schedule: {
          kind: 'cron',
          expr: '0 * * * *',
          tz: 'UTC',
          description: 'Hourly',
        },
      });

      const updateArgs = mockPrepareInstance.run.mock.calls[0];
      expect(updateArgs[2]).toBe('cron'); // schedule_kind
      expect(updateArgs[3]).toBe('0 * * * *'); // schedule_value
      expect(updateArgs[4]).toBe('UTC'); // schedule_tz
      expect(updateArgs[5]).toBe('Hourly'); // schedule_description
    });

    it('delete removes a job', async () => {
      mockPrepareInstance.run.mockImplementation(() => ({ changes: 1 }));

      await cronStore.delete('delete-job');

      expect(mockDriver.prepare).toHaveBeenCalledWith('DELETE FROM cron_jobs WHERE id = ?');
      expect(mockPrepareInstance.run).toHaveBeenCalledWith('delete-job');
    });

    it('listAll returns all jobs ordered by creation', async () => {
      mockPrepareInstance.all.mockReturnValue([
        {
          id: 'job-1',
          name: 'Job 1',
          enabled: 1,
          schedule_kind: 'every',
          schedule_value: '1000',
          schedule_tz: null,
          schedule_description: 'Test 1',
          payload_message: 'Test',
          execution_mode: 'existing',
          agent_config: null,
          conversation_id: 'conv-1',
          conversation_title: null,
          agent_type: 'gemini',
          created_by: 'user',
          created_at: 2000,
          updated_at: 2000,
          next_run_at: null,
          last_run_at: null,
          last_status: null,
          last_error: null,
          run_count: 0,
          retry_count: 0,
          max_retries: 0,
        },
        {
          id: 'job-2',
          name: 'Job 2',
          enabled: 0,
          schedule_kind: 'cron',
          schedule_value: '0 0 * * *',
          schedule_tz: null,
          schedule_description: 'Test 2',
          payload_message: 'Test',
          execution_mode: 'existing',
          agent_config: null,
          conversation_id: 'conv-2',
          conversation_title: null,
          agent_type: 'claude',
          created_by: 'agent',
          created_at: 1000,
          updated_at: 1000,
          next_run_at: null,
          last_run_at: null,
          last_status: null,
          last_error: null,
          run_count: 0,
          retry_count: 0,
          max_retries: 0,
        },
      ]);

      const jobs = await cronStore.listAll();

      expect(mockDriver.prepare).toHaveBeenCalledWith('SELECT * FROM cron_jobs ORDER BY created_at DESC');
      expect(jobs).toHaveLength(2);
      expect(jobs[0].id).toBe('job-1');
      expect(jobs[1].id).toBe('job-2');
    });

    it('listByConversation returns jobs for specific conversation', async () => {
      mockPrepareInstance.all.mockReturnValue([
        {
          id: 'conv-job-1',
          name: 'Conv Job 1',
          enabled: 1,
          schedule_kind: 'every',
          schedule_value: '1000',
          schedule_tz: null,
          schedule_description: 'Test',
          payload_message: 'Test',
          execution_mode: 'existing',
          agent_config: null,
          conversation_id: 'target-conv',
          conversation_title: null,
          agent_type: 'gemini',
          created_by: 'user',
          created_at: 1000,
          updated_at: 1000,
          next_run_at: null,
          last_run_at: null,
          last_status: null,
          last_error: null,
          run_count: 0,
          retry_count: 0,
          max_retries: 0,
        },
      ]);

      const jobs = await cronStore.listByConversation('target-conv');

      expect(mockDriver.prepare).toHaveBeenCalledWith(
        'SELECT * FROM cron_jobs WHERE conversation_id = ? ORDER BY created_at DESC'
      );
      expect(mockPrepareInstance.all).toHaveBeenCalledWith('target-conv');
      expect(jobs).toHaveLength(1);
      expect(jobs[0].metadata.conversationId).toBe('target-conv');
    });

    it('listEnabled returns only enabled jobs ordered by next run', async () => {
      mockPrepareInstance.all.mockReturnValue([
        {
          id: 'enabled-1',
          name: 'Enabled 1',
          enabled: 1,
          schedule_kind: 'every',
          schedule_value: '1000',
          schedule_tz: null,
          schedule_description: 'Test',
          payload_message: 'Test',
          execution_mode: 'existing',
          agent_config: null,
          conversation_id: 'conv-1',
          conversation_title: null,
          agent_type: 'gemini',
          created_by: 'user',
          created_at: 1000,
          updated_at: 1000,
          next_run_at: 5000,
          last_run_at: null,
          last_status: null,
          last_error: null,
          run_count: 0,
          retry_count: 0,
          max_retries: 0,
        },
      ]);

      const jobs = await cronStore.listEnabled();

      expect(mockDriver.prepare).toHaveBeenCalledWith(
        'SELECT * FROM cron_jobs WHERE enabled = 1 ORDER BY next_run_at ASC'
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0].enabled).toBe(true);
    });

    it('deleteByConversation removes all jobs for a conversation', async () => {
      mockPrepareInstance.run.mockImplementation(() => ({ changes: 3 }));

      const deleted = await cronStore.deleteByConversation('conv-to-delete');

      expect(mockDriver.prepare).toHaveBeenCalledWith('DELETE FROM cron_jobs WHERE conversation_id = ?');
      expect(mockPrepareInstance.run).toHaveBeenCalledWith('conv-to-delete');
      expect(deleted).toBe(3);
    });
  });
});
