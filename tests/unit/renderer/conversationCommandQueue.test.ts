import {
  createQueuedCommandItem,
  MAX_QUEUED_COMMANDS,
  MAX_QUEUED_COMMAND_FILES,
  MAX_QUEUED_COMMAND_INPUT_LENGTH,
  moveQueuedCommand,
  normalizeQueueState,
  removeQueuedCommand,
  restoreQueuedCommand,
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

  it('moves a queued command upward', () => {
    const queue = [createItem('1'), createItem('2'), createItem('3')];

    expect(moveQueuedCommand(queue, '2', 'up').map((item) => item.id)).toEqual(['2', '1', '3']);
  });

  it('moves a queued command downward', () => {
    const queue = [createItem('1'), createItem('2'), createItem('3')];

    expect(moveQueuedCommand(queue, '2', 'down').map((item) => item.id)).toEqual(['1', '3', '2']);
  });

  it('keeps queue unchanged when moving out of bounds', () => {
    const queue = [createItem('1'), createItem('2'), createItem('3')];

    expect(moveQueuedCommand(queue, '1', 'up').map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(moveQueuedCommand(queue, '3', 'down').map((item) => item.id)).toEqual(['1', '2', '3']);
  });

  it('restores a failed command to the front of the queue', () => {
    const queue = [createItem('2'), createItem('3')];

    expect(restoreQueuedCommand(queue, createItem('1')).map((item) => item.id)).toEqual(['1', '2', '3']);
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
