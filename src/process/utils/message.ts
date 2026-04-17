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

// Place all messages in a unified update queue based on the conversation
// Ensure that the update mechanism for each message is consistent with the front end, meaning that the database and UI data are in sync
// Aggregate multiple messages for synchronous updates, reducing database operations
class ConversationManageWithDB {
  private stack: Array<['insert' | 'accumulate', TMessage]> = [];
  private dbPromise = getDatabase();
  private timer: NodeJS.Timeout;
  /** Whether a flush is currently in progress (replaces unbounded promise chain) */
  private flushing = false;
  private initialized = false;

  constructor(private conversation_id: string) {
    this.dbPromise
      .then((db) => ensureConversationExists(db, this.conversation_id))
      .then(() => {
        this.initialized = true;
        this.flush();
      })
      .catch(() => {
        this.initialized = true;
      });
  }
  static get(conversation_id: string) {
    if (Cache.has(conversation_id)) return Cache.get(conversation_id);
    const manage = new ConversationManageWithDB(conversation_id);
    Cache.set(conversation_id, manage);
    return manage;
  }

  /** Clear pending timer and discard queued messages so this instance can be GC'd. */
  dispose(): void {
    clearTimeout(this.timer);
    this.stack = [];
  }
  sync(type: 'insert' | 'accumulate', message: TMessage) {
    this.stack.push([type, message]);
    clearTimeout(this.timer);
    if (type === 'insert') {
      this.flush();
      return;
    }
    this.timer = setTimeout(() => {
      this.flush();
    }, 2000);
  }

  private async flush(): Promise<void> {
    if (!this.initialized || this.flushing || this.stack.length === 0) return;
    this.flushing = true;
    try {
      const db = await this.dbPromise;
      const stack = this.stack.splice(0);
      const messages = db.getConversationMessages(this.conversation_id, 0, 50, 'DESC');
      let messageList = messages.data.toReversed();
      for (const [type, msg] of stack) {
        if (type === 'insert') {
          db.insertMessage(msg);
          messageList.push(msg);
        } else {
          messageList = composeMessage(msg, messageList, (opType, message) => {
            if (opType === 'insert') db.insertMessage(message);
            if (opType === 'update') {
              db.updateMessage(message.id, message);
            }
          });
        }
      }
      executePendingCallbacks();
    } catch (err) {
      console.error('[Message] flush error:', err);
    } finally {
      this.flushing = false;
      // If new messages arrived during flush, process them
      if (this.stack.length > 0) {
        this.flush();
      }
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
