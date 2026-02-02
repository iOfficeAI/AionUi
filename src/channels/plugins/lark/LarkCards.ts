/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChannelAgentType } from '../../types';

/**
 * Lark Message Cards for Personal Assistant
 *
 * Lark uses interactive message cards instead of keyboard buttons.
 * Cards support markdown content, buttons, and various interactive elements.
 *
 * Card Structure:
 * - config: Card configuration (wide_screen_mode, etc.)
 * - header: Optional card header with title
 * - elements: Array of content elements (markdown, buttons, dividers, etc.)
 */

// ==================== Types ====================

/**
 * Lark card structure
 */
export interface LarkCard {
  config?: {
    wide_screen_mode?: boolean;
    enable_forward?: boolean;
  };
  header?: {
    title: {
      tag: 'plain_text';
      content: string;
    };
    template?: 'blue' | 'wathet' | 'turquoise' | 'green' | 'yellow' | 'orange' | 'red' | 'carmine' | 'violet' | 'purple' | 'indigo' | 'grey';
  };
  elements: LarkCardElement[];
}

/**
 * Lark card element types
 */
export type LarkCardElement = LarkMarkdownElement | LarkDividerElement | LarkActionElement | LarkNoteElement;

export interface LarkMarkdownElement {
  tag: 'markdown';
  content: string;
}

export interface LarkDividerElement {
  tag: 'hr';
}

export interface LarkActionElement {
  tag: 'action';
  actions: LarkButtonElement[];
}

export interface LarkButtonElement {
  tag: 'button';
  text: {
    tag: 'plain_text';
    content: string;
  };
  type?: 'default' | 'primary' | 'danger';
  value: Record<string, string>;
}

export interface LarkNoteElement {
  tag: 'note';
  elements: Array<{
    tag: 'plain_text';
    content: string;
  }>;
}

// ==================== Card Builders ====================

/**
 * Agent info for card display
 */
export interface AgentDisplayInfo {
  type: ChannelAgentType;
  emoji: string;
  name: string;
}

/**
 * Create main menu card
 * Displayed after authorization or session actions
 */
export function createMainMenuCard(): LarkCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: 'AionUi Assistant' },
      template: 'blue',
    },
    elements: [
      {
        tag: 'markdown',
        content: 'Welcome! Choose an action below:',
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🆕 New Chat' },
            type: 'primary',
            value: { action: 'session.new' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🔄 Agent' },
            type: 'default',
            value: { action: 'agent.show' },
          },
        ],
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '📊 Status' },
            type: 'default',
            value: { action: 'session.status' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '❓ Help' },
            type: 'default',
            value: { action: 'help.show' },
          },
        ],
      },
    ],
  };
}

/**
 * Create pairing card
 * Shown during pairing process
 */
export function createPairingCard(pairingCode: string): LarkCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🔗 Pairing Required' },
      template: 'yellow',
    },
    elements: [
      {
        tag: 'markdown',
        content: ['Please pair your account with AionUi:', '', `**Pairing Code:** \`${pairingCode}\``, '', '1. Open AionUi settings', '2. Go to Channels → Lark', '3. Enter this pairing code', '', 'Code expires in 10 minutes.'].join('\n'),
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🔄 Refresh Code' },
            type: 'primary',
            value: { action: 'pairing.refresh' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '❓ Help' },
            type: 'default',
            value: { action: 'pairing.help' },
          },
        ],
      },
    ],
  };
}

/**
 * Create pairing status card
 * Shows waiting for approval status with code
 */
export function createPairingStatusCard(pairingCode: string): LarkCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '⏳ Waiting for Approval' },
      template: 'orange',
    },
    elements: [
      {
        tag: 'markdown',
        content: ['Your pairing request is pending approval.', '', `**Pairing Code:** \`${pairingCode}\``, '', 'Please approve in AionUi settings:', '1. Open AionUi app', '2. Go to WebUI → Channels', '3. Click "Approve" for this code'].join('\n'),
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🔄 Check Status' },
            type: 'primary',
            value: { action: 'pairing.check' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🔁 New Code' },
            type: 'default',
            value: { action: 'pairing.refresh' },
          },
        ],
      },
    ],
  };
}

/**
 * Create pairing help card
 * Shows detailed pairing instructions
 */
export function createPairingHelpCard(): LarkCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '❓ Pairing Help' },
      template: 'turquoise',
    },
    elements: [
      {
        tag: 'markdown',
        content: ['**What is pairing?**', 'Pairing links your Lark/Feishu account with the local AionUi application.', 'You need to pair before using the AI assistant.', '', '**How to pair:**', '1. Send any message to this bot', '2. You will receive a pairing code', '3. Open AionUi desktop app', '4. Go to WebUI → Channels → Lark', '5. Click "Approve" for your code', '', '**FAQ:**', '• Pairing code valid for 10 minutes', '• AionUi app must be running', '• One account can only pair once'].join('\n'),
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🔗 Get Pairing Code' },
            type: 'primary',
            value: { action: 'pairing.show' },
          },
        ],
      },
    ],
  };
}

/**
 * Create agent selection card
 * Shows available agents with current selection marked
 */
export function createAgentSelectionCard(availableAgents: AgentDisplayInfo[], currentAgent?: ChannelAgentType): LarkCard {
  const agentButtons: LarkButtonElement[] = availableAgents.map((agent) => ({
    tag: 'button',
    text: {
      tag: 'plain_text',
      content: currentAgent === agent.type ? `✓ ${agent.emoji} ${agent.name}` : `${agent.emoji} ${agent.name}`,
    },
    type: currentAgent === agent.type ? 'primary' : 'default',
    value: { action: 'agent.select', agentType: agent.type },
  }));

  // Split buttons into rows of 2
  const actionRows: LarkActionElement[] = [];
  for (let i = 0; i < agentButtons.length; i += 2) {
    actionRows.push({
      tag: 'action',
      actions: agentButtons.slice(i, i + 2),
    });
  }

  const currentAgentInfo = availableAgents.find((a) => a.type === currentAgent);
  const currentAgentName = currentAgentInfo ? `${currentAgentInfo.emoji} ${currentAgentInfo.name}` : 'None';

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🔄 Switch Agent' },
      template: 'indigo',
    },
    elements: [
      {
        tag: 'markdown',
        content: `Select an AI agent for your conversations:\n\nCurrent: **${currentAgentName}**`,
      },
      ...actionRows,
    ],
  };
}

/**
 * Create session status card
 */
export function createSessionStatusCard(session?: { id: string; agentType: ChannelAgentType; createdAt: number; lastActivity: number }): LarkCard {
  if (!session) {
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '📊 Session Status' },
        template: 'grey',
      },
      elements: [
        {
          tag: 'markdown',
          content: 'No active session.\n\nSend a message to start a new conversation, or tap the "New Chat" button.',
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '🆕 New Session' },
              type: 'primary',
              value: { action: 'session.new' },
            },
          ],
        },
      ],
    };
  }

  const duration = Math.floor((Date.now() - session.createdAt) / 1000 / 60);
  const lastActivity = Math.floor((Date.now() - session.lastActivity) / 1000);

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '📊 Session Status' },
      template: 'green',
    },
    elements: [
      {
        tag: 'markdown',
        content: [`🤖 **Agent:** ${session.agentType}`, `⏱ **Duration:** ${duration} min`, `📝 **Last activity:** ${lastActivity} sec ago`, `🔖 **Session ID:** \`${session.id.slice(-8)}\``].join('\n'),
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🆕 New Session' },
            type: 'default',
            value: { action: 'session.new' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '📊 Refresh' },
            type: 'default',
            value: { action: 'session.status' },
          },
        ],
      },
    ],
  };
}

/**
 * Create help menu card
 */
export function createHelpCard(): LarkCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '❓ AionUi Assistant Help' },
      template: 'turquoise',
    },
    elements: [
      {
        tag: 'markdown',
        content: ['A remote assistant to interact with AionUi via Lark.', '', '**Common Actions:**', '• 🆕 New Chat - Start a new session', '• 🔄 Agent - Switch AI agent', '• 📊 Status - View current session status', '• ❓ Help - Show this help message', '', 'Send a message to chat with the AI assistant.'].join('\n'),
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🤖 Features' },
            type: 'default',
            value: { action: 'help.features' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🔗 Pairing Guide' },
            type: 'default',
            value: { action: 'help.pairing' },
          },
        ],
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '💬 Tips' },
            type: 'default',
            value: { action: 'help.tips' },
          },
        ],
      },
    ],
  };
}

/**
 * Create features card
 */
export function createFeaturesCard(): LarkCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🤖 Features' },
      template: 'blue',
    },
    elements: [
      {
        tag: 'markdown',
        content: ['**AI Chat**', '• Natural language conversation', '• Streaming output, real-time display', '• Context memory support', '', '**Session Management**', '• Single session mode', '• Clear context anytime', '• View session status', '', '**Message Actions**', '• Copy reply content', '• Regenerate reply', '• Continue conversation'].join('\n'),
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '← Back to Help' },
            type: 'default',
            value: { action: 'help.show' },
          },
        ],
      },
    ],
  };
}

/**
 * Create pairing guide card
 */
export function createPairingGuideCard(): LarkCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🔗 Pairing Guide' },
      template: 'orange',
    },
    elements: [
      {
        tag: 'markdown',
        content: ['**First-time Setup:**', '1. Send any message to the bot', '2. Bot displays pairing code', '3. Approve pairing in AionUi settings', '4. Ready to use after pairing', '', '**Notes:**', '• Pairing code valid for 10 minutes', '• AionUi app must be running', '• One Lark account can only pair once'].join('\n'),
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '← Back to Help' },
            type: 'default',
            value: { action: 'help.show' },
          },
        ],
      },
    ],
  };
}

/**
 * Create tips card
 */
export function createTipsCard(): LarkCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '💬 Tips' },
      template: 'purple',
    },
    elements: [
      {
        tag: 'markdown',
        content: ['**Effective Conversations:**', '• Be clear and specific', '• Feel free to ask follow-ups', '• Regenerate if not satisfied', '', '**Quick Actions:**', '• Use card buttons for quick access', '• Tap message buttons for actions', '• New chat clears history context'].join('\n'),
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '← Back to Help' },
            type: 'default',
            value: { action: 'help.show' },
          },
        ],
      },
    ],
  };
}

/**
 * Create response actions card
 * Buttons attached to AI response messages
 */
export function createResponseActionsCard(text: string): LarkCard {
  return {
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: 'markdown',
        content: text,
      },
      {
        tag: 'hr',
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '📋 Copy' },
            type: 'default',
            value: { action: 'chat.copy' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🔄 Regenerate' },
            type: 'default',
            value: { action: 'chat.regenerate' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '💬 Continue' },
            type: 'default',
            value: { action: 'chat.continue' },
          },
        ],
      },
    ],
  };
}

/**
 * Create error recovery card
 */
export function createErrorRecoveryCard(errorMessage?: string): LarkCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '⚠️ Error' },
      template: 'red',
    },
    elements: [
      {
        tag: 'markdown',
        content: errorMessage || 'An error occurred. Please try again.',
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🔄 Retry' },
            type: 'primary',
            value: { action: 'error.retry' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🆕 New Session' },
            type: 'default',
            value: { action: 'session.new' },
          },
        ],
      },
    ],
  };
}

/**
 * Create tool confirmation card
 * @param callId - The tool call ID for tracking
 * @param options - Array of { label, value } options
 */
export function createToolConfirmationCard(callId: string, title: string, description: string, options: Array<{ label: string; value: string }>): LarkCard {
  const buttons: LarkButtonElement[] = options.map((opt) => ({
    tag: 'button',
    text: { tag: 'plain_text', content: opt.label },
    type: 'default',
    value: { action: 'system.confirm', callId: callId, value: opt.value },
  }));

  // Split buttons into rows of 2
  const actionRows: LarkActionElement[] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    actionRows.push({
      tag: 'action',
      actions: buttons.slice(i, i + 2),
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: title },
      template: 'yellow',
    },
    elements: [
      {
        tag: 'markdown',
        content: description,
      },
      ...actionRows,
    ],
  };
}

/**
 * Create confirmation card (generic)
 */
export function createConfirmationCard(message: string, confirmAction: string, cancelAction: string): LarkCard {
  return {
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: 'markdown',
        content: message,
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '✅ Confirm' },
            type: 'primary',
            value: { action: confirmAction },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '❌ Cancel' },
            type: 'danger',
            value: { action: cancelAction },
          },
        ],
      },
    ],
  };
}

/**
 * Create settings card
 */
export function createSettingsCard(): LarkCard {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '⚙️ Settings' },
      template: 'grey',
    },
    elements: [
      {
        tag: 'markdown',
        content: ['Channel settings need to be configured in the AionUi app.', '', 'Open AionUi → WebUI → Channels'].join('\n'),
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '← Back' },
            type: 'default',
            value: { action: 'help.show' },
          },
        ],
      },
    ],
  };
}

// ==================== Utilities ====================

/**
 * Create a simple text card without buttons
 */
export function createTextCard(text: string, title?: string, template?: LarkCard['header']['template']): LarkCard {
  const card: LarkCard = {
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: 'markdown',
        content: text,
      },
    ],
  };

  if (title) {
    card.header = {
      title: { tag: 'plain_text', content: title },
      template: template || 'blue',
    };
  }

  return card;
}

/**
 * Extract action info from card button value
 */
export function parseCardButtonValue(value: Record<string, string>): {
  action: string;
  params: Record<string, string>;
} | null {
  const action = value.action;
  if (!action) return null;

  const params: Record<string, string> = {};
  Object.entries(value).forEach(([key, val]) => {
    if (key !== 'action') {
      params[key] = val;
    }
  });

  return { action, params };
}
