/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import EventEmitter from 'eventemitter3';
import type { DependencyList } from 'react';
import { useEffect } from 'react';
import type { FileOrFolderItem } from '@/renderer/types/files';
import type { PreviewContentType } from '@/common/types/preview';

interface EventTypes {
  'gemini.selected.file': [Array<string | FileOrFolderItem>];
  'gemini.selected.file.append': [Array<string | FileOrFolderItem>];
  'gemini.selected.file.clear': void;
  'gemini.workspace.refresh': void;
  'acp.selected.file': [Array<string | FileOrFolderItem>];
  'acp.selected.file.append': [Array<string | FileOrFolderItem>];
  'acp.selected.file.clear': void;
  'acp.workspace.refresh': void;
  'codex.selected.file': [Array<string | FileOrFolderItem>];
  'codex.selected.file.append': [Array<string | FileOrFolderItem>];
  'codex.selected.file.clear': void;
  'codex.workspace.refresh': void;
  'chat.history.refresh': void;
  // 会话删除事件 / Conversation deletion event
  'conversation.deleted': [string]; // conversationId
  // 预览面板事件 / Preview panel events
  'preview.open': [{ content: string; contentType: PreviewContentType; metadata?: { title?: string; fileName?: string } }];
}

export const emitter = new EventEmitter<EventTypes>();

export const addEventListener = <T extends EventEmitter.EventNames<EventTypes>>(event: T, fn: EventEmitter.EventListener<EventTypes, T>) => {
  emitter.on(event, fn);
  return () => {
    emitter.off(event, fn);
  };
};

export const useAddEventListener = <T extends EventEmitter.EventNames<EventTypes>>(event: T, fn: EventEmitter.EventListener<EventTypes, T>, deps?: DependencyList) => {
  useEffect(() => {
    return addEventListener(event, fn);
  }, deps || []);
};
