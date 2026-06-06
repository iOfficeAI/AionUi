import { ipcBridge } from '@/common';

export type WarmupConversationPhase = 'idle' | 'preparing' | 'ready' | 'error';

export type WarmupConversationStatus = {
  phase: WarmupConversationPhase;
  attempt: number;
  errorMessage?: string;
};

const IDLE_STATUS: WarmupConversationStatus = {
  phase: 'idle',
  attempt: 0,
};

const warmupByConversation = new Map<string, Promise<void>>();
const statusByConversation = new Map<string, WarmupConversationStatus>();
const listenersByConversation = new Map<string, Set<() => void>>();

function emitWarmupStatus(conversation_id: string): void {
  listenersByConversation.get(conversation_id)?.forEach((listener) => listener());
}

function setWarmupStatus(conversation_id: string, status: WarmupConversationStatus): void {
  statusByConversation.set(conversation_id, status);
  emitWarmupStatus(conversation_id);
}

export function getWarmupConversationStatus(conversation_id?: string): WarmupConversationStatus {
  if (!conversation_id) {
    return IDLE_STATUS;
  }
  return statusByConversation.get(conversation_id) ?? IDLE_STATUS;
}

export function subscribeWarmupConversation(conversation_id: string, listener: () => void): () => void {
  const listeners = listenersByConversation.get(conversation_id) ?? new Set<() => void>();
  listeners.add(listener);
  listenersByConversation.set(conversation_id, listeners);

  return () => {
    const current = listenersByConversation.get(conversation_id);
    if (!current) {
      return;
    }
    current.delete(listener);
    if (current.size === 0) {
      listenersByConversation.delete(conversation_id);
    }
  };
}

export function warmupConversation(conversation_id: string): Promise<void> {
  const existing = warmupByConversation.get(conversation_id);
  if (existing) {
    return existing;
  }

  const previous = getWarmupConversationStatus(conversation_id);
  if (previous.phase === 'ready') {
    return Promise.resolve();
  }
  const nextAttempt = previous.attempt + 1;
  setWarmupStatus(conversation_id, {
    phase: 'preparing',
    attempt: nextAttempt,
  });

  const promise = ipcBridge.conversation.warmup
    .invoke({ conversation_id })
    .then(() => {
      setWarmupStatus(conversation_id, {
        phase: 'ready',
        attempt: nextAttempt,
      });
    })
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setWarmupStatus(conversation_id, {
        phase: 'error',
        attempt: nextAttempt,
        errorMessage,
      });
      throw error;
    })
    .finally(() => {
      warmupByConversation.delete(conversation_id);
    });

  warmupByConversation.set(conversation_id, promise);
  return promise;
}

export function resetWarmupConversationStateForTests(): void {
  warmupByConversation.clear();
  statusByConversation.clear();
  listenersByConversation.clear();
}
