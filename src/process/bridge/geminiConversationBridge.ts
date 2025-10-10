/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import { copyFilesToDirectory } from '../utils';
import WorkerManage from '../WorkerManage';
import type { GeminiAgentManager } from '../task/GeminiAgentManager';

export function initGeminiConversationBridge(): void {
  // Gemini 专用的 sendMessage provider
  ipcBridge.geminiConversation.sendMessage.provider(async ({ conversation_id, files, ...other }) => {
    const task = (await WorkerManage.getTaskByIdRollbackBuild(conversation_id)) as GeminiAgentManager;
    if (!task) return { success: false, msg: 'conversation not found' };
    if (task.type !== 'gemini') return { success: false, msg: 'unsupported task type for Gemini provider' };
    await copyFilesToDirectory(task.workspace, files);
    // Support Gemini tasks only, ACP has its own provider
    return task
      .sendMessage(other)
      .then(() => ({ success: true }))
      .catch((err) => {
        return { success: false, msg: err };
      });
  });

  ipcBridge.geminiConversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
    const task = WorkerManage.getTaskById(conversation_id) as GeminiAgentManager;
    if (!task) return { success: false, msg: 'conversation not found' };
    if (task.type !== 'gemini') return { success: false, msg: 'not support' };
    try {
      await task.confirmMessage({ confirmKey, msg_id, callId });
      return { success: true };
    } catch (err) {
      return { success: false, msg: err };
    }
  });

  ipcBridge.geminiConversation.getWorkspace.provider(async ({ conversation_id }) => {
    const task = (await WorkerManage.getTaskByIdRollbackBuild(conversation_id)) as GeminiAgentManager;
    if (!task || task.type !== 'gemini') return [];
    return task.getWorkspace();
  });
}
