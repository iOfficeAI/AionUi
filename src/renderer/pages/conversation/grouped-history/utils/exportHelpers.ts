/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import type { IDirOrFile } from '@/common/ipcBridge';
import type { TChatConversation } from '@/common/storage';

import type { ExportZipFile } from '../types';

export const INVALID_FILENAME_CHARS_RE = /[<>:"/\\|?*]/g;
export const EXPORT_IO_TIMEOUT_MS = 15000;

export const sanitizeFileName = (name: string): string => {
  const cleaned = name.replace(INVALID_FILENAME_CHARS_RE, '_').trim();
  return (cleaned || 'conversation').slice(0, 80);
};

export const joinFilePath = (dir: string, fileName: string): string => {
  const separator = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${fileName}` : `${dir}${separator}${fileName}`;
};

export const formatTimestamp = (time = Date.now()): string => {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

export const normalizeZipPath = (value: string): string => value.replace(/\\/g, '/').replace(/^\/+/, '');

export const buildTopicFolderName = (conversation: TChatConversation): string => {
  const safeName = sanitizeFileName(conversation.name || conversation.id);
  return `${safeName}__${conversation.id}`;
};

export const appendWorkspaceFilesToZip = (files: ExportZipFile[], root: IDirOrFile | undefined, prefix: string): void => {
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

export const readMessageContent = (message: TMessage): string => {
  const content = message.content as Record<string, unknown> | string | undefined;

  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object' && typeof content.content === 'string') {
    return content.content;
  }

  try {
    return JSON.stringify(content ?? {}, null, 2);
  } catch {
    return String(content ?? '');
  }
};

export const getMessageRoleLabel = (message: TMessage): string => {
  if (message.position === 'right') return 'User';
  if (message.position === 'left') return 'Assistant';
  return 'System';
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
    lines.push(`### ${index + 1}. ${getMessageRoleLabel(message)} (${message.type})`);
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
