/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';

/**
 * Slice a side child's message list to its own turns: everything up to and
 * including the fork boundary (the last row copied from the parent) is hidden
 * so the docked thread starts visually fresh while the backend session keeps
 * the full forked context.
 *
 * When the boundary is older than the loaded window (many side turns sent
 * since), every loaded row is a side turn and the list returns unchanged;
 * `undefined` boundary means no hiding at all.
 */
export function messagesAfterForkBoundary(messages: TMessage[], boundaryMsgId: string | undefined): TMessage[] {
  if (!boundaryMsgId) return messages;
  const boundaryIndex = messages.findIndex(
    (message) => message.msg_id === boundaryMsgId || message.id === boundaryMsgId
  );
  if (boundaryIndex === -1) return messages;
  return messages.slice(boundaryIndex + 1);
}
