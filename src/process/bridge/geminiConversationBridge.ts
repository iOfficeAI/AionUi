/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import type { GeminiAgentManager } from '../task/GeminiAgentManager';
import WorkerManage from '../WorkerManage';

// Gemini confirmMessage provider (for 'input.confirm.message' channel)
// Handles MCP tool confirmation including "always allow" options
export function initGeminiConversationBridge(): void {
  ipcBridge.geminiConversation.confirmMessage.provider(async ({ conversation_id, msg_id, confirmKey, callId }) => {
    const task = WorkerManage.getTaskById(conversation_id);
    if (!task) {
      return { success: false, msg: 'conversation not found' };
    }
    if (task.type !== 'gemini') {
      return { success: false, msg: 'only supported for gemini' };
    }

    // Call GeminiAgentManager.confirm() to send confirmation to worker
    void (task as GeminiAgentManager).confirm(msg_id, callId, confirmKey);
    return { success: true };
  });
}
