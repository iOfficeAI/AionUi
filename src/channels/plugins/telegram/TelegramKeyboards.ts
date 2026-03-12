/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { InlineKeyboard, Keyboard } from 'grammy';

import type { ChannelAgentType } from '../../types';

/**
 * Telegram Keyboards for Personal Assistant
 *
 * Two types of keyboards:
 * 1. Reply Keyboard - Persistent buttons below input field
 * 2. Inline Keyboard - Buttons attached to messages
 */

// ==================== Reply Keyboards ====================

/**
 * Main menu keyboard shown to authorized users
 * Displayed persistently below the message input
 */
export function createMainMenuKeyboard(): Keyboard {
  return new Keyboard().text('🆕 New Chat').text('🔄 Agent').row().text('🗂 History').text('📊 Status').row().text('⚙️ Settings').text('❓ Help').resized().persistent();
}

/**
 * Pairing keyboard shown during pairing process
 */
export function createPairingKeyboard(): Keyboard {
  return new Keyboard().text('🔄 Refresh Status').text('❓ Help').resized().persistent();
}

// ==================== Inline Keyboards ====================

/**
 * Agent info for keyboard display
 */
export interface AgentDisplayInfo {
  type: ChannelAgentType;
  emoji: string;
  name: string;
}

/**
 * Agent selection keyboard
 * Shows available agents with current selection marked
 * @param availableAgents - List of available agents to display
 * @param currentAgent - Currently selected agent type
 */
export function createAgentSelectionKeyboard(availableAgents: AgentDisplayInfo[], currentAgent?: ChannelAgentType): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Add agents in rows of 2
  for (let i = 0; i < availableAgents.length; i++) {
    const agent = availableAgents[i];
    const label = currentAgent === agent.type ? `✓ ${agent.emoji} ${agent.name}` : `${agent.emoji} ${agent.name}`;

    keyboard.text(label, `agent:${agent.type}`);

    // Start new row after every 2 buttons, except for the last one
    if ((i + 1) % 2 === 0 && i < availableAgents.length - 1) {
      keyboard.row();
    }
  }

  return keyboard;
}

/**
 * Action buttons for AI response messages
 */
export function createResponseActionsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('📋 Copy', 'action:copy').text('🔄 Regenerate', 'action:regenerate').row().text('💬 Continue', 'action:continue');
}

/**
 * Pairing code display with refresh option
 */
export function createPairingCodeKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🔄 Refresh Code', 'pairing:refresh').row().text('❓ Pairing Help', 'pairing:help');
}

/**
 * Pairing status check keyboard
 */
export function createPairingStatusKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🔄 Check Status', 'pairing:check').text('🔄 Get New Code', 'pairing:refresh');
}

/**
 * Confirmation keyboard (generic)
 */
export function createConfirmationKeyboard(confirmAction: string, cancelAction: string): InlineKeyboard {
  return new InlineKeyboard().text('✅ Confirm', confirmAction).text('❌ Cancel', cancelAction);
}

/**
 * Session control keyboard
 */
export function createSessionControlKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🆕 New Session', 'session:new').text('📊 Session Status', 'session:status').row().text('⚙️ Settings', 'settings:show:main').text('🗂 History', 'history:page:0').row().text('📄 Messages', 'messages:current:0');
}

/**
 * Help menu keyboard
 */
export function createHelpKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🤖 Features', 'help:features').text('🔗 Pairing Guide', 'help:pairing').row().text('💬 Tips', 'help:tips');
}

export function createHistoryListKeyboard(items: Array<{ id: string; label: string; current?: boolean }>, page: number, hasPrev: boolean, hasNext: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const item of items) {
    const label = item.current ? `✓ ${item.label}` : item.label;
    keyboard.text(label, `history:select:${item.id}`).row();
  }

  if (hasPrev) {
    keyboard.text('⬅️ Prev', `history:page:${page - 1}`);
  }
  if (hasNext) {
    keyboard.text('➡️ Next', `history:page:${page + 1}`);
  }

  if (items.length > 0) {
    keyboard.row().text('📄 Current Messages', 'messages:current:0');
  }

  return keyboard;
}

export function createMessageListKeyboard(conversationId: string, page: number, hasPrev: boolean, hasNext: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  let hasPager = false;

  if (hasPrev) {
    keyboard.text('⬅️ Prev', `messages:show:${conversationId}:${page - 1}`);
    hasPager = true;
  }
  if (hasNext) {
    keyboard.text('➡️ Next', `messages:show:${conversationId}:${page + 1}`);
    hasPager = true;
  }

  if (hasPager) {
    keyboard.row();
  }

  return keyboard.text('⚙️ Settings', 'settings:show:main').text('🗂 History', 'history:page:0');
}

export function createSettingsPanelKeyboard(hasConversation: boolean, supportsApprovals = false): InlineKeyboard {
  const keyboard = new InlineKeyboard().text('🤖 Tool', 'settings:show:tool').text('🧠 Model', 'settings:show:model:0').row().text('💭 Thinking', 'settings:show:think');

  if (supportsApprovals) {
    keyboard.text('🛡 Approvals', 'settings:show:approvals').row().text('📊 Status', 'session:status');
  } else {
    keyboard.text('📊 Status', 'session:status');
  }

  if (hasConversation) {
    keyboard.row().text('🗂 History', 'history:page:0').text('📄 Messages', 'messages:current:0');
  } else {
    keyboard.row().text('🆕 New Session', 'session:new').text('🗂 History', 'history:page:0');
  }

  return keyboard.row().text('🔄 Refresh', 'settings:show:main');
}

export function createSettingsToolKeyboard(items: Array<{ label: string; value: string; current?: boolean }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  items.forEach((item, index) => {
    keyboard.text(item.current ? `✓ ${item.label}` : item.label, `tool:set:${item.value}`);
    if ((index + 1) % 2 === 0 && index < items.length - 1) {
      keyboard.row();
    }
  });

  return keyboard.row().text('⬅️ Back', 'settings:show:main').text('🔄 Refresh', 'settings:show:tool');
}

export function createSettingsThinkingKeyboard(currentLevel?: string, includeXHigh = false): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(currentLevel === 'off' ? '✓ Off' : 'Off', 'think:set:off')
    .text(currentLevel === 'low' ? '✓ Low' : 'Low', 'think:set:low')
    .row()
    .text(currentLevel === 'medium' ? '✓ Medium' : 'Medium', 'think:set:medium')
    .text(currentLevel === 'high' ? '✓ High' : 'High', 'think:set:high');

  if (includeXHigh) {
    keyboard.row().text(currentLevel === 'xhigh' ? '✓ XHigh' : 'XHigh', 'think:set:xhigh');
  }

  return keyboard.row().text('⬅️ Back', 'settings:show:main').text('🔄 Refresh', 'settings:show:think');
}

export function createSettingsApprovalsKeyboard(items: Array<{ label: string; value: string; current?: boolean }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  items.forEach((item, index) => {
    keyboard.text(item.current ? `✓ ${item.label}` : item.label, `approvals:set:${item.value}`);
    if ((index + 1) % 2 === 0 && index < items.length - 1) {
      keyboard.row();
    }
  });

  return keyboard.row().text('⬅️ Back', 'settings:show:main').text('🔄 Refresh', 'settings:show:approvals');
}

export function createSettingsModelKeyboard(items: Array<{ label: string; current?: boolean }>, page: number, hasPrev: boolean, hasNext: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  items.forEach((item, index) => {
    const label = item.current ? `✓ ${item.label}` : item.label;
    keyboard.text(label, `model:set:${page}:${index}`).row();
  });

  if (hasPrev) {
    keyboard.text('⬅️ Prev', `settings:show:model:${page - 1}`);
  }
  if (hasNext) {
    keyboard.text('➡️ Next', `settings:show:model:${page + 1}`);
  }

  if (hasPrev || hasNext) {
    keyboard.row();
  }

  return keyboard.text('⬅️ Back', 'settings:show:main').text('🔄 Refresh', `settings:show:model:${page}`);
}

/**
 * Error recovery keyboard
 */
export function createErrorRecoveryKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🔄 Retry', 'error:retry').text('🆕 New Session', 'session:new');
}

/**
 * Tool confirmation keyboard for Gemini tool calls
 * @param callId - The tool call ID for tracking
 * @param options - Array of { label, value } options
 */
export function createToolConfirmationKeyboard(callId: string, options: Array<{ label: string; value: string }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  // 每行最多显示 2 个按钮
  // Show at most 2 buttons per row
  for (let i = 0; i < options.length; i += 2) {
    if (i > 0) keyboard.row();
    keyboard.text(options[i].label, `confirm:${callId}:${options[i].value}`);
    if (i + 1 < options.length) {
      keyboard.text(options[i + 1].label, `confirm:${callId}:${options[i + 1].value}`);
    }
  }
  return keyboard;
}

// ==================== Keyboard Utilities ====================

/**
 * Remove keyboard from message
 * Use when you want to hide the reply keyboard
 */
export function removeKeyboard() {
  return { remove_keyboard: true as const };
}

/**
 * Check if a callback query matches an action pattern
 */
export function matchAction(callbackData: string, actionPrefix: string): boolean {
  return callbackData.startsWith(`${actionPrefix}:`);
}

/**
 * Extract action name from callback data
 * e.g., "action:copy" -> "copy"
 */
export function extractAction(callbackData: string): string {
  const parts = callbackData.split(':');
  return parts.length > 1 ? parts[1] : callbackData;
}

/**
 * Extract action category from callback data
 * e.g., "action:copy" -> "action"
 */
export function extractCategory(callbackData: string): string {
  const parts = callbackData.split(':');
  return parts[0];
}
