/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AIONUI_SESSION_MESSAGE_END_MARKER,
  AIONUI_SESSION_MESSAGE_MARKER,
  AIONUI_SESSIONS_END_MARKER,
  AIONUI_SESSIONS_MARKER,
} from '@/common/config/constants';

export type SessionMentionChip = {
  name: string;
  id: string;
  workspace: string;
};

export type SessionDeliverySource = {
  fromName: string;
  fromId: string;
  workspace: string;
  replyTo: string;
};

/**
 * Locate a marker-delimited block and return the text with it removed.
 *
 * A missing closing marker returns `null` so the caller renders the original
 * content untouched: showing a stray marker line is ugly, but swallowing the
 * user's message is data loss.
 */
function extractBlock(
  content: string,
  startMarker: string,
  endMarker: string
): { body: string[]; text: string } | null {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) return null;
  const endIndex = content.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex === -1) return null;

  const inner = content.slice(startIndex + startMarker.length, endIndex);
  const before = content.slice(0, startIndex);
  const after = content.slice(endIndex + endMarker.length);
  return {
    body: inner
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    text: `${before}${after}`.trim(),
  };
}

/**
 * Sender side: reverse the `[[AION_SESSIONS]]` block the backend appended to the
 * user's own message so the bubble shows chips instead of raw markers.
 */
export function parseSessionsBlock(content: string): { text: string; sessions: SessionMentionChip[] } {
  const block = extractBlock(content, AIONUI_SESSIONS_MARKER, AIONUI_SESSIONS_END_MARKER);
  if (!block) return { text: content, sessions: [] };

  const sessions: SessionMentionChip[] = [];
  for (const line of block.body) {
    // `name \t id \t workspace: VALUE`
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [name, id, workspaceField] = parts;
    if (!name || !id) continue;
    sessions.push({
      name,
      id,
      workspace: workspaceField.replace(/^workspace:\s*/, ''),
    });
  }
  return { text: block.text, sessions };
}

/**
 * Recipient side: reverse the `[[AION_SESSION_MESSAGE]]` block so the bubble can
 * show a "from conversation X" badge. Same content the agent read — one source
 * of truth, no artifact (spec §5.6).
 */
export function parseSessionMessageBlock(content: string): { text: string; source: SessionDeliverySource | null } {
  const block = extractBlock(content, AIONUI_SESSION_MESSAGE_MARKER, AIONUI_SESSION_MESSAGE_END_MARKER);
  if (!block) return { text: content, source: null };

  let fromName = '';
  let fromId = '';
  let workspace = '';
  let replyTo = '';
  for (const line of block.body) {
    if (line.startsWith('from: ')) {
      const [name, id] = line.slice('from: '.length).split('\t');
      fromName = name ?? '';
      fromId = id ?? '';
    } else if (line.startsWith('workspace: ')) {
      workspace = line.slice('workspace: '.length);
    } else if (line.startsWith('reply_to: ')) {
      // The value is followed by a tab and the short reply hint meant for the
      // agent; the UI only needs the address.
      replyTo = line.slice('reply_to: '.length).split('\t')[0] ?? '';
    }
  }

  if (!fromId) {
    // Present but unparseable — treat as an ordinary message rather than
    // rendering an empty badge.
    return { text: content, source: null };
  }

  return { text: block.text, source: { fromName, fromId, workspace, replyTo } };
}
