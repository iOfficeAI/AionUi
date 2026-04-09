import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
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
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');

  return {
    ...actual,
    Dropdown: ({
      children,
      droplist,
    }: {
      children: React.ReactElement<{ onClick?: (event: React.MouseEvent) => void }>;
      droplist: React.ReactNode;
    }) => {
      const [open, setOpen] = ReactModule.useState(false);
      return (
        <div>
          {ReactModule.cloneElement(children, {
            onClick: (event: React.MouseEvent) => {
              children.props.onClick?.(event);
              setOpen((visible) => !visible);
            },
          })}
          {open ? <div>{droplist}</div> : null}
        </div>
      );
    },
    Menu: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, {
      Item: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
        <button type='button' onClick={onClick}>
          {children}
        </button>
      ),
    }),
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

  it('clears persisted queue state when the feature is disabled', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const storageKey = `conversation-command-queue/${conversationId}`;

    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        isPaused: true,
        items: [
          {
            id: 'queued-1',
            input: 'stale queued command',
            files: [],
            createdAt: Date.now(),
          },
        ],
      })
    );

    const { result } = renderHook(() =>
      useConversationCommandQueue({
        conversationId,
        enabled: false,
        isBusy: false,
        onExecute,
      })
    );

    await waitFor(() => {
      expect(result.current.items).toHaveLength(0);
      expect(result.current.hasPendingCommands).toBe(false);
    });

    expect(onExecute).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it('waits for the conversation runtime status to hydrate before auto-dequeuing restored commands', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockResolvedValue(undefined);

    window.sessionStorage.setItem(
      `conversation-command-queue/${conversationId}`,
      JSON.stringify({
        isPaused: false,
        items: [
          {
            id: 'queued-1',
            input: 'restored queued command',
            files: [],
            createdAt: Date.now(),
          },
        ],
      })
    );

    const { result, rerender } = renderHook(
      ({ isBusy, isHydrated }) =>
        useConversationCommandQueue({
          conversationId,
          isBusy,
          isHydrated,
          onExecute,
        }),
      {
        initialProps: { isBusy: false, isHydrated: false },
      }
    );

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    expect(onExecute).not.toHaveBeenCalled();

    rerender({ isBusy: false, isHydrated: true });

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledTimes(1);
    });
    expect(onExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'restored queued command',
      })
    );
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
    expect(warningSpy).toHaveBeenCalledWith(
      'The next queued command could not start. Edit, reorder, or remove it to continue.'
    );
    expect(JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}')).toMatchObject({
      isPaused: true,
      items: [{ input: 'broken command', files: ['broken.txt'] }],
    });

    errorSpy.mockRestore();
  });

  it('resumes a paused queue after the blocked command is edited', async () => {
    const conversationId = createConversationId();
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
        input: 'blocked command',
        files: [],
      });
      commandId = queuedItem?.id ?? '';
      result.current.pause();
    });

    await waitFor(() => {
      expect(result.current.isPaused).toBe(true);
      expect(result.current.items).toHaveLength(1);
    });

    act(() => {
      result.current.update(commandId, {
        input: 'blocked command fixed',
      });
    });

    await waitFor(() => {
      expect(result.current.isPaused).toBe(false);
      expect(result.current.items[0]?.input).toBe('blocked command fixed');
    });
  });

  it('reorders queued commands and clears the paused state', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useConversationCommandQueue({
        conversationId,
        isBusy: true,
        onExecute,
      })
    );

    act(() => {
      result.current.enqueue({
        input: 'first queued',
        files: [],
      });
      result.current.enqueue({
        input: 'second queued',
        files: [],
      });
      result.current.pause();
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2);
      expect(result.current.isPaused).toBe(true);
    });

    act(() => {
      result.current.reorder(result.current.items[1]!.id, result.current.items[0]!.id);
    });

    await waitFor(() => {
      expect(result.current.isPaused).toBe(false);
      expect(result.current.items.map((item) => item.input)).toEqual(['second queued', 'first queued']);
    });
  });

  it('waits for an active drag interaction to finish before dequeuing the next command', async () => {
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
        input: 'queued during drag',
        files: [],
      });
      result.current.lockInteraction();
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
      expect(result.current.isInteractionLocked).toBe(true);
    });

    rerender({ isBusy: false });

    await waitFor(() => {
      expect(onExecute).not.toHaveBeenCalled();
    });

    act(() => {
      result.current.unlockInteraction();
    });

    await waitFor(() => {
      expect(result.current.isInteractionLocked).toBe(false);
      expect(onExecute).toHaveBeenCalledTimes(1);
    });
    expect(onExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'queued during drag',
      })
    );
  });

  it('dequeues only one queued command per busy-idle cycle', async () => {
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
        initialProps: { isBusy: false },
      }
    );

    act(() => {
      result.current.enqueue({
        input: 'first queued command',
        files: [],
      });
      result.current.enqueue({
        input: 'second queued command',
        files: [],
      });
    });

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledTimes(1);
    });
    expect(onExecute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: 'first queued command',
      })
    );

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    act(() => {
      rerender({ isBusy: true });
    });

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledTimes(1);
    });

    act(() => {
      rerender({ isBusy: false });
    });

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledTimes(2);
    });
    expect(onExecute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: 'second queued command',
      })
    );
  });

  it('releases a pending execution gate after stop so the next queued command can start', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useConversationCommandQueue({
        conversationId,
        isBusy: false,
        onExecute,
      })
    );

    act(() => {
      result.current.enqueue({
        input: 'first command before stop',
        files: [],
      });
      result.current.enqueue({
        input: 'second command after stop',
        files: [],
      });
    });

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.resetActiveExecution('stop');
    });

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledTimes(2);
    });
    expect(onExecute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: 'second command after stop',
      })
    );
  });

  it('ignores stop resets when there is no pending execution gate to release', async () => {
    const conversationId = createConversationId();
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useConversationCommandQueue({
        conversationId,
        isBusy: true,
        onExecute,
      })
    );

    act(() => {
      result.current.resetActiveExecution('stop');
    });

    await waitFor(() => {
      expect(onExecute).not.toHaveBeenCalled();
      expect(result.current.items).toHaveLength(0);
    });
  });

  it('removes a blocked queued command and clears the paused state', async () => {
    const conversationId = createConversationId();
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
        input: 'blocked queued',
        files: [],
      });
      commandId = queuedItem?.id ?? '';
      result.current.pause();
    });

    await waitFor(() => {
      expect(result.current.isPaused).toBe(true);
      expect(result.current.items).toHaveLength(1);
    });

    act(() => {
      result.current.remove(commandId);
    });

    await waitFor(() => {
      expect(result.current.isPaused).toBe(false);
      expect(result.current.items).toHaveLength(0);
      expect(result.current.hasPendingCommands).toBe(false);
    });
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

  it('clears a paused queue and drops persisted state immediately', async () => {
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

    act(() => {
      result.current.enqueue({
        input: 'queued before clear',
        files: ['a.txt'],
      });
      result.current.pause();
    });

    await waitFor(() => {
      expect(result.current.isPaused).toBe(true);
      expect(result.current.items).toHaveLength(1);
    });
    expect(window.sessionStorage.getItem(storageKey)).not.toBeNull();

    act(() => {
      result.current.clear();
    });

    await waitFor(() => {
      expect(result.current.isPaused).toBe(false);
      expect(result.current.items).toHaveLength(0);
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
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('can transition from an empty queue to queued items without crashing hooks order', () => {
    const { rerender } = render(
      <CommandQueuePanel
        items={[]}
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    rerender(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Queued Commands')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Drag to reorder queued command' })).toHaveLength(2);
  });

  it('renders queue controls and forwards button actions', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    const onRemove = vi.fn();

    render(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onReorder={onReorder}
        onRemove={onRemove}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByText('2 files')).toBeInTheDocument();
    expect(screen.getByLabelText('Queued Commands')).toBeInTheDocument();

    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    const moreButtons = screen.getAllByRole('button', { name: 'More actions' });

    expect(screen.queryByRole('button', { name: 'Up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Down' })).not.toBeInTheDocument();
    expect(moreButtons).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Drag to reorder queued command' })).toHaveLength(2);

    await user.click(removeButtons[1]);

    expect(onReorder).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith('2');
  });

  it('uses theme tokens for queue chrome instead of hard-coded light colors', () => {
    const { container } = render(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const panel = screen.getByLabelText('Queued Commands');
    const firstItem = container.querySelector('[data-command-id="1"]');
    const queueList = container.querySelector('[data-command-queue-list="true"]');
    const queueArrows = container.querySelectorAll('[data-queue-arrow="true"]');
    const dragHandles = screen.getAllByRole('button', { name: 'Drag to reorder queued command' });

    expect(panel.getAttribute('style')).toContain('var(--color-fill-1)');
    expect(panel.getAttribute('style')).toContain('var(--color-border-2)');
    expect(queueList?.getAttribute('data-drag-axis')).toBe('vertical');
    expect(queueList?.getAttribute('data-drag-bounds')).toBe('queue');
    expect(firstItem?.getAttribute('style')).toContain('var(--color-fill-1)');
    expect(queueArrows).toHaveLength(2);
    expect(queueArrows[0]?.getAttribute('style')).toContain('var(--color-text-3)');
    expect(dragHandles[0]?.getAttribute('style')).toContain('var(--color-text-3)');
    expect(dragHandles[0]?.getAttribute('style')).not.toContain('var(--color-fill-1)');
    expect(dragHandles[0]?.getAttribute('style')).not.toContain('box-shadow');
  });

  it('keeps the overflow menu limited to edit and clear actions', async () => {
    const user = userEvent.setup();

    render(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole('button', { name: 'More actions' })[0]);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear queue' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel queue' })).not.toBeInTheDocument();
  });

  it('shows a leading arrow and drag handle on every queued item without legacy next text', () => {
    const { container } = render(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const queueArrows = container.querySelectorAll('[data-queue-arrow="true"]');
    const dragHandles = screen.getAllByRole('button', { name: 'Drag to reorder queued command' });

    expect(queueArrows).toHaveLength(2);
    expect(dragHandles).toHaveLength(2);
    expect(dragHandles[0]?.getAttribute('data-drag-handle')).toBe('enabled');
    expect(dragHandles[0]?.getAttribute('data-floating-handle')).toBe('visible');
    expect(dragHandles[0]?.className).toContain('opacity-0');
    expect(dragHandles[0]?.className).toContain('group-hover:opacity-100');
    expect(dragHandles[0]?.className).toContain('focus-visible:opacity-100');
    expect(dragHandles[0]?.className).not.toContain('rd-999px');
    expect(dragHandles[0]?.className).not.toContain('group-focus-within:opacity-100');
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
    expect(screen.queryByText('下一条')).not.toBeInTheDocument();
  });

  it('routes edit to the external callback without pausing the queue or opening inline controls', async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onEdit = vi.fn();

    render(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={false}
        onPause={onPause}
        onResume={onResume}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onEdit={onEdit}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole('button', { name: 'More actions' })[0]);
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(baseItems[0]);
    expect(onPause).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('keeps queue cards compact and visually lighter than the active processing panel', () => {
    const { container } = render(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onEdit={vi.fn()}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const panel = screen.getByLabelText('Queued Commands');
    const firstItem = container.querySelector('[data-command-id="1"]');
    const previewText = screen.getAllByText('first command')[0]?.closest('.arco-ellipsis');

    expect(panel.className).toContain('rd-t-18px');
    expect(panel.getAttribute('style')).toContain('var(--color-fill-1)');
    expect(firstItem?.getAttribute('style')).toContain('var(--color-fill-1)');
    expect(previewText?.className).toContain('text-11px');
    expect(previewText?.className).toContain('text-t-secondary');
  });

  it('clears the queue from the overflow menu', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={onClear}
      />
    );

    await user.click(screen.getAllByRole('button', { name: 'More actions' })[0]);
    await user.click(screen.getByRole('button', { name: 'Clear queue' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('keeps the drag handle interactive through pointer down without exposing extra chrome', () => {
    render(
      <CommandQueuePanel
        items={baseItems}
        paused={false}
        interactionLocked={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onInteractionLock={vi.fn()}
        onInteractionUnlock={vi.fn()}
        onUpdate={vi.fn(() => true)}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />
    );

    const dragHandle = screen.getAllByRole('button', { name: 'Drag to reorder queued command' })[0]!;

    fireEvent.pointerDown(dragHandle);

    expect(dragHandle.getAttribute('data-floating-handle')).toBe('visible');
    expect(dragHandle.getAttribute('data-drag-handle')).toBe('enabled');
  });
});
