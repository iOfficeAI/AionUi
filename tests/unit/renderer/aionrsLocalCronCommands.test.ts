/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConversationGet = vi.fn();
const mockAddJob = vi.fn();
const mockGetJob = vi.fn();
const mockUpdateJob = vi.fn();
const mockListJobsByConversation = vi.fn();
const mockRemoveJob = vi.fn();

vi.mock('@/common/adapter/ipcBridge', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: (...args: unknown[]) => mockConversationGet(...args) },
    },
    cron: {
      addJob: { invoke: (...args: unknown[]) => mockAddJob(...args) },
      getJob: { invoke: (...args: unknown[]) => mockGetJob(...args) },
      updateJob: { invoke: (...args: unknown[]) => mockUpdateJob(...args) },
      listJobsByConversation: { invoke: (...args: unknown[]) => mockListJobsByConversation(...args) },
      removeJob: { invoke: (...args: unknown[]) => mockRemoveJob(...args) },
    },
  },
}));

import { processLocalCronResponse } from '@/renderer/pages/conversation/platforms/aionrs/localCronCommands';

describe('processLocalCronResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationGet.mockResolvedValue({
      id: 'conv-1',
      name: 'Cron conversation',
      extra: { workspace: '/tmp/workspace' },
    });
  });

  it('creates cron jobs from CRON_CREATE blocks and strips tags from display content', async () => {
    mockAddJob.mockResolvedValue({ id: 'job-1', name: 'Daily review' });

    const result = await processLocalCronResponse(
      'conv-1',
      [
        'Done.',
        '[CRON_CREATE]',
        'name: Daily review',
        'schedule: 0 9 * * *',
        'schedule_description: Every day at 9:00 AM',
        'message: Review pull requests',
        '[/CRON_CREATE]',
      ].join('\n')
    );

    expect(mockAddJob).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Daily review',
        conversation_id: 'conv-1',
        created_by: 'agent',
        execution_mode: 'existing',
        agent_type: 'aionrs',
        agent_config: expect.objectContaining({
          backend: 'aionrs',
          mode: 'yolo',
          workspace: '/tmp/workspace',
        }),
      })
    );
    expect(result.displayContent).toBe('Done.');
    expect(result.systemResponses).toEqual(['✅ Scheduled task created: "Daily review" (ID: job-1)']);
  });

  it('updates existing cron jobs from CRON_UPDATE blocks', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-42',
      name: 'Old task',
      target: { payload: { kind: 'message', text: 'old prompt' }, execution_mode: 'existing' },
      metadata: { conversation_id: 'conv-1', agent_config: { backend: 'aionrs', mode: 'default' } },
    });
    mockUpdateJob.mockResolvedValue({ id: 'job-42', name: 'Updated task' });

    const result = await processLocalCronResponse(
      'conv-1',
      [
        'Updated it.',
        '[CRON_UPDATE: job-42]',
        'name: Updated task',
        'schedule: 0 10 * * *',
        'schedule_description: Daily at 10:00 AM',
        'message: New instructions',
        '[/CRON_UPDATE]',
      ].join('\n')
    );

    expect(mockUpdateJob).toHaveBeenCalledWith({
      job_id: 'job-42',
      updates: expect.objectContaining({
        name: 'Updated task',
        schedule: {
          kind: 'cron',
          expr: '0 10 * * *',
          description: 'Daily at 10:00 AM',
        },
        target: {
          payload: { kind: 'message', text: 'New instructions' },
          execution_mode: 'existing',
        },
      }),
    });
    expect(result.displayContent).toBe('Updated it.');
    expect(result.systemResponses).toEqual(['✅ Scheduled task updated: "Updated task" (ID: job-42)']);
  });

  it('formats job lists for CRON_LIST', async () => {
    mockListJobsByConversation.mockResolvedValue([
      {
        id: 'job-1',
        name: 'Morning check',
        enabled: true,
        schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 9:00 AM' },
      },
    ]);

    const result = await processLocalCronResponse('conv-1', 'Let me check.\n[CRON_LIST]');

    expect(mockListJobsByConversation).toHaveBeenCalledWith({ conversation_id: 'conv-1' });
    expect(result.displayContent).toBe('Let me check.');
    expect(result.systemResponses).toEqual(['📋 Scheduled tasks:\n- [✓] Morning check (0 9 * * *) - ID: job-1']);
  });

  it('deletes cron jobs for CRON_DELETE commands', async () => {
    mockRemoveJob.mockResolvedValue(undefined);

    const result = await processLocalCronResponse('conv-1', 'Deleting it now.\n[CRON_DELETE: job-9]');

    expect(mockRemoveJob).toHaveBeenCalledWith({ job_id: 'job-9' });
    expect(result.displayContent).toBe('Deleting it now.');
    expect(result.systemResponses).toEqual(['🗑️ Scheduled task deleted: job-9']);
  });
});
