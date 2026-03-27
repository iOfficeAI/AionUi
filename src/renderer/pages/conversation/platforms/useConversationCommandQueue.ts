import { uuid } from '@/common/utils';
import { useAddEventListener } from '@/renderer/utils/emitter';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

export type ConversationCommandQueueItem = {
  id: string;
  input: string;
  files: string[];
  createdAt: number;
};

export type ConversationCommandQueueState = {
  items: ConversationCommandQueueItem[];
  isPaused: boolean;
};

export const MAX_QUEUED_COMMANDS = 20;
export const MAX_QUEUED_COMMAND_INPUT_LENGTH = 20_000;
export const MAX_QUEUED_COMMAND_FILES = 50;
export const MAX_QUEUED_COMMAND_STATE_BYTES = 256 * 1024;

export type QueueValidationFailureReason = 'inputTooLong' | 'tooManyFiles' | 'queueFull' | 'queueTooLarge';

type QueueValidationSuccess = {
  ok: true;
  nextStateBytes: number;
};

type QueueValidationFailure = {
  ok: false;
  reason: QueueValidationFailureReason;
};

const COMMAND_QUEUE_LOG_PREFIX = '[conversation-command-queue]';

const summarizeQueuedCommand = (item: ConversationCommandQueueItem): Record<string, unknown> => ({
  id: item.id,
  createdAt: item.createdAt,
  inputLength: item.input.length,
  fileCount: item.files.length,
  preview: item.input.replace(/\s+/g, ' ').trim().slice(0, 120),
});

const logCommandQueue = (conversationId: string, event: string, payload: Record<string, unknown> = {}): void => {
  console.info(COMMAND_QUEUE_LOG_PREFIX, {
    conversationId,
    event,
    ...payload,
  });
};

const createDefaultQueueState = (): ConversationCommandQueueState => ({
  items: [],
  isPaused: false,
});

const queueStore = new Map<string, ConversationCommandQueueState>();

const getStorageKey = (conversationId: string): string => `conversation-command-queue/${conversationId}`;

const uniqueFiles = (files: string[]): string[] => Array.from(new Set(files.filter(Boolean)));

const isQueueItem = (item: unknown): item is ConversationCommandQueueItem => {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.input === 'string' &&
    Array.isArray(candidate.files) &&
    candidate.files.every((file) => typeof file === 'string') &&
    typeof candidate.createdAt === 'number'
  );
};

export const normalizeQueueState = (state: unknown): ConversationCommandQueueState => {
  if (!state || typeof state !== 'object') {
    return createDefaultQueueState();
  }

  const candidate = state as Partial<ConversationCommandQueueState>;
  const items = Array.isArray(candidate.items) ? candidate.items.filter(isQueueItem) : [];

  return {
    items,
    isPaused: items.length > 0 ? Boolean(candidate.isPaused) : false,
  };
};

export const estimateQueueStateBytes = (state: ConversationCommandQueueState): number =>
  new TextEncoder().encode(JSON.stringify(normalizeQueueState(state))).length;

export const createQueuedCommandItem = ({
  input,
  files,
}: Pick<ConversationCommandQueueItem, 'input' | 'files'>): ConversationCommandQueueItem => ({
  id: uuid(),
  input,
  files: uniqueFiles(files),
  createdAt: Date.now(),
});

export const validateQueuedCommandItem = (
  item: ConversationCommandQueueItem,
  state: ConversationCommandQueueState
): QueueValidationSuccess | QueueValidationFailure => {
  if (state.items.length >= MAX_QUEUED_COMMANDS) {
    return { ok: false, reason: 'queueFull' };
  }

  if (item.input.length > MAX_QUEUED_COMMAND_INPUT_LENGTH) {
    return { ok: false, reason: 'inputTooLong' };
  }

  if (item.files.length > MAX_QUEUED_COMMAND_FILES) {
    return { ok: false, reason: 'tooManyFiles' };
  }

  const nextState = {
    ...state,
    items: [...state.items, item],
  };
  const nextStateBytes = estimateQueueStateBytes(nextState);
  if (nextStateBytes > MAX_QUEUED_COMMAND_STATE_BYTES) {
    return { ok: false, reason: 'queueTooLarge' };
  }

  return { ok: true, nextStateBytes };
};

const isQueueValidationFailure = (
  validation: QueueValidationSuccess | QueueValidationFailure
): validation is QueueValidationFailure => !validation.ok;

const readPersistedQueueState = (conversationId: string): ConversationCommandQueueState => {
  if (queueStore.has(conversationId)) {
    return queueStore.get(conversationId) ?? createDefaultQueueState();
  }

  if (typeof window === 'undefined') {
    return createDefaultQueueState();
  }

  try {
    const stored = window.sessionStorage.getItem(getStorageKey(conversationId));
    if (!stored) {
      return createDefaultQueueState();
    }

    const parsed = JSON.parse(stored) as unknown;
    const normalized = normalizeQueueState(parsed);
    queueStore.set(conversationId, normalized);
    logCommandQueue(conversationId, 'restored', {
      itemCount: normalized.items.length,
      isPaused: normalized.isPaused,
    });
    return normalized;
  } catch (error) {
    console.warn('[conversation-command-queue] Failed to read persisted queue state:', error);
    return createDefaultQueueState();
  }
};

const removePersistedQueueState = (conversationId: string): void => {
  queueStore.delete(conversationId);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(getStorageKey(conversationId));
    } catch (error) {
      console.warn('[conversation-command-queue] Failed to remove persisted queue state:', error);
    }
  }
};

const persistQueueState = (conversationId: string, state: ConversationCommandQueueState): void => {
  const normalized = normalizeQueueState(state);

  if (normalized.items.length === 0 && !normalized.isPaused) {
    removePersistedQueueState(conversationId);
    return;
  }

  queueStore.set(conversationId, normalized);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(getStorageKey(conversationId), JSON.stringify(normalized));
    } catch (error) {
      console.warn('[conversation-command-queue] Failed to persist queue state:', error);
    }
  }
};

export const removeQueuedCommand = (
  items: ConversationCommandQueueItem[],
  commandId: string
): ConversationCommandQueueItem[] => items.filter((item) => item.id !== commandId);

export const moveQueuedCommand = (
  items: ConversationCommandQueueItem[],
  commandId: string,
  direction: 'up' | 'down'
): ConversationCommandQueueItem[] => {
  const fromIndex = items.findIndex((item) => item.id === commandId);
  if (fromIndex === -1) {
    return items;
  }

  const targetIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  [nextItems[fromIndex], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[fromIndex]];
  return nextItems;
};

export const restoreQueuedCommand = (
  items: ConversationCommandQueueItem[],
  failedItem: ConversationCommandQueueItem
): ConversationCommandQueueItem[] => [failedItem, ...removeQueuedCommand(items, failedItem.id)];

type UseConversationCommandQueueOptions = {
  conversationId: string;
  isBusy: boolean;
  onExecute: (item: ConversationCommandQueueItem) => Promise<void>;
};

type EnqueueCommandInput = Pick<ConversationCommandQueueItem, 'input' | 'files'>;

export const useConversationCommandQueue = ({
  conversationId,
  isBusy,
  onExecute,
}: UseConversationCommandQueueOptions) => {
  const { t } = useTranslation();
  const { data = createDefaultQueueState(), mutate } = useSWR(
    [`/conversation-command-queue/${conversationId}`, conversationId],
    ([, id]) => readPersistedQueueState(id)
  );

  const busyRef = useRef(isBusy);
  const pausedRef = useRef(data.isPaused);
  const waitingForTurnStartRef = useRef(false);

  useEffect(() => {
    busyRef.current = isBusy;
    if (isBusy) {
      waitingForTurnStartRef.current = false;
    }
  }, [isBusy]);

  useEffect(() => {
    pausedRef.current = data.isPaused;
  }, [data.isPaused]);

  const updateState = useCallback(
    (
      updater: (state: ConversationCommandQueueState) => ConversationCommandQueueState
    ): Promise<ConversationCommandQueueState | undefined> => {
      return mutate(
        (current) => {
          const nextState = normalizeQueueState(updater(current ?? createDefaultQueueState()));
          persistQueueState(conversationId, nextState);
          return nextState;
        },
        { revalidate: false }
      );
    },
    [conversationId, mutate]
  );

  const clear = useCallback(() => {
    waitingForTurnStartRef.current = false;
    pausedRef.current = false;
    logCommandQueue(conversationId, 'cleared');
    void updateState(() => createDefaultQueueState());
  }, [conversationId, updateState]);

  useAddEventListener(
    'conversation.deleted',
    (deletedConversationId) => {
      if (deletedConversationId !== conversationId) {
        return;
      }
      clear();
      removePersistedQueueState(conversationId);
    },
    [clear, conversationId]
  );

  const enqueue = useCallback(
    ({ input, files }: EnqueueCommandInput) => {
      const item = createQueuedCommandItem({ input, files });
      const validation = validateQueuedCommandItem(item, data);

      if (isQueueValidationFailure(validation)) {
        const reason: QueueValidationFailureReason = validation.reason;
        logCommandQueue(conversationId, 'enqueue-rejected', {
          reason,
          item: summarizeQueuedCommand(item),
          currentItemCount: data.items.length,
        });
        const warningKeyMap = {
          queueFull: 'conversation.commandQueue.queueFull',
          inputTooLong: 'conversation.commandQueue.inputTooLong',
          tooManyFiles: 'conversation.commandQueue.tooManyFiles',
          queueTooLarge: 'conversation.commandQueue.queueTooLarge',
        } as const;
        const defaultValueMap = {
          queueFull: 'Queue is full. Remove a command before adding more.',
          inputTooLong: 'This queued command is too long. Shorten it before sending.',
          tooManyFiles: 'Too many files are attached to this queued command.',
          queueTooLarge: 'Queue data is too large to persist safely. Remove some queued commands first.',
        } as const;

        Message.warning(
          t(warningKeyMap[reason], {
            count: MAX_QUEUED_COMMANDS,
            files: MAX_QUEUED_COMMAND_FILES,
            defaultValue: defaultValueMap[reason],
          })
        );
        return null;
      }

      logCommandQueue(conversationId, 'enqueued', {
        item: summarizeQueuedCommand(item),
        currentItemCount: data.items.length,
      });
      void updateState((state) => ({
        ...state,
        items: [...state.items, item],
      }));
      return item;
    },
    [data, t, updateState]
  );

  const remove = useCallback(
    (commandId: string) => {
      logCommandQueue(conversationId, 'removed', {
        commandId,
      });
      void updateState((state) => {
        const nextItems = removeQueuedCommand(state.items, commandId);
        return {
          items: nextItems,
          isPaused: nextItems.length > 0 ? state.isPaused : false,
        };
      });
    },
    [conversationId, updateState]
  );

  const moveUp = useCallback(
    (commandId: string) => {
      logCommandQueue(conversationId, 'moved', {
        commandId,
        direction: 'up',
      });
      void updateState((state) => ({
        ...state,
        items: moveQueuedCommand(state.items, commandId, 'up'),
      }));
    },
    [conversationId, updateState]
  );

  const moveDown = useCallback(
    (commandId: string) => {
      logCommandQueue(conversationId, 'moved', {
        commandId,
        direction: 'down',
      });
      void updateState((state) => ({
        ...state,
        items: moveQueuedCommand(state.items, commandId, 'down'),
      }));
    },
    [conversationId, updateState]
  );

  const pause = useCallback(() => {
    pausedRef.current = true;
    logCommandQueue(conversationId, 'paused', {
      itemCount: data.items.length,
    });
    void updateState((state) => {
      if (state.items.length === 0) {
        pausedRef.current = false;
        return createDefaultQueueState();
      }
      return {
        ...state,
        isPaused: true,
      };
    });
  }, [conversationId, data.items.length, updateState]);

  const resume = useCallback(() => {
    pausedRef.current = false;
    logCommandQueue(conversationId, 'resumed', {
      itemCount: data.items.length,
    });
    void updateState((state) => ({
      ...state,
      isPaused: state.items.length > 0 ? false : state.isPaused,
    }));
  }, [conversationId, data.items.length, updateState]);

  useEffect(() => {
    if (pausedRef.current || isBusy || waitingForTurnStartRef.current || data.items.length === 0) {
      return;
    }

    const [nextCommand, ...remainingCommands] = data.items;
    waitingForTurnStartRef.current = true;
    logCommandQueue(conversationId, 'dequeued', {
      item: summarizeQueuedCommand(nextCommand),
      remainingItemCount: remainingCommands.length,
    });
    void updateState(() => ({
      items: remainingCommands,
      isPaused: false,
    }));

    void onExecute(nextCommand)
      .catch((error) => {
        console.error('[conversation-command-queue] Failed to execute queued command:', error);
        logCommandQueue(conversationId, 'execute-failed', {
          item: summarizeQueuedCommand(nextCommand),
          error: error instanceof Error ? error.message : String(error),
        });
        pausedRef.current = true;
        void updateState((state) => ({
          items: restoreQueuedCommand(state.items, nextCommand),
          isPaused: true,
        }));
        Message.warning(
          t('conversation.commandQueue.pausedAfterFailure', {
            defaultValue: 'Queue paused because the next command could not start.',
          })
        );
      })
      .finally(() => {
        setTimeout(() => {
          if (!busyRef.current) {
            logCommandQueue(conversationId, 'dequeue-finished', {
              waitingForTurnStart: false,
              pendingItemCount: data.items.length,
            });
            waitingForTurnStartRef.current = false;
          }
        }, 0);
      });
  }, [conversationId, data.items, isBusy, onExecute, t, updateState]);

  return {
    items: data.items,
    isPaused: data.isPaused,
    hasPendingCommands: data.items.length > 0,
    enqueue,
    remove,
    clear,
    moveUp,
    moveDown,
    pause,
    resume,
  };
};
