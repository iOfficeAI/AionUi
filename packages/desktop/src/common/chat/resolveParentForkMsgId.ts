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

/** Resolve fork point for side conversation (newest parent message id). */
export async function resolveParentForkMsgId(parentConversationId: string): Promise<string | undefined> {
  const result = await ipcBridge.database.getConversationMessages.invoke({
    conversation_id: parentConversationId,
    limit: 1,
    content_mode: 'compact',
  });
  return resolveParentForkMsgIdFromMessages(result?.items ?? []);
}
