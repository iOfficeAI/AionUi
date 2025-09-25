/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { conversation } from '@/common/ipcBridge';
import type { IMessageToolGroup, IMessageCodexPermission } from '@/common/chatLib';

// Shared interface for confirmation data
export interface ConfirmationData {
  confirmKey: string;
  msg_id: string;
  conversation_id: string;
  callId: string;
}

/**
 * Common function to handle message confirmation for both tool groups and codex permissions
 */
export const handleConfirmation = async (data: ConfirmationData): Promise<{ success: boolean; error?: string }> => {
  try {
    const result = await conversation.confirmMessage.invoke(data);
    return { success: true, error: undefined };
  } catch (error) {
    console.error('Confirm failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

/**
 * Generates a stable permission ID based on tool call characteristics
 */
export const generateGlobalPermissionId = (toolCall?: { kind?: string; title?: string; rawInput?: { command?: string | string[] } }) => {
  // 构建权限请求的特征字符串
  const features = [toolCall?.kind || 'permission', toolCall?.title || '', toolCall?.rawInput?.command || ''];

  const featureString = features.filter(Boolean).join('|');

  // 生成稳定的哈希
  let hash = 0;
  for (let i = 0; i < featureString.length; i++) {
    const char = featureString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32位整数
  }

  return `codex_perm_${Math.abs(hash)}`;
};

/**
 * Gets appropriate icon based on tool kind
 */
export const getToolIcon = (kind?: string): string => {
  const kindIcons: Record<string, string> = {
    edit: '✏️',
    read: '📖',
    fetch: '🌐',
    execute: '⚡',
  };

  return kindIcons[kind || 'execute'] || '⚡';
};

/**
 * Creates storage keys for permission persistence
 */
export const getPermissionStorageKeys = (permissionId: string) => {
  const storageKey = `codex_global_permission_choice_${permissionId}`;
  const responseKey = `codex_global_permission_responded_${permissionId}`;

  return { storageKey, responseKey };
};

/**
 * Cleans up old permission storage entries (older than 7 days)
 */
export const cleanupOldPermissionStorage = () => {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('codex_permission_choice_') || key.startsWith('codex_permission_responded_')) {
      const timestamp = localStorage.getItem(`${key}_timestamp`);
      if (timestamp && parseInt(timestamp, 10) < sevenDaysAgo) {
        localStorage.removeItem(key);
        localStorage.removeItem(`${key}_timestamp`);
      }
    }
  });
};
