/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import EventEmitter from 'eventemitter3';
import type { DependencyList } from 'react';
import { useEffect } from 'react';
import type { TChatConversation } from '@/common/config/storage';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import type { PreviewContentType } from '@/common/types/office/preview';

export type ReplyQuote = {
  messageId: string;
  content: string;
  position: 'left' | 'right' | 'center' | 'pop';
};

/**
 * Conversation backends that participate in the Workspace event protocol.
 *
 * Derived from `TChatConversation['type']` so any new conversation type
 * that ships a workspace automatically gets the corresponding
 * `*.selected.file` / `*.workspace.refresh` events wired up.
 */
type WorkspaceBackendPrefix = TChatConversation['type'];

/**
 * Per-backend workspace event names, generated from
 * `WorkspaceBackendPrefix` so we don't have to hand-maintain a list that
 * drifts from the conversation-type union. Each prefix produces the
 * same four events.
 */
type WorkspaceBackendEvents = {
  [P in WorkspaceBackendPrefix]:
    | `${P}.selected.file`
    | `${P}.selected.file.append`
    | `${P}.selected.file.clear`
    | `${P}.workspace.refresh`;
}[WorkspaceBackendPrefix];

/**
 * Map a workspace event name to its payload type. Every
 * `*.selected.file` and `*.selected.file.append` event carries a
 * file/folder list; `*.selected.file.clear` and `*.workspace.refresh`
 * are fire-and-forget.
 */
type WorkspaceEventPayload<E extends WorkspaceBackendEvents> = E extends
  | `${string}.selected.file.clear`
  | `${string}.workspace.refresh`
  ? void
  : [Array<string | FileOrFolderItem>];

type EventTypes = {
  'chat.history.refresh': void;
  // 会话删除事件 / Conversation deletion event
  'conversation.deleted': [string]; // conversation_id
  // 预览面板事件 / Preview panel events
  'preview.open': [
    { content: string; contentType: PreviewContentType; metadata?: { title?: string; file_name?: string } },
  ];
  // 填充输入框事件 / Fill sendbox input event
  'sendbox.fill': [string]; // prompt text to fill
  'sendbox.reply': [ReplyQuote]; // reply/quote a message
  'sendbox.reply.clear': void; // clear reply quote
  'staroffice.install.request': [{ conversation_id: string; text: string; detectedUrl?: string | null }];
  'staroffice.install.finished': [{ conversation_id: string }];
} & {
  [E in WorkspaceBackendEvents]: WorkspaceEventPayload<E>;
};

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
