import type { TChatConversation } from '@/common/config/storage';
import { ConversationCommandExecutionService } from '@/process/bridge/services/ConversationCommandExecutionService';
import { describe, expect, it, vi } from 'vitest';

const createConversation = (status?: TChatConversation['status']): TChatConversation =>
  ({
    id: 'conversation-1',
    title: 'Test Conversation',
    type: 'codex',
    source: 'aionui',
    status,
    createdAt: Date.now(),
    modifyTime: Date.now(),
    extra: {},
  }) as unknown as TChatConversation;

describe('ConversationCommandExecutionService', () => {
  it('starts queued execution when both runtime and persisted status are idle', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const service = new ConversationCommandExecutionService(
      {
        getConversation: vi.fn().mockResolvedValue(createConversation('finished')),
      } as never,
      {
        getTask: vi.fn().mockReturnValue(undefined),
      } as never,
      dispatch
    );

    await expect(
      service.execute({
        conversationId: 'conversation-1',
        input: 'echo hello',
        files: [],
      })
    ).resolves.toEqual({
      started: true,
      reason: 'started',
    });
    expect(dispatch).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      input: 'echo hello',
      files: [],
    });
  });

  it('does not start when the runtime task is already busy', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const service = new ConversationCommandExecutionService(
      {
        getConversation: vi.fn().mockResolvedValue(createConversation('finished')),
      } as never,
      {
        getTask: vi.fn().mockReturnValue({ status: 'running' }),
      } as never,
      dispatch
    );

    await expect(
      service.execute({
        conversationId: 'conversation-1',
        input: 'echo hello',
        files: [],
      })
    ).resolves.toEqual({
      started: false,
      reason: 'busy',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('prefers the in-memory runtime status over stale persisted status when a task exists', async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const getConversation = vi.fn().mockResolvedValue(createConversation('running'));
    const service = new ConversationCommandExecutionService(
      {
        getConversation,
      } as never,
      {
        getTask: vi.fn().mockReturnValue({ status: 'finished' }),
      } as never,
      dispatch
    );

    await expect(
      service.execute({
        conversationId: 'conversation-1',
        input: 'echo hello',
        files: [],
      })
    ).resolves.toEqual({
      started: true,
      reason: 'started',
    });
    expect(getConversation).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      input: 'echo hello',
      files: [],
    });
  });

  it('does not start when a previous execution attempt is still in flight', async () => {
    let resolveDispatch: (() => void) | undefined;
    const dispatch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDispatch = resolve;
        })
    );
    const service = new ConversationCommandExecutionService(
      {
        getConversation: vi.fn().mockResolvedValue(createConversation('finished')),
      } as never,
      {
        getTask: vi.fn().mockReturnValue(undefined),
      } as never,
      dispatch
    );

    const firstExecution = service.execute({
      conversationId: 'conversation-1',
      input: 'echo hello',
      files: [],
    });

    await Promise.resolve();

    await expect(
      service.execute({
        conversationId: 'conversation-1',
        input: 'echo again',
        files: [],
      })
    ).resolves.toEqual({
      started: false,
      reason: 'locked',
    });

    resolveDispatch?.();
    await expect(firstExecution).resolves.toEqual({
      started: true,
      reason: 'started',
    });
  });
});
