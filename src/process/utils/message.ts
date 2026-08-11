/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { composeMessage } from '@/common/chat/chatLib';
import type { AgentBackend } from '@/common/types/acpTypes';
import { getDatabase } from '../services/database/export';
import { ProcessChat } from './initStorage';

const Cache = new Map<string, ConversationManageWithDB>();
const MESSAGE_CACHE_IDLE_RELEASE_MS = 60000;
const MESSAGE_CACHE_STREAM_FLUSH_MS = 250;
const MESSAGE_CACHE_MAX_PENDING_OPERATIONS = 200;

type ReleaseConversationMessageCacheOptions = {
  persistPending?: boolean;
};

// Place all messages in a unified update queue based on the conversation
// Ensure that the update mechanism for each message is consistent with the front end, meaning that the database and UI data are in sync
// Aggregate multiple messages for synchronous updates, reducing database operations
class ConversationManageWithDB {
  private stack: Array<['insert' | 'accumulate', TMessage]> = [];
  private readonly dbPromise = getDatabase();
  private readonly initializationPromise: Promise<void>;
  private timer?: NodeJS.Timeout;
  private releaseTimer?: NodeJS.Timeout;
  private activeFlushPromise?: Promise<void>;
  private lastActivityAt = Date.now();

  constructor(private conversation_id: string) {
    this.initializationPromise = this.dbPromise
      .then((db) => ensureConversationExists(db, this.conversation_id))
      .catch((): void => {});
  }

  static get(conversation_id: string) {
    if (Cache.has(conversation_id)) return Cache.get(conversation_id);
    const manage = new ConversationManageWithDB(conversation_id);
    Cache.set(conversation_id, manage);
    return manage;
  }

  /** Clear pending timer and discard queued messages so this instance can be GC'd. */
  dispose(): void {
    this.clearFlushTimer();
    this.clearReleaseTimer();
    this.stack = [];
  }
  sync(type: 'insert' | 'accumulate', message: TMessage) {
    this.lastActivityAt = Date.now();
    this.clearReleaseTimer();
    this.stack.push([type, message]);

    if (type === 'insert' || this.stack.length >= MESSAGE_CACHE_MAX_PENDING_OPERATIONS) {
      void this.flush();
      return;
    }

    this.scheduleFlush();
  }

  flush(): Promise<void> {
    this.clearFlushTimer();

    if (this.stack.length === 0) {
      return this.activeFlushPromise ?? Promise.resolve();
    }

    if (this.activeFlushPromise) {
      return this.activeFlushPromise;
    }

    this.activeFlushPromise = this.runFlushLoop().finally(() => {
      this.activeFlushPromise = undefined;

      if (this.stack.length > 0) {
        void this.flush();
        return;
      }

      this.scheduleReleaseIfIdle();
    });

    return this.activeFlushPromise;
  }

  async release(options: ReleaseConversationMessageCacheOptions = {}): Promise<void> {
    this.clearFlushTimer();
    this.clearReleaseTimer();

    if (options.persistPending) {
      await this.flush();
      this.clearReleaseTimer();
    } else {
      this.stack = [];
    }

    Cache.delete(this.conversation_id);
  }

  getDebugState(): {
    conversationId: string;
    pendingOperations: number;
    hasFlushTimer: boolean;
    hasReleaseTimer: boolean;
    lastActivityAt: number;
  } {
    return {
      conversationId: this.conversation_id,
      pendingOperations: this.stack.length,
      hasFlushTimer: Boolean(this.timer),
      hasReleaseTimer: Boolean(this.releaseTimer),
      lastActivityAt: this.lastActivityAt,
    };
  }

  private scheduleReleaseIfIdle(): void {
    this.clearReleaseTimer();

    if (this.stack.length > 0) {
      return;
    }

    const releaseAt = this.lastActivityAt + MESSAGE_CACHE_IDLE_RELEASE_MS;
    const delay = Math.max(releaseAt - Date.now(), 0);
    this.releaseTimer = setTimeout(() => {
      if (this.stack.length === 0 && Date.now() - this.lastActivityAt >= MESSAGE_CACHE_IDLE_RELEASE_MS) {
        Cache.delete(this.conversation_id);
      }
    }, delay);
  }

  private scheduleFlush(): void {
    if (this.timer) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, MESSAGE_CACHE_STREAM_FLUSH_MS);
  }

  private clearFlushTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private clearReleaseTimer(): void {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = undefined;
    }
  }

  private async runFlushLoop(): Promise<void> {
    try {
      await this.initializationPromise;
      const db = await this.dbPromise;

      while (this.stack.length > 0) {
        const stack = this.stack.splice(0);
        const messages = db.getConversationMessages(this.conversation_id, 0, 50, 'DESC');
        let messageList = messages.data.toReversed();

        for (const [type, message] of stack) {
          if (type === 'insert') {
            db.insertMessage(message);
            messageList.push(message);
            continue;
          }

          messageList = composeMessage(message, messageList, (opType, updatedMessage) => {
            if (opType === 'insert') db.insertMessage(updatedMessage);
            if (opType === 'update') {
              db.updateMessage(updatedMessage.id, updatedMessage);
            }
          });
        }

        executePendingCallbacks();
      }
    } catch (err) {
      console.error('[Message] flush error:', err);
    }
  }
}

/**
 * Add a new message to the database
 * Wraps async work inside an IIFE to keep call sites synchronous.
 */
export const addMessage = (conversation_id: string, message: TMessage): void => {
  ConversationManageWithDB.get(conversation_id).sync('insert', message);
};

/**
 * Remove a conversation's message queue from the in-memory cache.
 * Call this when a conversation is deleted to prevent memory leaks.
 */
export const removeFromMessageCache = (conversation_id: string): void => {
  const cached = Cache.get(conversation_id);
  if (cached) {
    cached.dispose();
    Cache.delete(conversation_id);
  }
};

/**
 * Ensure conversation exists in database
 * If not, load from file storage and create it
 */
async function ensureConversationExists(
  db: Awaited<ReturnType<typeof getDatabase>>,
  conversation_id: string
): Promise<void> {
  // Check if conversation exists in database
  const existingConv = db.getConversation(conversation_id);
  if (existingConv.success && existingConv.data) {
    return; // Conversation already exists
  }

  // Load conversation from file storage
  const history = await ProcessChat.get('chat.history');
  const conversation = (history || []).find((c) => c.id === conversation_id);

  if (!conversation) {
    console.error(`[Message] Conversation ${conversation_id} not found in file storage either`);
    return;
  }

  // Create conversation in database
  const result = db.createConversation(conversation);
  if (!result.success) {
    console.error(`[Message] Failed to create conversation in database:`, result.error);
  }
}

/**
 * Add or update a single message
 * If message exists (by id), update it; otherwise insert it
 */
export const addOrUpdateMessage = (conversation_id: string, message: TMessage, backend?: AgentBackend): void => {
  // Validate message
  if (!message) {
    console.error('[Message] Cannot add or update undefined message');
    return;
  }

  if (!message.id) {
    console.error('[Message] Message missing required id field:', message);
    return;
  }

  ConversationManageWithDB.get(conversation_id).sync('accumulate', message);
};

export const flushConversationMessages = (conversation_id: string): Promise<void> => {
  const manage = Cache.get(conversation_id);
  if (!manage) {
    return Promise.resolve();
  }
  return manage.flush();
};

export const releaseConversationMessageCache = (
  conversation_id: string,
  options?: ReleaseConversationMessageCacheOptions
): Promise<void> => {
  const manage = Cache.get(conversation_id);
  if (!manage) {
    return Promise.resolve();
  }

  return manage.release(options);
};

export const getConversationMessageCacheStats = (): {
  size: number;
  conversations: Array<{
    conversationId: string;
    pendingOperations: number;
    hasFlushTimer: boolean;
    hasReleaseTimer: boolean;
    lastActivityAt: number;
  }>;
} => {
  const conversations = Array.from(Cache.values()).map((manage) => manage.getDebugState());

  return {
    size: Cache.size,
    conversations,
  };
};

/**
 * Execute a callback after the next async operation completes
 * Note: With direct database operations, this executes immediately after the pending operation
 */
const pendingCallbacks: Array<() => void> = [];

export const nextTickToLocalFinish = (fn: () => void): void => {
  pendingCallbacks.push(fn);
};

/**
 * Execute all pending callbacks
 */
export const executePendingCallbacks = (): void => {
  while (pendingCallbacks.length > 0) {
    const callback = pendingCallbacks.shift();
    if (callback) {
      try {
        callback();
      } catch (error) {
        console.error('[Message] Error in pending callback:', error);
      }
    }
  }
};

/**
 * @deprecated This function is no longer needed with direct database operations
 */
export const nextTickToLocalRunning = (_fn: (list: TMessage[]) => TMessage[]): void => {
  console.warn('[Message] nextTickToLocalRunning is deprecated with database storage');
};
