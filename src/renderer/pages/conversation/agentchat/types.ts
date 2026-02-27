/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent configuration for the AgentChatR multi-agent chat room
 */
export type AgentConfig = {
  id: string;
  name: string;
  label: string;
  color: string;
  avatar?: string;
  status: 'available' | 'busy' | 'offline';
};

/**
 * Default agent configurations matching AgentChatR's supported agents
 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  { id: 'claude', name: 'claude', label: 'Claude', color: '#da7756', status: 'available' },
  { id: 'codex', name: 'codex', label: 'Codex', color: '#10a37f', status: 'available' },
  { id: 'gemini', name: 'gemini', label: 'Gemini', color: '#4285f4', status: 'available' },
];

/**
 * Todo item pinned from a chat message
 */
export type TodoItem = {
  id: string;
  messageId: string;
  text: string;
  sender: string;
  status: 'todo' | 'done';
  createdAt: number;
};

/**
 * Reply-to reference for threading
 */
export type ReplyRef = {
  messageId: string;
  sender: string;
  text: string;
};

/**
 * Chat message extended with agentchat-specific fields
 */
export type AgentChatMessage = {
  id: string;
  sender: string;
  senderColor: string;
  text: string;
  timestamp: number;
  replyTo?: ReplyRef;
  mentions: string[];
  isSystem?: boolean;
  attachments?: string[];
};
