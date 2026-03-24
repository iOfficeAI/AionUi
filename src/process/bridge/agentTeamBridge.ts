/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { AgentTeamService } from '@process/services/agentTeam';
import { refreshTrayMenu } from '@process/utils/tray';

const refreshTrayMenuSafely = async (): Promise<void> => {
  try {
    await refreshTrayMenu();
  } catch (error) {
    console.warn('[agentTeamBridge] Failed to refresh tray menu:', error);
  }
};

export function initAgentTeamBridge(agentTeamService: AgentTeamService): void {
  const emitCreated = (conversation: Pick<TChatConversation, 'id' | 'source'>) => {
    ipcBridge.conversation.listChanged.emit({
      conversationId: conversation.id,
      action: 'created',
      source: conversation.source || 'aionui',
    });
  };

  ipcBridge.agentTeam.create.provider(async (params) => {
    try {
      const result = await agentTeamService.createTeam(params);
      emitCreated(result.teamConversation);
      result.memberConversations.forEach((conversation) => emitCreated(conversation));
      await refreshTrayMenuSafely();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.agentTeam.sendMessage.provider(async ({ conversation_id, input, msg_id, files }) => {
    try {
      const entry = await agentTeamService.sendMessage({
        conversationId: conversation_id,
        input,
        msgId: msg_id,
        files,
      });
      // Emit timeline update so frontend sees the message immediately
      ipcBridge.agentTeam.timelineStream.emit({ conversation_id, entry });
      return { success: true, data: { entry } };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.agentTeam.getTimeline.provider(async ({ conversation_id }) => {
    try {
      const entries = await agentTeamService.getTimeline(conversation_id);
      return { success: true, data: { entries } };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.agentTeam.getMembers.provider(async ({ conversation_id }) => {
    try {
      const conversations = await agentTeamService.getMembers(conversation_id);
      return { success: true, data: { conversations } };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });
}
