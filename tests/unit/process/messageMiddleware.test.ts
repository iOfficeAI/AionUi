import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '../../../src/common/chat/chatLib';

const cronSingletonLoaded = vi.fn();
const getCronService = vi.fn();
const addJob = vi.fn();
const listJobsByConversation = vi.fn();
const removeJob = vi.fn();
const onJobCreatedEmit = vi.fn();
const onJobRemovedEmit = vi.fn();

const createFinishedTextMessage = (content: string): TMessage =>
  ({
    id: 'message-1',
    msg_id: 'message-1',
    type: 'text',
    conversation_id: 'session-1',
    position: 'left',
    status: 'finish',
    content: { content },
    createdAt: 1,
  }) as TMessage;

describe('MessageMiddleware', () => {
  beforeEach(() => {
    vi.resetModules();
    cronSingletonLoaded.mockReset();
    getCronService.mockReset();
    addJob.mockReset();
    listJobsByConversation.mockReset();
    removeJob.mockReset();
    onJobCreatedEmit.mockReset();
    onJobRemovedEmit.mockReset();

    vi.doMock('@/common', () => ({
      ipcBridge: {
        cron: {
          onJobCreated: { emit: onJobCreatedEmit },
          onJobRemoved: { emit: onJobRemovedEmit },
        },
      },
    }));

    vi.doMock('@process/services/cron/cronServiceAccess', () => ({
      getCronService,
    }));
  });

  it('does not load cronServiceSingleton during module evaluation and only resolves cron service for cron commands', async () => {
    addJob.mockResolvedValue({ id: 'job-1', name: 'Daily Summary' });
    getCronService.mockReturnValue({
      addJob,
      listJobsByConversation,
      removeJob,
    });

    vi.doMock('@process/services/cron/cronServiceSingleton', () => {
      cronSingletonLoaded();
      return {
        cronService: {
          addJob,
          listJobsByConversation,
          removeJob,
        },
      };
    });

    const { processAgentResponse } = await import('../../../src/process/task/MessageMiddleware');

    expect(cronSingletonLoaded).not.toHaveBeenCalled();
    expect(getCronService).not.toHaveBeenCalled();

    await processAgentResponse('session-1', 'acp', createFinishedTextMessage('plain response'));

    expect(cronSingletonLoaded).not.toHaveBeenCalled();
    expect(getCronService).not.toHaveBeenCalled();

    const result = await processAgentResponse(
      'session-1',
      'acp',
      createFinishedTextMessage(`[CRON_CREATE]
name: Daily Summary
schedule: 0 9 * * *
schedule_description: Every day at 9 AM
message: Send the daily summary
[/CRON_CREATE]`)
    );

    expect(cronSingletonLoaded).not.toHaveBeenCalled();
    expect(getCronService).toHaveBeenCalledTimes(1);
    expect(addJob).toHaveBeenCalledWith({
      name: 'Daily Summary',
      schedule: {
        kind: 'cron',
        expr: '0 9 * * *',
        description: 'Every day at 9 AM',
      },
      message: 'Send the daily summary',
      conversationId: 'session-1',
      agentType: 'acp',
      createdBy: 'agent',
    });
    expect(onJobCreatedEmit).toHaveBeenCalledWith({ id: 'job-1', name: 'Daily Summary' });
    expect(result.systemResponses).toEqual(['✅ Scheduled task created: "Daily Summary" (ID: job-1)']);
  });

  it('returns a system error response when cron execution fails', async () => {
    addJob.mockRejectedValue(new Error('db unavailable'));
    getCronService.mockReturnValue({
      addJob,
      listJobsByConversation,
      removeJob,
    });

    vi.doMock('@process/services/cron/cronServiceSingleton', () => {
      cronSingletonLoaded();
      return {
        cronService: {
          addJob,
          listJobsByConversation,
          removeJob,
        },
      };
    });

    const { processAgentResponse } = await import('../../../src/process/task/MessageMiddleware');

    const result = await processAgentResponse(
      'session-1',
      'gemini',
      createFinishedTextMessage(`[CRON_CREATE]
name: Retry Later
schedule: 0 12 * * *
schedule_description: Every day at noon
message: Retry later
[/CRON_CREATE]`)
    );

    expect(cronSingletonLoaded).not.toHaveBeenCalled();
    expect(getCronService).toHaveBeenCalledTimes(1);
    expect(result.systemResponses).toEqual(['❌ Error: db unavailable']);
    expect(onJobCreatedEmit).not.toHaveBeenCalled();
  });
});
