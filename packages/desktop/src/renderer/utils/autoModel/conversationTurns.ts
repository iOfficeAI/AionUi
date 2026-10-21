/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';

/** Whether the conversation already has at least one user text turn in history. */
export const conversationHasUserTurns = (messages: TMessage[]): boolean =>
  messages.some((message) => message.type === 'text' && message.position === 'right');
