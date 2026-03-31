import { uuid } from '@/common/utils';
import { useAddEventListener } from '@/renderer/utils/emitter';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

export type QueueValidationFailureReason =
  | 'emptyInput'
  | 'inputTooLong'
  | 'tooManyFiles'
  | 'queueFull'
  | 'queueTooLarge';

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
const measureQueueStateBytes = (state: ConversationCommandQueueState): number =>
  new TextEncoder().encode(JSON.stringify(state)).length;

const uniqueFiles = (files: string[]): string[] => Array.from(new Set(files.filter(Boolean)));
const isInputEmpty = (input: string): boolean => input.trim().length === 0;

const normalizeQueueItem = (item: unknown): ConversationCommandQueueItem | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const candidate = item as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.input !== 'string' ||
    !Array.isArray(candidate.files) ||
    !candidate.files.every((file) => typeof file === 'string') ||
    typeof candidate.createdAt !== 'number' ||
    !Number.isFinite(candidate.createdAt)
  ) {
    return null;
  }

  const normalizedItem: ConversationCommandQueueItem = {
    id: candidate.id,
    input: candidate.input,
    files: uniqueFiles(candidate.files),
    createdAt: candidate.createdAt,
  };

  if (
    isInputEmpty(normalizedItem.input) ||
    normalizedItem.input.length > MAX_QUEUED_COMMAND_INPUT_LENGTH ||
    normalizedItem.files.length > MAX_QUEUED_COMMAND_FILES
  ) {
    return null;
  }

  return normalizedItem;
};

export const normalizeQueueState = (state: unknown): ConversationCommandQueueState => {
  if (!state || typeof state !== 'object') {
    return createDefaultQueueState();
  }

  const candidate = state as Partial<ConversationCommandQueueState>;
  const normalizedItems = Array.isArray(candidate.items)
    ? candidate.items.map(normalizeQueueItem).filter((item): item is ConversationCommandQueueItem => item !== null)
    : [];
  const items: ConversationCommandQueueItem[] = [];

  for (const item of normalizedItems.slice(0, MAX_QUEUED_COMMANDS)) {
    const nextItems = [...items, item];
    const nextState = {
      items: nextItems,
      isPaused: Boolean(candidate.isPaused),
    };

    if (measureQueueStateBytes(nextState) > MAX_QUEUED_COMMAND_STATE_BYTES) {
      break;
    }

    items.push(item);
  }

  return {
    items,
    isPaused: items.length > 0 ? Boolean(candidate.isPaused) : false,
  };
};

export const estimateQueueStateBytes = (state: ConversationCommandQueueState): number =>
  measureQueueStateBytes(normalizeQueueState(state));

export const createQueuedCommandItem = ({
  input,
  files,
}: Pick<ConversationCommandQueueItem, 'input' | 'files'>): ConversationCommandQueueItem => ({
  id: uuid(),
  input,
  files: uniqueFiles(files),
  createdAt: Date.now(),
});

const getQueueValidationFailureReason = (state: ConversationCommandQueueState): QueueValidationFailureReason | null => {
  if (state.items.length > MAX_QUEUED_COMMANDS) {
    return 'queueFull';
  }

  if (state.items.some((item) => isInputEmpty(item.input))) {
    return 'emptyInput';
  }

  if (state.items.some((item) => item.input.length > MAX_QUEUED_COMMAND_INPUT_LENGTH)) {
    return 'inputTooLong';
  }

  if (state.items.some((item) => item.files.length > MAX_QUEUED_COMMAND_FILES)) {
    return 'tooManyFiles';
  }

  if (measureQueueStateBytes(state) > MAX_QUEUED_COMMAND_STATE_BYTES) {
    return 'queueTooLarge';
  }

  return null;
};

export const validateQueuedCommandItem = (
  item: ConversationCommandQueueItem,
  state: ConversationCommandQueueState
): QueueValidationSuccess | QueueValidationFailure => {
  const nextState = {
    ...state,
    items: [...state.items, item],
  };
  const failureReason = getQueueValidationFailureReason(nextState);
  if (failureReason) {
    return { ok: false, reason: failureReason };
  }
  const nextStateBytes = measureQueueStateBytes(nextState);
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

export const reorderQueuedCommand = (
  items: ConversationCommandQueueItem[],
  activeCommandId: string,
  overCommandId: string
): ConversationCommandQueueItem[] => {
  const fromIndex = items.findIndex((item) => item.id === activeCommandId);
  const targetIndex = items.findIndex((item) => item.id === overCommandId);

  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(targetIndex, 0, movedItem);
  return nextItems;
};

export const restoreQueuedCommand = (
  items: ConversationCommandQueueItem[],
  failedItem: ConversationCommandQueueItem
): ConversationCommandQueueItem[] => [failedItem, ...removeQueuedCommand(items, failedItem.id)];

export const updateQueuedCommand = (
  items: ConversationCommandQueueItem[],
  commandId: string,
  updates: Partial<Pick<ConversationCommandQueueItem, 'input' | 'files'>>
): ConversationCommandQueueItem[] =>
  items.map((item) =>
    item.id === commandId
      ? {
          ...item,
          ...updates,
          files: updates.files ? uniqueFiles(updates.files) : item.files,
        }
      : item
  );

export const shouldEnqueueConversationCommand = ({
  isBusy,
  hasPendingCommands,
}: {
  isBusy: boolean;
  hasPendingCommands: boolean;
}): boolean => isBusy || hasPendingCommands;

type UseConversationCommandQueueOptions = {
  conversationId: string;
  isBusy: boolean;
  isHydrated?: boolean;
  onExecute: (item: ConversationCommandQueueItem) => Promise<void>;
};

type EnqueueCommandInput = Pick<ConversationCommandQueueItem, 'input' | 'files'>;
type UpdateCommandInput = Pick<ConversationCommandQueueItem, 'input'>;

const getQueueValidationMessage = (
  t: (key: string, options?: Record<string, unknown>) => string,
  reason: QueueValidationFailureReason
): string => {
  const warningKeyMap = {
    emptyInput: 'conversation.commandQueue.emptyInput',
    queueFull: 'conversation.commandQueue.queueFull',
    inputTooLong: 'conversation.commandQueue.inputTooLong',
    tooManyFiles: 'conversation.commandQueue.tooManyFiles',
    queueTooLarge: 'conversation.commandQueue.queueTooLarge',
  } as const;
  const defaultValueMap = {
    emptyInput: 'Queued commands cannot be empty.',
    queueFull: 'Queue is full. Remove a command before adding more.',
    inputTooLong: 'This queued command is too long. Shorten it before sending.',
    tooManyFiles: 'Too many files are attached to this queued command.',
    queueTooLarge: 'Queue data is too large to persist safely. Remove some queued commands first.',
  } as const;

  return t(warningKeyMap[reason], {
    count: MAX_QUEUED_COMMANDS,
    files: MAX_QUEUED_COMMAND_FILES,
    defaultValue: defaultValueMap[reason],
  });
};

export const useConversationCommandQueue = ({
  conversationId,
  isBusy,
  isHydrated = true,
  onExecute,
}: UseConversationCommandQueueOptions) => {
  const { t } = useTranslation();
  const { data = createDefaultQueueState(), mutate } = useSWR(
    [`/conversation-command-queue/${conversationId}`, conversationId],
    ([, id]) => readPersistedQueueState(id)
  );

  const stateRef = useRef(data);
  const pausedRef = useRef(data.isPaused);
  const waitingForTurnStartRef = useRef(false);
  const waitingForTurnCompletionRef = useRef(false);
  const interactionLockedRef = useRef(false);
  const [isInteractionLocked, setIsInteractionLocked] = useState(false);
  const [executionGateVersion, setExecutionGateVersion] = useState(0);

  useEffect(() => {
    stateRef.current = data;
  }, [data]);

  useEffect(() => {
    if (waitingForTurnStartRef.current && isBusy) {
      waitingForTurnStartRef.current = false;
      waitingForTurnCompletionRef.current = true;
      logCommandQueue(conversationId, 'turn-started', {
        pendingItemCount: stateRef.current.items.length,
      });
      return;
    }

    if (waitingForTurnCompletionRef.current && !isBusy) {
      waitingForTurnCompletionRef.current = false;
      logCommandQueue(conversationId, 'turn-finished', {
        pendingItemCount: stateRef.current.items.length,
      });
    }
  }, [conversationId, isBusy]);

  useEffect(() => {
    pausedRef.current = data.isPaused;
  }, [data.isPaused]);

  useEffect(() => {
    interactionLockedRef.current = isInteractionLocked;
  }, [isInteractionLocked]);

  const updateState = useCallback(
    (
      updater: (state: ConversationCommandQueueState) => ConversationCommandQueueState
    ): Promise<ConversationCommandQueueState | undefined> => {
      return mutate(
        (current) => {
          const nextState = normalizeQueueState(updater(current ?? createDefaultQueueState()));
          stateRef.current = nextState;
          pausedRef.current = nextState.isPaused;
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
    waitingForTurnCompletionRef.current = false;
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
      const currentState = normalizeQueueState(stateRef.current);
      const item = createQueuedCommandItem({ input, files });
      const validation = validateQueuedCommandItem(item, currentState);

      if (isQueueValidationFailure(validation)) {
        const reason: QueueValidationFailureReason = validation.reason;
        logCommandQueue(conversationId, 'enqueue-rejected', {
          reason,
          item: summarizeQueuedCommand(item),
          currentItemCount: currentState.items.length,
        });
        Message.warning(getQueueValidationMessage(t, reason));
        return null;
      }

      const nextState: ConversationCommandQueueState = {
        ...currentState,
        items: [...currentState.items, item],
      };
      stateRef.current = nextState;
      logCommandQueue(conversationId, 'enqueued', {
        item: summarizeQueuedCommand(item),
        currentItemCount: currentState.items.length,
      });
      void updateState(() => nextState);
      return item;
    },
    [conversationId, t, updateState]
  );

  const update = useCallback(
    (commandId: string, { input }: UpdateCommandInput) => {
      const currentState = normalizeQueueState(stateRef.current);
      const currentItem = currentState.items.find((item) => item.id === commandId);
      if (!currentItem) {
        return false;
      }

      const nextItems = updateQueuedCommand(currentState.items, commandId, { input });
      const nextState: ConversationCommandQueueState = {
        isPaused: false,
        items: nextItems,
      };
      const failureReason = getQueueValidationFailureReason(nextState);

      if (failureReason) {
        logCommandQueue(conversationId, 'update-rejected', {
          reason: failureReason,
          commandId,
          inputLength: input.length,
        });
        Message.warning(getQueueValidationMessage(t, failureReason));
        return false;
      }

      stateRef.current = nextState;
      logCommandQueue(conversationId, 'updated', {
        commandId,
        inputLength: input.length,
      });
      void updateState(() => nextState);
      return true;
    },
    [conversationId, t, updateState]
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
          isPaused: false,
        };
      });
    },
    [conversationId, updateState]
  );

  const reorder = useCallback(
    (activeCommandId: string, overCommandId: string) => {
      logCommandQueue(conversationId, 'reordered', {
        activeCommandId,
        overCommandId,
      });
      void updateState((state) => ({
        isPaused: false,
        items: reorderQueuedCommand(state.items, activeCommandId, overCommandId),
      }));
    },
    [conversationId, updateState]
  );

  const pause = useCallback(() => {
    pausedRef.current = true;
    waitingForTurnStartRef.current = false;
    waitingForTurnCompletionRef.current = false;
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

  const lockInteraction = useCallback(() => {
    interactionLockedRef.current = true;
    logCommandQueue(conversationId, 'interaction-locked', {
      itemCount: stateRef.current.items.length,
    });
    setIsInteractionLocked(true);
  }, [conversationId]);

  const unlockInteraction = useCallback(() => {
    interactionLockedRef.current = false;
    logCommandQueue(conversationId, 'interaction-unlocked', {
      itemCount: stateRef.current.items.length,
    });
    setIsInteractionLocked(false);
  }, [conversationId]);

  const resetActiveExecution = useCallback(
    (reason: 'stop' | 'external-reset') => {
      const hadPendingTurn = waitingForTurnStartRef.current || waitingForTurnCompletionRef.current;
      waitingForTurnStartRef.current = false;
      waitingForTurnCompletionRef.current = false;

      if (!hadPendingTurn) {
        return;
      }

      logCommandQueue(conversationId, 'execution-reset', {
        reason,
        pendingItemCount: stateRef.current.items.length,
      });
      setExecutionGateVersion((version) => version + 1);
    },
    [conversationId]
  );

  useEffect(() => {
    if (
      !isHydrated ||
      pausedRef.current ||
      isBusy ||
      waitingForTurnStartRef.current ||
      waitingForTurnCompletionRef.current ||
      interactionLockedRef.current ||
      data.items.length === 0
    ) {
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

    void onExecute(nextCommand).catch((error) => {
      console.error('[conversation-command-queue] Failed to execute queued command:', error);
      logCommandQueue(conversationId, 'execute-failed', {
        item: summarizeQueuedCommand(nextCommand),
        error: error instanceof Error ? error.message : String(error),
      });
      waitingForTurnStartRef.current = false;
      waitingForTurnCompletionRef.current = false;
      pausedRef.current = true;
      void updateState((state) => ({
        items: restoreQueuedCommand(state.items, nextCommand),
        isPaused: true,
      }));
      Message.warning(
        t('conversation.commandQueue.pausedAfterFailure', {
          defaultValue: 'The next queued command could not start. Edit, reorder, or remove it to continue.',
        })
      );
    });
  }, [
    conversationId,
    data.items,
    executionGateVersion,
    isBusy,
    isHydrated,
    isInteractionLocked,
    onExecute,
    t,
    updateState,
  ]);

  return {
    items: data.items,
    isPaused: data.isPaused,
    isInteractionLocked,
    hasPendingCommands: data.items.length > 0,
    enqueue,
    update,
    remove,
    clear,
    reorder,
    pause,
    resume,
    lockInteraction,
    unlockInteraction,
    resetActiveExecution,
  };
};
