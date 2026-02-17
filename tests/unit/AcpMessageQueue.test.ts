/**
 * Unit tests for AcpMessageQueue
 */

// Mock uuid before importing the module
jest.mock('@/common/utils', () => ({
  uuid: () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
}));

import { AcpMessageQueue } from '../../src/process/task/AcpMessageQueue';

describe('AcpMessageQueue', () => {
  let queue: AcpMessageQueue;
  let sentMessages: Array<{ content: string; files?: string[]; msg_id?: string }>;
  let resolvers: Array<() => void>;

  beforeEach(() => {
    queue = new AcpMessageQueue();
    sentMessages = [];
    resolvers = [];

    // Set up a sender that captures messages and can be resolved manually.
    // Each resolve() simulates the agent acknowledging the message was sent.
    // The test must also call queue.onAgentFinished() to simulate the agent
    // completing its response turn.
    queue.setSender((data) => {
      sentMessages.push(data);
      return new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
    });
  });

  describe('enqueue', () => {
    it('should enqueue a message and return an ID', () => {
      const id = queue.enqueue({
        content: 'Hello',
        priority: 'normal',
        source: 'user',
      });
      expect(id).toBeTruthy();
      expect(queue.getStatus().queueLength).toBe(0); // Already started processing
      expect(sentMessages.length).toBe(1);
    });

    it('should queue messages when processing', () => {
      queue.enqueue({ content: 'First', priority: 'normal', source: 'user' });
      queue.enqueue({ content: 'Second', priority: 'normal', source: 'user' });

      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0].content).toBe('First');
      expect(queue.getStatus().queueLength).toBe(1);
    });

    it('should insert high-priority messages before normal ones', () => {
      queue.enqueue({ content: 'First', priority: 'normal', source: 'user' });
      queue.enqueue({ content: 'Normal', priority: 'normal', source: 'user' });
      queue.enqueue({ content: 'High', priority: 'high', source: 'hook' });

      // First was dequeued for processing, queue has: [High, Normal]
      const status = queue.getStatus();
      expect(status.messages[0].content).toBe('High');
      expect(status.messages[1].content).toBe('Normal');
    });
  });

  describe('processing', () => {
    it('should process next message after current finishes', async () => {
      queue.enqueue({ content: 'First', priority: 'normal', source: 'user' });
      queue.enqueue({ content: 'Second', priority: 'normal', source: 'user' });

      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0].content).toBe('First');

      // Resolve sender promise then signal agent turn finished
      resolvers[0]();
      queue.onAgentFinished();
      await new Promise((r) => setTimeout(r, 10));

      expect(sentMessages.length).toBe(2);
      expect(sentMessages[1].content).toBe('Second');
    });

    it('should emit drain when queue is empty', async () => {
      const events: string[] = [];
      queue.on((event) => events.push(event.type));

      queue.enqueue({ content: 'Only', priority: 'normal', source: 'user' });

      // Resolve the message then signal finish
      resolvers[0]();
      queue.onAgentFinished();
      await new Promise((r) => setTimeout(r, 10));

      expect(events).toContain('drain');
    });
  });

  describe('pause and resume', () => {
    it('should not process next message when paused', async () => {
      queue.enqueue({ content: 'First', priority: 'normal', source: 'user' });
      queue.enqueue({ content: 'Second', priority: 'normal', source: 'user' });

      queue.pause();

      // Resolve first message and signal finish
      resolvers[0]();
      queue.onAgentFinished();
      await new Promise((r) => setTimeout(r, 10));

      // Second should not have been sent
      expect(sentMessages.length).toBe(1);
      expect(queue.getStatus().status).toBe('paused');
    });

    it('should resume processing when resumed', async () => {
      queue.enqueue({ content: 'First', priority: 'normal', source: 'user' });
      queue.enqueue({ content: 'Second', priority: 'normal', source: 'user' });

      queue.pause();
      resolvers[0]();
      queue.onAgentFinished();
      await new Promise((r) => setTimeout(r, 10));

      expect(sentMessages.length).toBe(1);

      queue.resume();
      await new Promise((r) => setTimeout(r, 10));

      expect(sentMessages.length).toBe(2);
      expect(sentMessages[1].content).toBe('Second');
    });
  });

  describe('clear', () => {
    it('should remove all pending messages', () => {
      queue.enqueue({ content: 'First', priority: 'normal', source: 'user' });
      queue.enqueue({ content: 'Second', priority: 'normal', source: 'user' });
      queue.enqueue({ content: 'Third', priority: 'normal', source: 'user' });

      queue.clear();

      expect(queue.getStatus().queueLength).toBe(0);
      expect(queue.getStatus().status).toBe('idle');
    });
  });

  describe('remove', () => {
    it('should remove a specific message by ID', () => {
      queue.enqueue({ content: 'First', priority: 'normal', source: 'user' });
      const id = queue.enqueue({ content: 'ToRemove', priority: 'normal', source: 'user' });
      queue.enqueue({ content: 'Third', priority: 'normal', source: 'user' });

      const removed = queue.remove(id);
      expect(removed).toBe(true);
      expect(queue.getStatus().queueLength).toBe(1);
    });

    it('should return false for non-existent ID', () => {
      expect(queue.remove('non-existent')).toBe(false);
    });
  });

  describe('onAgentFinished', () => {
    it('should process next message when called and queue has items', async () => {
      // Sender resolves immediately; test drives timing via onAgentFinished
      const syncSender = jest.fn().mockResolvedValue(undefined);
      queue.setSender(syncSender);

      // First enqueue triggers auto-processing
      queue.enqueue({ content: 'First', priority: 'normal', source: 'user' });
      await new Promise((r) => setTimeout(r, 5));

      // Signal first turn finished so queue processes second message
      queue.onAgentFinished();

      // Now enqueue while idle - but since first completed, queue is idle again
      queue.enqueue({ content: 'Second', priority: 'normal', source: 'hook' });
      await new Promise((r) => setTimeout(r, 5));

      queue.onAgentFinished();
      await new Promise((r) => setTimeout(r, 5));

      expect(syncSender).toHaveBeenCalledTimes(2);
    });
  });

  describe('enqueueAll', () => {
    it('should enqueue multiple messages at once', () => {
      const ids = queue.enqueueAll([
        { content: 'A', priority: 'normal', source: 'hook' },
        { content: 'B', priority: 'normal', source: 'hook' },
        { content: 'C', priority: 'normal', source: 'hook' },
      ]);

      expect(ids.length).toBe(3);
      expect(ids.every((id) => id.length > 0)).toBe(true);
    });
  });

  describe('queueMessages (hook auto-feed)', () => {
    it('should process all 4 hook messages from code-review-queue sequentially', async () => {
      // Sender resolves immediately; drive each turn via onAgentFinished
      const syncSender = jest.fn().mockResolvedValue(undefined);
      queue.setSender(syncSender);

      // Simulate what onQueueInit hook returns for code-review-queue assistant
      const hookMessages = [
        { content: '## Security Review Pass', priority: 'normal' as const, source: 'hook' as const },
        { content: '## Performance Review Pass', priority: 'normal' as const, source: 'hook' as const },
        { content: '## Code Quality Review Pass', priority: 'normal' as const, source: 'hook' as const },
        { content: '## Test Coverage Review Pass', priority: 'normal' as const, source: 'hook' as const },
      ];

      queue.enqueueAll(hookMessages);

      // Drive all 4 turns by calling onAgentFinished after each sender resolves
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 5));
        queue.onAgentFinished();
      }
      await new Promise((r) => setTimeout(r, 10));

      expect(syncSender).toHaveBeenCalledTimes(4);
      expect(syncSender.mock.calls[0][0].content).toBe('## Security Review Pass');
      expect(syncSender.mock.calls[1][0].content).toBe('## Performance Review Pass');
      expect(syncSender.mock.calls[2][0].content).toBe('## Code Quality Review Pass');
      expect(syncSender.mock.calls[3][0].content).toBe('## Test Coverage Review Pass');
    });

    it('should preserve order of hook messages', () => {
      const hookMessages = [
        { content: 'Pass 1', priority: 'normal' as const, source: 'hook' as const },
        { content: 'Pass 2', priority: 'normal' as const, source: 'hook' as const },
        { content: 'Pass 3', priority: 'normal' as const, source: 'hook' as const },
      ];

      queue.enqueueAll(hookMessages);

      // First message is dequeued immediately, remaining 2 are waiting
      const status = queue.getStatus();
      expect(status.messages[0].content).toBe('Pass 2');
      expect(status.messages[1].content).toBe('Pass 3');
    });

    it('should send hook messages only after user message finishes', async () => {
      // User sends first message (slow)
      queue.enqueue({ content: 'User: Review codebase', priority: 'normal', source: 'user' });

      // Hook queues follow-up messages while user message is still processing
      queue.enqueueAll([
        { content: '## Security Review Pass', priority: 'normal', source: 'hook' },
        { content: '## Performance Review Pass', priority: 'normal', source: 'hook' },
      ]);

      // Only user message should have been sent so far
      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0].content).toBe('User: Review codebase');
      expect(queue.getStatus().queueLength).toBe(2);

      // Resolve user message send, then signal agent turn finished
      resolvers[0]();
      queue.onAgentFinished();
      await new Promise((r) => setTimeout(r, 10));

      // Security pass should now be processing
      expect(sentMessages.length).toBe(2);
      expect(sentMessages[1].content).toBe('## Security Review Pass');

      // Resolve security pass send, then signal agent turn finished
      resolvers[1]();
      queue.onAgentFinished();
      await new Promise((r) => setTimeout(r, 10));

      expect(sentMessages.length).toBe(3);
      expect(sentMessages[2].content).toBe('## Performance Review Pass');
    });

    it('should emit drain event after all hook messages are processed', async () => {
      const events: string[] = [];
      queue.on((event) => events.push(event.type));

      const syncSender = jest.fn().mockResolvedValue(undefined);
      queue.setSender(syncSender);

      queue.enqueueAll([
        { content: 'Pass 1', priority: 'normal', source: 'hook' },
        { content: 'Pass 2', priority: 'normal', source: 'hook' },
      ]);

      // Drive both turns
      for (let i = 0; i < 2; i++) {
        await new Promise((r) => setTimeout(r, 10));
        queue.onAgentFinished();
      }
      await new Promise((r) => setTimeout(r, 20));

      expect(events).toContain('drain');
      expect(queue.getStatus().status).toBe('idle');
    });

    it('should track source as hook for all enqueued messages', () => {
      const syncSender = jest.fn().mockResolvedValue(undefined);
      queue.setSender(syncSender);

      queue.enqueueAll([
        { content: 'Pass 1', priority: 'normal', source: 'hook' },
        { content: 'Pass 2', priority: 'normal', source: 'hook' },
        { content: 'Pass 3', priority: 'normal', source: 'hook' },
      ]);

      // Check remaining messages in queue have correct source
      const { messages } = queue.getStatus();
      expect(messages.every((m) => m.source === 'hook')).toBe(true);
    });

    it('should not start processing hook messages without a sender', () => {
      // Create a fresh queue with no sender
      const emptySenderQueue = new AcpMessageQueue();

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      emptySenderQueue.enqueueAll([
        { content: 'Pass 1', priority: 'normal', source: 'hook' },
        { content: 'Pass 2', priority: 'normal', source: 'hook' },
      ]);

      // Both messages remain since processNext bails out with no sender
      expect(emptySenderQueue.getStatus().queueLength).toBe(2);

      consoleSpy.mockRestore();
    });
  });

  describe('events', () => {
    it('should emit events for enqueue and dequeue', () => {
      const events: string[] = [];
      queue.on((event) => events.push(event.type));

      queue.enqueue({ content: 'Test', priority: 'normal', source: 'user' });

      expect(events).toContain('enqueue');
      expect(events).toContain('dequeue');
      expect(events).toContain('start');
    });

    it('should allow unsubscribing from events', () => {
      const events: string[] = [];
      const unsub = queue.on((event) => events.push(event.type));

      queue.enqueue({ content: 'First', priority: 'normal', source: 'user' });
      const countAfterFirst = events.length;

      unsub();

      queue.enqueue({ content: 'Second', priority: 'normal', source: 'user' });
      expect(events.length).toBe(countAfterFirst);
    });
  });
});
