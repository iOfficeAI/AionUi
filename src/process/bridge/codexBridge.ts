/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexAgentManager } from '@/agent/codex';
import { ipcBridge } from '@/common';
import { copyFilesToDirectory } from '../utils';
import WorkerManage from '../WorkerManage';

/**
 * 初始化 Codex 相关的 IPC 桥接
 */
export function initCodexBridge(): void {
  // Codex 专用的 sendMessage provider
  ipcBridge.codexConversation.sendMessage.provider(async ({ conversation_id, files, ...other }) => {
    const task = (await WorkerManage.getTaskByIdRollbackBuild(conversation_id)) as CodexAgentManager | undefined;
    if (!task) return { success: false, msg: 'conversation not found' };
    if (task.type !== 'codex') return { success: false, msg: 'unsupported task type for Codex provider' };
    await copyFilesToDirectory(task.workspace, files);
    return task
      .sendMessage({ content: other.input, files, msg_id: other.msg_id })
      .then(() => ({ success: true }))
      .catch((err: unknown) => ({ success: false, msg: err instanceof Error ? err.message : String(err) }));
  });

  // Codex 专用的 confirmMessage provider
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
