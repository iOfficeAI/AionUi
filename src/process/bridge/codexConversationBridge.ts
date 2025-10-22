/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexAgentManager } from '@/agent/codex';
import { ipcBridge } from '@/common';
import WorkerManage from '../WorkerManage';

/**
 * 初始化 Codex 对话相关的 IPC 桥接
 */
export function initCodexConversationBridge(): void {
  // Codex 专用的 confirmMessage provider (for backward compatibility with 'codex.input.confirm.message' channel)
  ipcBridge.codexConversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
    const task = WorkerManage.getTaskById(conversation_id) as CodexAgentManager | undefined;
    if (!task) return { success: false, msg: 'conversation not found' };
    if (task.type !== 'codex') return { success: false, msg: 'not support' };
    try {
      await task.confirmMessage({ confirmKey, msg_id, callId });
      return { success: true };
    } catch (e: unknown) {
      return { success: false, msg: e instanceof Error ? e.message : String(e) };
    }
  });
}
