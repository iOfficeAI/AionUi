/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';

/** Snapshot reference caps — keep the bootstrap message within a sane size. */
const MAX_TRANSCRIPT_MESSAGES = 40;
const MAX_CHARS_PER_MESSAGE = 2000;

function messageText(message: TMessage): string {
  const content = message.content as unknown;
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    const text = (content as Record<string, unknown>).content;
    if (typeof text === 'string') return text;
  }
  return '';
}

/**
 * Build a one-time read-only reference transcript of the parent conversation
 * for snapshot-mode side children (fork-incapable backends). Text messages
 * only — tool output and thinking blocks carry no reference value and would
 * blow the size cap. Returns '' when the parent has no text messages yet.
 */
export async function loadParentReferenceTranscript(conversationId: string): Promise<string> {
  const page = await ipcBridge.database.getConversationMessages.invoke({
    conversation_id: conversationId,
    limit: 60,
    content_mode: 'compact',
  });
  const items = page?.items ?? [];
  const lines: string[] = [];
  for (const message of items) {
    if (message.type !== 'text') continue;
    const text = messageText(message).trim();
    if (!text) continue;
    const role = message.position === 'right' ? 'user' : 'assistant';
    const clipped = text.length > MAX_CHARS_PER_MESSAGE ? `${text.slice(0, MAX_CHARS_PER_MESSAGE)}…` : text;
    lines.push(`[${role}] ${clipped}`);
  }
  const recent = lines.slice(-MAX_TRANSCRIPT_MESSAGES);
  return recent.join('\n\n');
}
