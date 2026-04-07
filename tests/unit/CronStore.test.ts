/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CronJob } from '@process/services/cron/CronStore';

// Mock electron
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/test') } }));

// Mock database with rawSql() API (migrated from getDriver().prepare() pattern)
const mockRawSql = vi.hoisted(() => vi.fn());

const mockDb = vi.hoisted(() => ({
  rawSql: mockRawSql,
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => Promise.resolve(mockDb)),
}));

// Helper to capture rawSql calls by SQL pattern
function findRawSqlCall(pattern: string) {
  return mockRawSql.mock.calls.find((call: unknown[]) => (call[0] as string).includes(pattern));
}

function getLastRawSqlCall() {
  return mockRawSql.mock.calls[mockRawSql.mock.calls.length - 1];
}

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

      // Mock insert (run op) then getById (get op)
      mockRawSql.mockResolvedValueOnce({ changes: 1 });
      await cronStore.insert(job);

      // Verify the INSERT was called
      const insertCall = findRawSqlCall('INSERT INTO cron_jobs');
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toBe('run');

      // Verify the values passed as params array (3rd argument)
      const params = insertCall![2] as unknown[];
      expect(params[0]).toBe('job-1'); // id
      expect(params[1]).toBe('Test Every Job'); // name
      expect(params[2]).toBe(1); // enabled (true -> 1)
      expect(params[3]).toBe('every'); // schedule_kind
      expect(params[4]).toBe('60000'); // schedule_value
      expect(params[5]).toBeNull(); // schedule_tz
      expect(params[6]).toBe('Every minute'); // schedule_description
      expect(params[7]).toBe('Hello'); // payload_message
      expect(params[8]).toBe('existing'); // execution_mode
      expect(params[9]).toBe(JSON.stringify(job.metadata.agentConfig)); // agent_config
      expect(params[10]).toBe('conv-1'); // conversation_id
      expect(params[11]).toBe('Test Conversation'); // conversation_title
      expect(params[12]).toBe('gemini'); // agent_type
      expect(params[13]).toBe('user'); // created_by
      expect(params[14]).toBe(1000); // created_at
      expect(params[15]).toBe(2000); // updated_at
      expect(params[16]).toBe(3000); // next_run_at
      expect(params[17]).toBe(4000); // last_run_at
      expect(params[18]).toBe('ok'); // last_status
      expect(params[19]).toBeNull(); // last_error (undefined -> null in jobToRow)
      expect(params[20]).toBe(5); // run_count
      expect(params[21]).toBe(0); // retry_count
      expect(params[22]).toBe(3); // max_retries

      // Now test retrieval (round-trip)
      mockRawSql.mockResolvedValueOnce({
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

      mockRawSql.mockResolvedValueOnce({ changes: 1 });
      await cronStore.insert(job);

      const insertCall = findRawSqlCall('INSERT INTO cron_jobs');
      const params = insertCall![2] as unknown[];
      expect(params[2]).toBe(0); // enabled (false -> 0)
      expect(params[3]).toBe('cron'); // schedule_kind
      expect(params[4]).toBe('0 0 * * *'); // schedule_value
      expect(params[5]).toBe('America/New_York'); // schedule_tz
      expect(params[8]).toBe('new_conversation'); // execution_mode
      expect(params[9]).toBeNull(); // agent_config (undefined)

      // Test retrieval
      mockRawSql.mockResolvedValueOnce({
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
      // Note: lastStatus is converted from null to undefined in rowToJob via cast
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

      mockRawSql.mockResolvedValueOnce({ changes: 1 });
      await cronStore.insert(job);

      const insertCall = findRawSqlCall('INSERT INTO cron_jobs');
      const params = insertCall![2] as unknown[];
      expect(params[3]).toBe('at'); // schedule_kind
      expect(params[4]).toBe('1735689600000'); // schedule_value
      expect(params[5]).toBeNull(); // schedule_tz
      expect(params[8]).toBe('existing'); // execution_mode (default)

      // Test retrieval
      mockRawSql.mockResolvedValueOnce({
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
      const enabledRow = {
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
      };

      mockRawSql.mockResolvedValueOnce(enabledRow);

      const enabled = await cronStore.getById('job-enabled');
      expect(enabled!.enabled).toBe(true);

      // Test enabled: false -> 0
      mockRawSql.mockResolvedValueOnce({
        ...enabledRow,
        id: 'job-disabled',
        enabled: 0,
      });

      const disabled = await cronStore.getById('job-disabled');
      expect(disabled!.enabled).toBe(false);
    });

    it('correctly parses agent_config JSON and handles null', async () => {
      const baseRow = {
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
      };

      // Test with valid JSON
      mockRawSql.mockResolvedValueOnce(baseRow);

      const withConfig = await cronStore.getById('job-with-config');
      expect(withConfig!.metadata.agentConfig).toEqual({
        backend: 'claude',
        name: 'Custom Agent',
        cliPath: '/path/to/cli',
      });

      // Test with null
      mockRawSql.mockResolvedValueOnce({
        ...baseRow,
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

      mockRawSql.mockResolvedValueOnce({ changes: 1 });
      await cronStore.insert(job);

      expect(mockRawSql).toHaveBeenCalled();

      const insertCall = findRawSqlCall('INSERT INTO cron_jobs');
      expect(insertCall).toBeDefined();
      expect(insertCall![0]).toContain('INSERT INTO cron_jobs');
      expect(insertCall![1]).toBe('run');
    });

    it('getById returns job when found', async () => {
      mockRawSql.mockResolvedValueOnce({
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

      const call = findRawSqlCall('SELECT * FROM cron_jobs WHERE id');
      expect(call).toBeDefined();
      expect(call![1]).toBe('get');
      expect(call![2]).toEqual(['found-job']);
      expect(job).toBeDefined();
      expect(job!.id).toBe('found-job');
    });

    it('getById returns null when not found', async () => {
      mockRawSql.mockResolvedValueOnce(undefined);

      const job = await cronStore.getById('missing-job');

      expect(job).toBeNull();
    });

    it('update modifies an existing job', async () => {
      // Mock getById (first rawSql call) to return existing job
      mockRawSql.mockResolvedValueOnce({
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

      // Mock UPDATE (second rawSql call)
      mockRawSql.mockResolvedValueOnce({ changes: 1 });

      await cronStore.update('update-job', {
        name: 'New Name',
        enabled: false,
      });

      // Verify getById was called first
      const getCall = findRawSqlCall('SELECT * FROM cron_jobs WHERE id');
      expect(getCall).toBeDefined();

      // Verify the UPDATE call
      const updateCall = findRawSqlCall('UPDATE cron_jobs SET');
      expect(updateCall).toBeDefined();

      // UPDATE params: name, enabled, schedule_kind, schedule_value, schedule_tz,
      // schedule_description, payload_message, execution_mode, agent_config,
      // conversation_id, conversation_title, agent_type, updated_at,
      // next_run_at, last_run_at, last_status, last_error,
      // run_count, retry_count, max_retries, jobId
      const updateParams = updateCall![2] as unknown[];
      expect(updateParams[0]).toBe('New Name'); // name
      expect(updateParams[1]).toBe(0); // enabled (false -> 0)
      expect(updateParams[updateParams.length - 1]).toBe('update-job'); // WHERE id = ?
    });

    it('update throws error when job not found', async () => {
      mockRawSql.mockResolvedValueOnce(undefined);

      await expect(cronStore.update('missing-job', { name: 'New' })).rejects.toThrow('Cron job not found: missing-job');
    });

    it('update updates schedule correctly', async () => {
      // Mock getById
      mockRawSql.mockResolvedValueOnce({
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

      // Mock UPDATE
      mockRawSql.mockResolvedValueOnce({ changes: 1 });

      await cronStore.update('update-schedule', {
        schedule: {
          kind: 'cron',
          expr: '0 * * * *',
          tz: 'UTC',
          description: 'Hourly',
        },
      });

      const updateCall = findRawSqlCall('UPDATE cron_jobs SET');
      const updateParams = updateCall![2] as unknown[];
      // UPDATE params order: name(0), enabled(1), schedule_kind(2), schedule_value(3),
      // schedule_tz(4), schedule_description(5), ...
      expect(updateParams[2]).toBe('cron'); // schedule_kind
      expect(updateParams[3]).toBe('0 * * * *'); // schedule_value
      expect(updateParams[4]).toBe('UTC'); // schedule_tz
      expect(updateParams[5]).toBe('Hourly'); // schedule_description
    });

    it('delete removes a job', async () => {
      mockRawSql.mockResolvedValueOnce({ changes: 1 });

      await cronStore.delete('delete-job');

      const call = findRawSqlCall('DELETE FROM cron_jobs WHERE id');
      expect(call).toBeDefined();
      expect(call![1]).toBe('run');
      expect(call![2]).toEqual(['delete-job']);
    });

    it('listAll returns all jobs ordered by creation', async () => {
      mockRawSql.mockResolvedValueOnce([
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

      const call = findRawSqlCall('SELECT * FROM cron_jobs ORDER BY created_at DESC');
      expect(call).toBeDefined();
      expect(call![1]).toBe('all');
      expect(call![2]).toEqual([]);
      expect(jobs).toHaveLength(2);
      expect(jobs[0].id).toBe('job-1');
      expect(jobs[1].id).toBe('job-2');
    });

    it('listByConversation returns jobs for specific conversation', async () => {
      mockRawSql.mockResolvedValueOnce([
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

      const call = findRawSqlCall('SELECT * FROM cron_jobs WHERE conversation_id');
      expect(call).toBeDefined();
      expect(call![0]).toContain('ORDER BY created_at DESC');
      expect(call![1]).toBe('all');
      expect(call![2]).toEqual(['target-conv']);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].metadata.conversationId).toBe('target-conv');
    });

    it('listEnabled returns only enabled jobs ordered by next run', async () => {
      mockRawSql.mockResolvedValueOnce([
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

      const call = findRawSqlCall('SELECT * FROM cron_jobs WHERE enabled = 1 ORDER BY next_run_at ASC');
      expect(call).toBeDefined();
      expect(call![1]).toBe('all');
      expect(call![2]).toEqual([]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].enabled).toBe(true);
    });

    it('deleteByConversation removes all jobs for a conversation', async () => {
      mockRawSql.mockResolvedValueOnce({ changes: 3 });

      const deleted = await cronStore.deleteByConversation('conv-to-delete');

      const call = findRawSqlCall('DELETE FROM cron_jobs WHERE conversation_id');
      expect(call).toBeDefined();
      expect(call![1]).toBe('run');
      expect(call![2]).toEqual(['conv-to-delete']);
      expect(deleted).toBe(3);
    });
  });
});
