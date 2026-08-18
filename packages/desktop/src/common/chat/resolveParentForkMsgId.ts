/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';

/** Pick fork anchor from an in-memory parent message list (newest by `created_at`). */
export function resolveParentForkMsgIdFromMessages(messages: TMessage[]): string | undefined {
  if (!messages.length) {
    return undefined;
  }
  let newest = messages[0];
  for (const message of messages) {
    if ((message.created_at ?? 0) >= (newest.created_at ?? 0)) {
      newest = message;
    }
  }
  return newest.msg_id ?? newest.id;
}

/**
 * Resolve the fork anchor for a side conversation: the parent's newest message.
 * HEAD-only backends (claude / ACP `session/fork`) only accept the latest
 * message; `at_turn` backends (codex) accept it too, so the newest id is the
 * universally valid anchor. A cursor-less page query returns the latest
 * window, so `limit: 1` yields exactly the newest row.
 */
export async function resolveParentForkMsgId(parentConversationId: string): Promise<string | undefined> {
  const page = await ipcBridge.database.getConversationMessages.invoke({
    conversation_id: parentConversationId,
    limit: 1,
    content_mode: 'compact',
  });
  const items = page?.items ?? [];
  const last = items[items.length - 1];
  return last ? (last.msg_id ?? last.id) : undefined;
}
