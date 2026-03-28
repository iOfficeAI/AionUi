import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Message } from '@arco-design/web-react';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import {
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
  MAX_QUEUED_COMMANDS,
  MAX_QUEUED_COMMAND_FILES,
  MAX_QUEUED_COMMAND_INPUT_LENGTH,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { emitter } from '@/renderer/utils/emitter';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options?.defaultValue as string | undefined) ?? key,
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');

  return {
    ...actual,
    Message: {
      ...actual.Message,
      warning: vi.fn(),
    },
  };
});

const createConversationId = (): string => `conversation-${Math.random().toString(36).slice(2)}`;

const createQueueItem = (overrides: Partial<ConversationCommandQueueItem> = {}): ConversationCommandQueueItem => ({
  id: overrides.id ?? `command-${Math.random().toString(36).slice(2)}`,
  input: overrides.input ?? 'echo hello',
  files: overrides.files ?? [],
  createdAt: overrides.createdAt ?? Date.now(),
});

describe('useConversationCommandQueue', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('automatically executes the next queued command when the conversation becomes idle', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const storageKey = `conversation-command-queue/${conversationId}`;
    const { result, rerender } = renderHook(
      ({ isBusy }) =>
        useConversationCommandQueue({
          conversationId,
          isBusy,
          onExecute,
        }),
      {
        initialProps: { isBusy: true },
      }
    );

    act(() => {
      result.current.enqueue({
        input: 'echo queued',
        files: ['a.txt', 'a.txt', 'b.txt'],
      });
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });
    expect(JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}')).toMatchObject({
      isPaused: false,
      items: [{ input: 'echo queued', files: ['a.txt', 'b.txt'] }],
    });

    rerender({ isBusy: false });

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledTimes(1);
    });
    expect(onExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'echo queued',
        files: ['a.txt', 'b.txt'],
      })
    );

    await waitFor(() => {
      expect(result.current.items).toHaveLength(0);
      expect(result.current.hasPendingCommands).toBe(false);
    });
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('keeps queued commands paused until resumed', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ isBusy }) =>
        useConversationCommandQueue({
          conversationId,
          isBusy,
          onExecute,
        }),
      {
        initialProps: { isBusy: true },
      }
    );

    act(() => {
      result.current.enqueue({
        input: 'npm test',
        files: [],
      });
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    act(() => {
      result.current.pause();
    });

    await waitFor(() => {
      expect(result.current.isPaused).toBe(true);
    });

    rerender({ isBusy: false });

    await waitFor(() => {
      expect(onExecute).not.toHaveBeenCalled();
    });

    act(() => {
      result.current.resume();
    });

    await waitFor(() => {
      expect(result.current.isPaused).toBe(false);
      expect(onExecute).toHaveBeenCalledTimes(1);
    });
  });

  it('restores the failed command to the front of the queue and pauses execution', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockRejectedValue(new Error('send failed'));
    const warningSpy = vi.mocked(Message.warning);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storageKey = `conversation-command-queue/${conversationId}`;
    const { result, rerender } = renderHook(
      ({ isBusy }) =>
        useConversationCommandQueue({
          conversationId,
          isBusy,
          onExecute,
        }),
      {
        initialProps: { isBusy: true },
      }
    );

    act(() => {
      result.current.enqueue({
        input: 'broken command',
        files: ['broken.txt'],
      });
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    rerender({ isBusy: false });

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(result.current.isPaused).toBe(true);
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0]).toMatchObject({
        input: 'broken command',
        files: ['broken.txt'],
      });
    });
    expect(warningSpy).toHaveBeenCalledWith('Queue paused because the next command could not start.');
    expect(JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}')).toMatchObject({
      isPaused: true,
      items: [{ input: 'broken command', files: ['broken.txt'] }],
    });

    errorSpy.mockRestore();
  });

  it('clears persisted queue state when the conversation is deleted', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const storageKey = `conversation-command-queue/${conversationId}`;
    const { result } = renderHook(() =>
      useConversationCommandQueue({
        conversationId,
        isBusy: true,
        onExecute,
      })
    );

    act(() => {
      result.current.enqueue({
        input: 'queued before delete',
        files: [],
      });
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });
    expect(window.sessionStorage.getItem(storageKey)).not.toBeNull();

    act(() => {
      emitter.emit('conversation.deleted', conversationId);
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(0);
      expect(result.current.isPaused).toBe(false);
    });
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('rejects rapid enqueue operations that would exceed queue limits', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const warningSpy = vi.spyOn(Message, 'warning').mockImplementation(vi.fn());
    const { result } = renderHook(() =>
      useConversationCommandQueue({
        conversationId,
        isBusy: true,
        onExecute,
      })
    );

    act(() => {
      for (let index = 0; index < MAX_QUEUED_COMMANDS + 1; index += 1) {
        result.current.enqueue({
          input: `command-${index}`,
          files: [],
        });
      }
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(MAX_QUEUED_COMMANDS);
    });
    expect(warningSpy).toHaveBeenCalledTimes(1);
    expect(onExecute).not.toHaveBeenCalled();
  });

  it('updates a queued command and persists the edited input', async () => {
    const conversationId = createConversationId();
    const storageKey = `conversation-command-queue/${conversationId}`;
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useConversationCommandQueue({
        conversationId,
        isBusy: true,
        onExecute,
      })
    );

    let commandId = '';
    act(() => {
      const queuedItem = result.current.enqueue({
        input: 'echo before edit',
        files: ['a.txt'],
      });
      commandId = queuedItem?.id ?? '';
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    let didUpdate = false;
    act(() => {
      didUpdate = result.current.update(commandId, {
        input: 'echo after edit',
      });
    });

    expect(didUpdate).toBe(true);

    await waitFor(() => {
      expect(result.current.items[0]).toMatchObject({
        id: commandId,
        input: 'echo after edit',
        files: ['a.txt'],
      });
    });
    expect(JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}')).toMatchObject({
      items: [{ id: commandId, input: 'echo after edit', files: ['a.txt'] }],
    });
  });

  it('rejects blank queued command edits and keeps the original command intact', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const warningSpy = vi.mocked(Message.warning);
    const { result } = renderHook(() =>
      useConversationCommandQueue({
        conversationId,
        isBusy: true,
        onExecute,
      })
    );

    let commandId = '';
    act(() => {
      const queuedItem = result.current.enqueue({
        input: 'npm run build',
        files: [],
      });
      commandId = queuedItem?.id ?? '';
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    let didUpdate = true;
    act(() => {
      didUpdate = result.current.update(commandId, {
        input: '   ',
      });
    });

    expect(didUpdate).toBe(false);
    expect(warningSpy).toHaveBeenCalledWith('Queued commands cannot be empty.');
    expect(result.current.items[0]?.input).toBe('npm run build');
  });

  it('ignores unsafe persisted queue entries before auto-execution can start', async () => {
    const conversationId = createConversationId();
    const storageKey = `conversation-command-queue/${conversationId}`;
    const onExecute = vi.fn().mockResolvedValue(undefined);

    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        items: [
          {
            id: 'valid',
            input: 'safe command',
            files: ['a.txt', 'a.txt'],
            createdAt: 1,
          },
          {
            id: 'oversized-input',
            input: 'x'.repeat(MAX_QUEUED_COMMAND_INPUT_LENGTH + 1),
            files: [],
            createdAt: 2,
          },
          {
            id: 'too-many-files',
            input: 'unsafe',
            files: Array.from({ length: MAX_QUEUED_COMMAND_FILES + 1 }, (_, index) => `${index}.txt`),
            createdAt: 3,
          },
        ],
        isPaused: false,
      })
    );

    const { result } = renderHook(() =>
      useConversationCommandQueue({
        conversationId,
        isBusy: true,
        onExecute,
      })
    );

    await waitFor(() => {
      expect(result.current.items).toEqual([
        expect.objectContaining({
          id: 'valid',
          input: 'safe command',
          files: ['a.txt'],
        }),
      ]);
    });
    expect(onExecute).not.toHaveBeenCalled();
  });
});

describe('CommandQueuePanel', () => {
  const baseItems = [
    createQueueItem({ id: '1', input: 'first command', files: [] }),
    createQueueItem({ id: '2', input: 'second command', files: ['a.ts', 'b.ts'] }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the queue is empty and idle', () => {
    const { container } = render(
      <CommandQueuePanel
        items={[]}
        running={false}
        paused={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders queue controls and forwards button actions', async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    const onRemove = vi.fn();
    const onClear = vi.fn();

    render(
      <CommandQueuePanel
        items={baseItems}
        running={false}
        paused={false}
        onPause={onPause}
        onResume={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onRemove={onRemove}
        onClear={onClear}
      />
    );

    expect(screen.getByText('Queued Commands')).toBeInTheDocument();
    expect(screen.getByText('2 queued')).toBeInTheDocument();
    expect(screen.getByText('Ready to continue')).toBeInTheDocument();
    expect(screen.getByText('2 files')).toBeInTheDocument();

    const upButtons = screen.getAllByRole('button', { name: 'Up' });
    const downButtons = screen.getAllByRole('button', { name: 'Down' });

    expect(upButtons[0]).toBeDisabled();
    expect(downButtons[1]).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await user.click(screen.getByRole('button', { name: 'Clear queue' }));
    await user.click(upButtons[1]);
    await user.click(downButtons[0]);
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]);

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onMoveUp).toHaveBeenCalledWith('2');
    expect(onMoveDown).toHaveBeenCalledWith('1');
    expect(onRemove).toHaveBeenCalledWith('2');
  });

  it('pauses before editing from an active queue and lets users cancel safely', async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();

    render(
      <CommandQueuePanel
        items={baseItems}
        running={true}
        paused={false}
        onPause={onPause}
        onResume={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('first command')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByDisplayValue('first command')).not.toBeInTheDocument();
  });

  it('saves edits and keeps resume disabled while an edit is still in progress', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(() => true);

    render(
      <CommandQueuePanel
        items={baseItems}
        running={false}
        paused={true}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onUpdate={onUpdate}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled();

    const editor = screen.getByRole('textbox');
    await user.clear(editor);
    await user.type(editor, 'first command updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onUpdate).toHaveBeenCalledWith('1', 'first command updated');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('keeps edit mode open when saving fails validation', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(() => false);

    render(
      <CommandQueuePanel
        items={baseItems}
        running={false}
        paused={true}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onUpdate={onUpdate}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onUpdate).toHaveBeenCalledWith('1', '   ');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
