/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage, IMessageText } from '@/common/chatLib';
import type { TChatConversation } from '@/common/storage';
import { composeMessage } from '@/common/chatLib';
import { getDatabase } from './database/export';
import { ProcessChat } from './initStorage';
import { streamingBuffer } from './database/StreamingMessageBuffer';
import type { AcpBackend } from '@/types/acpTypes';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';

/**
 * Add a new message to the database
 * Wraps async work inside an IIFE to keep call sites synchronous.
 */
export const addMessage = (conversation_id: string, message: TMessage): void => {
  void (async () => {
    try {
      const db = getDatabase();

      // Ensure conversation exists in database
      await ensureConversationExists(db, conversation_id);

      const result = db.insertMessage(message);
      if (!result.success) {
        console.error('[Message] Insert failed:', result.error);
        console.error('[Message] Message data:', JSON.stringify(message, null, 2));
      } else {
        db.updateConversation(conversation_id, {} as Partial<TChatConversation>);
      }
      // Execute pending callbacks after operation completes
      executePendingCallbacks();
    } catch (error) {
      console.error('[Message] Failed to add message:', error);
      // Execute pending callbacks even on error
      executePendingCallbacks();
    }
  })();
};

/**
 * Update messages in the database using a transform function
 * This loads all messages, applies the transform, and saves them back
 */
export const updateMessage = (conversation_id: string, transform: (messages: TMessage[]) => TMessage[]): void => {
  try {
    const db = getDatabase();

    // Get all messages for this conversation
    const result = db.getConversationMessages(conversation_id, 0, 10000);
    if (!result.data || result.data.length === 0) {
      console.warn('[Message] No messages found for conversation:', conversation_id);
      executePendingCallbacks();
      return;
    }

    // Apply the transform
    const updatedMessages = transform(result.data);

    // Find what changed and update only those messages
    const messageMap = new Map(result.data.map((m) => [m.id, m]));

    for (const updated of updatedMessages) {
      const original = messageMap.get(updated.id);

      if (!original) {
        // New message - insert it
        db.insertMessage(updated);
      } else if (JSON.stringify(original) !== JSON.stringify(updated)) {
        // Message changed - update it
        db.updateMessage(updated.id, updated);
      }
    }

    // Handle deleted messages (if any were removed by transform)
    const updatedIds = new Set(updatedMessages.map((m) => m.id));
    for (const original of result.data) {
      if (!updatedIds.has(original.id)) {
        db.deleteMessage(original.id);
      }
    }

    // Execute pending callbacks after operation completes
    executePendingCallbacks();
  } catch (error) {
    console.error('[Message] Failed to update messages:', error);
    // Execute pending callbacks even on error
    executePendingCallbacks();
    throw error;
  }
};

/**
 * Ensure conversation exists in database
 * If not, load from file storage and create it
 */
async function ensureConversationExists(db: ReturnType<typeof getDatabase>, conversation_id: string): Promise<void> {
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
export const addOrUpdateMessage = (conversation_id: string, message: TMessage, backend?: AcpBackend): void => {
  // Validate message
  if (!message) {
    console.error('[Message] Cannot add or update undefined message');
    return;
  }

  if (!message.id) {
    console.error('[Message] Message missing required id field:', message);
    return;
  }

  void (async () => {
    try {
      const db = getDatabase();
      // Ensure conversation exists in database
      await ensureConversationExists(db, conversation_id);
      if (message.type === 'text' && message.msg_id) {
        const incomingMsg = message as IMessageText;
        const content = incomingMsg.content.content;
        const messageId = message.msg_id || '';
        streamingBuffer.append(message.id, messageId, conversation_id, content, backend ? 'accumulate' : ACP_BACKENDS_ALL[backend].supportsStreaming ? 'accumulate' : 'replace');
      } else if (message.type === 'tool_group' || message.type === 'tool_call' || message.type === 'codex_tool_call' || message.type === 'acp_tool_call') {
        // Complex message types that need composeMessage logic
        // These are less frequent, so loading all messages of this type is acceptable
        const result = db.getConversationMessages(conversation_id, 0, 10000);
        const existingMessages = result.data || [];

        // Filter to only messages of the same type (optimization)
        const sameTypeMessages = existingMessages.filter((m) => m.type === message.type);

        // Use composeMessage to merge
        const composedList = composeMessage(message, sameTypeMessages.slice());

        // Find what changed
        if (composedList.length > sameTypeMessages.length) {
          // New messages added
          const newMessages = composedList.slice(sameTypeMessages.length);
          for (const newMsg of newMessages) {
            const insertResult = db.insertMessage(newMsg);
            if (!insertResult.success) {
              console.error('[Message] Insert failed:', insertResult.error);
            }
          }
        } else {
          // Messages updated in-place
          for (let i = 0; i < composedList.length; i++) {
            const original = sameTypeMessages[i];
            const composed = composedList[i];

            if (JSON.stringify(original) !== JSON.stringify(composed)) {
              const updateResult = db.updateMessage(composed.id, composed);
              if (!updateResult.success) {
                console.error('[Message] Update failed:', updateResult.error);
              }
            }
          }
        }
      } else {
        // Other message types (status, tips, etc.) - usually don't need merging
        // Just insert or update based on msg_id if available
        if (message.msg_id) {
          const existing = db.getMessageByMsgId(conversation_id, message.msg_id);
          if (existing.success && existing.data) {
            // Update existing
            const updateResult = db.updateMessage(existing.data.id, message);
            if (!updateResult.success) {
              console.error('[Message] Update failed:', updateResult.error);
            }
          } else {
            // Insert new
            const insertResult = db.insertMessage(message);
            if (!insertResult.success) {
              console.error('[Message] Insert failed:', insertResult.error);
            }
          }
        } else {
          // No msg_id - always insert as new
          const insertResult = db.insertMessage(message);
          if (!insertResult.success) {
            console.error('[Message] Insert failed:', insertResult.error);
          }
        }
      }

      // Execute pending callbacks after operation completes
      executePendingCallbacks();
    } catch (error) {
      console.error('[Message] Failed to add or update message:', error);
      // Execute pending callbacks even on error
      executePendingCallbacks();
    }
  })();
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
