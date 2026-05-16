/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import { getMessageRoleKey, readMessageContent, sanitizeFileName } from '@/renderer/utils/chat/conversationExport';

import type { ExportZipFile } from '../types';

export const EXPORT_IO_TIMEOUT_MS = 15000;

export const normalizeZipPath = (value: string): string => value.replace(/\\/g, '/').replace(/^\/+/, '');

export const buildTopicFolderName = (conversation: TChatConversation): string => {
  const safeName = sanitizeFileName(conversation.name || conversation.id);
  return `${safeName}__${conversation.id}`;
};

export const appendWorkspaceFilesToZip = (
  files: ExportZipFile[],
  root: IDirOrFile | undefined,
  prefix: string
): void => {
  if (!root?.children || root.children.length === 0) {
    return;
  }

  const walk = (node: IDirOrFile) => {
    if (node.isFile) {
      const relativePath = normalizeZipPath(node.relativePath || node.name);
      if (relativePath) {
        files.push({
          name: `${prefix}/workspace/${relativePath}`,
          sourcePath: node.fullPath,
        });
      }
      return;
    }
    node.children?.forEach((child) => walk(child));
  };

  root.children.forEach((child) => walk(child));
};

export const getBackendKeyFromConversation = (conversation: TChatConversation): string | undefined => {
  if (conversation.type === 'acp') {
    return conversation.extra?.backend;
  }
  if (conversation.type === 'openclaw-gateway') {
    return conversation.extra?.backend || 'openclaw-gateway';
  }
  if (conversation.type === 'remote') {
    return 'remote';
  }
  return conversation.type;
};

export const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timeout`));
      }, timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const getMarkdownMessageRoleLabel = (message: TMessage): string => {
  switch (getMessageRoleKey(message)) {
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
  }
};

export const buildConversationMarkdown = (conversation: TChatConversation, messages: TMessage[]): string => {
  const lines: string[] = [];
  lines.push(`# ${conversation.name || 'Conversation'}`);
  lines.push('');
  lines.push(`- Conversation ID: ${conversation.id}`);
  lines.push(`- Exported At: ${new Date().toISOString()}`);
  lines.push(`- Type: ${conversation.type}`);
  lines.push('');
  lines.push('## Messages');
  lines.push('');

  messages.forEach((message, index) => {
    lines.push(`### ${index + 1}. ${getMarkdownMessageRoleLabel(message)} (${message.type})`);
    lines.push('');
    lines.push('```text');
    lines.push(readMessageContent(message));
    lines.push('```');
    lines.push('');
  });

  return lines.join('\n');
};

export const buildConversationJson = (conversation: TChatConversation, messages: TMessage[]): string => {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      conversation,
      messages,
    },
    null,
    2
  );
};
