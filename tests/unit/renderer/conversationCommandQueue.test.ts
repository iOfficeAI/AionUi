import {
  createQueuedCommandItem,
  estimateQueueStateBytes,
  MAX_QUEUED_COMMANDS,
  MAX_QUEUED_COMMAND_FILES,
  MAX_QUEUED_COMMAND_INPUT_LENGTH,
  MAX_QUEUED_COMMAND_STATE_BYTES,
  normalizeQueueState,
  reorderQueuedCommand,
  removeQueuedCommand,
  restoreQueuedCommand,
  shouldEnqueueConversationCommand,
  updateQueuedCommand,
  validateQueuedCommandItem,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';

const createItem = (id: string): ConversationCommandQueueItem => ({
  id,
  input: `command-${id}`,
  files: [],
  createdAt: 0,
});

describe('conversation command queue helpers', () => {
  it('removes a queued command by id', () => {
    const queue = [createItem('1'), createItem('2'), createItem('3')];

    expect(removeQueuedCommand(queue, '2').map((item) => item.id)).toEqual(['1', '3']);
  });

  it('reorders a queued command before another command', () => {
    const queue = [createItem('1'), createItem('2'), createItem('3')];

    expect(reorderQueuedCommand(queue, '3', '1').map((item) => item.id)).toEqual(['3', '1', '2']);
  });

  it('moves a queued command to the hovered position when dragging downward', () => {
    const queue = [createItem('1'), createItem('2'), createItem('3')];

    expect(reorderQueuedCommand(queue, '1', '3').map((item) => item.id)).toEqual(['2', '3', '1']);
  });

  it('keeps queue unchanged when reorder target is invalid', () => {
    const queue = [createItem('1'), createItem('2'), createItem('3')];

    expect(reorderQueuedCommand(queue, 'missing', '2').map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(reorderQueuedCommand(queue, '1', 'missing').map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(reorderQueuedCommand(queue, '2', '2').map((item) => item.id)).toEqual(['1', '2', '3']);
  });

  it('restores a failed command to the front of the queue', () => {
    const queue = [createItem('2'), createItem('3')];

    expect(restoreQueuedCommand(queue, createItem('1')).map((item) => item.id)).toEqual(['1', '2', '3']);
  });

  it('updates a queued command in place without changing its position', () => {
    const queue = [createItem('1'), createItem('2')];

    expect(updateQueuedCommand(queue, '2', { input: 'updated command' })).toEqual([
      createItem('1'),
      {
        ...createItem('2'),
        input: 'updated command',
      },
    ]);
  });

  it('deduplicates files when updating a queued command', () => {
    const queue = [createItem('1')];

    expect(updateQueuedCommand(queue, '1', { files: ['a.ts', 'a.ts', 'b.ts'] })[0]?.files).toEqual(['a.ts', 'b.ts']);
  });

  it('keeps new commands in the queue while the current turn is still busy', () => {
    expect(
      shouldEnqueueConversationCommand({
        isBusy: true,
        hasPendingCommands: false,
      })
    ).toBe(true);
  });

  it('keeps new commands in the queue when older queued work is still pending', () => {
    expect(
      shouldEnqueueConversationCommand({
        isBusy: false,
        hasPendingCommands: true,
      })
    ).toBe(true);
  });

  it('allows direct execution only when the conversation is idle and the queue is empty', () => {
    expect(
      shouldEnqueueConversationCommand({
        isBusy: false,
        hasPendingCommands: false,
      })
    ).toBe(false);
  });

  it('clears paused state when queue becomes empty', () => {
    expect(normalizeQueueState({ items: [], isPaused: true })).toEqual({
      items: [],
      isPaused: false,
    });
  });

  it('drops malformed queue items during normalization', () => {
    expect(
      normalizeQueueState({
        items: [createItem('1'), { id: 'bad', input: 'oops', files: 'broken', createdAt: 0 }],
        isPaused: true,
      }).items.map((item) => item.id)
    ).toEqual(['1']);
  });

  it('drops persisted items that violate queue input and file limits', () => {
    const normalized = normalizeQueueState({
      items: [
        createItem('safe'),
        {
          id: 'too-long',
          input: 'x'.repeat(MAX_QUEUED_COMMAND_INPUT_LENGTH + 1),
          files: [],
          createdAt: 0,
        },
        {
          id: 'too-many-files',
          input: 'hello',
          files: Array.from({ length: MAX_QUEUED_COMMAND_FILES + 1 }, (_, index) => `${index}.txt`),
          createdAt: 0,
        },
      ],
      isPaused: true,
    });

    expect(normalized).toEqual({
      items: [createItem('safe')],
      isPaused: true,
    });
  });

  it('caps restored queue length to the maximum allowed size', () => {
    const normalized = normalizeQueueState({
      items: Array.from({ length: MAX_QUEUED_COMMANDS + 5 }, (_, index) => createItem(String(index))),
      isPaused: true,
    });

    expect(normalized.items).toHaveLength(MAX_QUEUED_COMMANDS);
    expect(normalized.items.at(-1)?.id).toBe(String(MAX_QUEUED_COMMANDS - 1));
  });

  it('drops restored items when persisted state exceeds the storage budget', () => {
    const oversizedInput = 'x'.repeat(18_000);
    const normalized = normalizeQueueState({
      items: Array.from({ length: MAX_QUEUED_COMMANDS }, (_, index) => ({
        id: String(index),
        input: oversizedInput,
        files: [],
        createdAt: index,
      })),
      isPaused: true,
    });

    expect(estimateQueueStateBytes(normalized)).toBeLessThanOrEqual(MAX_QUEUED_COMMAND_STATE_BYTES);
    expect(normalized.items.length).toBeLessThan(MAX_QUEUED_COMMANDS);
    expect(normalized.isPaused).toBe(true);
  });

  it('deduplicates attached files when creating a queued command item', () => {
    const item = createQueuedCommandItem({ input: 'hello', files: ['a.txt', 'a.txt', 'b.txt'] });

    expect(item.files).toEqual(['a.txt', 'b.txt']);
  });

  it('rejects oversized queued command input', () => {
    const result = validateQueuedCommandItem(
      createQueuedCommandItem({
        input: 'x'.repeat(MAX_QUEUED_COMMAND_INPUT_LENGTH + 1),
        files: [],
      }),
      { items: [], isPaused: false }
    );

    expect(result).toEqual({ ok: false, reason: 'inputTooLong' });
  });

  it('rejects empty queued command input', () => {
    const result = validateQueuedCommandItem(
      createQueuedCommandItem({
        input: '   ',
        files: [],
      }),
      { items: [], isPaused: false }
    );

    expect(result).toEqual({ ok: false, reason: 'emptyInput' });
  });

  it('rejects queued commands with too many files', () => {
    const result = validateQueuedCommandItem(
      createQueuedCommandItem({
        input: 'hello',
        files: Array.from({ length: MAX_QUEUED_COMMAND_FILES + 1 }, (_, index) => `${index}.txt`),
      }),
      { items: [], isPaused: false }
    );

    expect(result).toEqual({ ok: false, reason: 'tooManyFiles' });
  });

  it('rejects queue states that exceed the storage budget', () => {
    const input = 'x'.repeat(MAX_QUEUED_COMMAND_INPUT_LENGTH);
    const state: { items: ConversationCommandQueueItem[]; isPaused: boolean } = {
      items: [],
      isPaused: false,
    };

    for (let index = 0; index < MAX_QUEUED_COMMANDS; index += 1) {
      const item = createQueuedCommandItem({ input, files: [] });
      const result = validateQueuedCommandItem(item, state);

      if (!result.ok) {
        expect(result).toEqual({ ok: false, reason: 'queueTooLarge' });
        return;
      }

      state.items.push(item);
    }

    throw new Error('Expected queue size validation to fail before queue reaches capacity');
  });
});
