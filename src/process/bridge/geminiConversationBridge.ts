/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import WorkerManage from '../WorkerManage';
import type { GeminiAgentManager } from '../task/GeminiAgentManager';

export function initGeminiConversationBridge(): void {
  // Gemini 专用的 confirmMessage provider (for backward compatibility with 'input.confirm.message' channel)
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
}
