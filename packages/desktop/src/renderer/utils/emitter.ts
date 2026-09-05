/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import EventEmitter from 'eventemitter3';
import type { DependencyList } from 'react';
import { useEffect } from 'react';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import type { PreviewContentType } from '@/common/types/office/preview';

export type ReplyQuote = {
  messageId: string;
  content: string;
  position: 'left' | 'right' | 'center' | 'pop';
};

interface EventTypes {
  // Lanes below carry an optional target conversation id: only the consumer
  // whose conversation matches reacts (several conversation views can be
  // mounted at once — team columns today, split columns next — so a bare type
  // prefix alone would leak to same-type peers).
  // `undefined` = no target = any matching consumer accepts (back-compat).
  // An emitter that does not know its own conversation uses the focused one
  // (pages/conversation/hooks/focusedConversationStore).
  'aionrs.selected.file': [Array<string | FileOrFolderItem>, string | undefined];
  'aionrs.selected.file.append': [Array<string | FileOrFolderItem>, string | undefined];
  'aionrs.selected.file.clear': [conversationId?: string];
  'aionrs.workspace.refresh': void;
  'acp.selected.file': [Array<string | FileOrFolderItem>, string | undefined];
  'acp.selected.file.append': [Array<string | FileOrFolderItem>, string | undefined];
  'acp.selected.file.clear': [conversationId?: string];
  'acp.workspace.refresh': void;
  'codex.selected.file': [Array<string | FileOrFolderItem>, string | undefined];
  'codex.selected.file.append': [Array<string | FileOrFolderItem>, string | undefined];
  'codex.selected.file.clear': [conversationId?: string];
  'codex.workspace.refresh': void;
  /**
   * Reload the conversation list. Both listeners today are window-global list
   * views (the sidebar and the chat-history panel), so they refresh on every
   * event; the optional target is carried for a future conversation-scoped
   * listener, which must ignore an event addressed to another conversation.
   */
  'chat.history.refresh': [conversationId?: string];
  // 会话删除事件 / Conversation deletion event
  'conversation.deleted': [string]; // conversation_id
  // 预览面板事件 / Preview panel events
  'preview.open': [
    payload: { content: string; contentType: PreviewContentType; metadata?: { title?: string; file_name?: string } },
    conversationId?: string,
  ];
  // 填充输入框事件 / Fill sendbox input event
  'sendbox.fill': [text: string, conversationId?: string]; // prompt text to fill
  'sendbox.reply': [quote: ReplyQuote, conversationId?: string]; // reply/quote a message
  'sendbox.reply.clear': void; // clear reply quote
  /**
   * Mention a conversation in the send box, target already resolved.
   *
   * Emitted by the conversation chip / delivery badge on an earlier message, so a
   * target that was hard to find once does not have to be found again — the chip
   * carries the id, which also side-steps the ambiguity of twenty conversations
   * sharing a name.
   *
   * Carries the id, NOT just the name: the send box inserts the token AND
   * attaches the reference, because a token with nothing behind it is exactly the
   * silent failure this feature keeps producing.
   *
   * The 2nd arg is the target conversation id, same as the file lanes above: only
   * the send box of that conversation may react.
   */
  'sendbox.mention.session': [{ id: string; name: string }, string | undefined];
}

export const emitter = new EventEmitter<EventTypes>();

export const addEventListener = <T extends EventEmitter.EventNames<EventTypes>>(
  event: T,
  fn: EventEmitter.EventListener<EventTypes, T>
) => {
  emitter.on(event, fn);
  return () => {
    emitter.off(event, fn);
  };
};

export const useAddEventListener = <T extends EventEmitter.EventNames<EventTypes>>(
  event: T,
  fn: EventEmitter.EventListener<EventTypes, T>,
  deps?: DependencyList
) => {
  useEffect(() => {
    return addEventListener(event, fn);
  }, deps || []);
};
