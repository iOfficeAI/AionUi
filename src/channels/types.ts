/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ==================== Plugin Types ====================

/**
 * Supported platform types for plugins
 */
export type PluginType = 'telegram' | 'slack' | 'discord';

/**
 * Plugin connection status
 */
export type PluginStatus = 'created' | 'initializing' | 'ready' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * Plugin credentials (stored encrypted in database)
 */
export interface IPluginCredentials {
  token?: string;
}

/**
 * Plugin configuration options
 */
export interface IPluginConfigOptions {
  mode?: 'polling' | 'webhook';
  webhookUrl?: string;
  rateLimit?: number; // Max messages per minute
  requireMention?: boolean; // Require @mention in groups
}

/**
 * Plugin configuration stored in database
 */
export interface IChannelPluginConfig {
  id: string;
  type: PluginType;
  name: string;
  enabled: boolean;
  credentials?: IPluginCredentials;
  config?: IPluginConfigOptions;
  status: PluginStatus;
  lastConnected?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Plugin status for IPC communication
 */
export interface IChannelPluginStatus {
  id: string;
  type: PluginType;
  name: string;
  enabled: boolean;
  connected: boolean;
  status: PluginStatus;
  lastConnected?: number;
  error?: string;
  activeUsers: number;
  botUsername?: string;
  /** Whether the plugin has a token configured (token itself is not exposed for security) */
  hasToken?: boolean;
}

// ==================== User Types ====================

/**
 * Authorized user in the assistant system
 */
export interface IChannelUser {
  id: string;
  platformUserId: string;
  platformType: PluginType;
  displayName?: string;
  authorizedAt: number;
  lastActive?: number;
  sessionId?: string;
}

/**
 * Database row for assistant users
 */
export interface IChannelUserRow {
  id: string;
  platform_user_id: string;
  platform_type: string;
  display_name: string | null;
  authorized_at: number;
  last_active: number | null;
  session_id: string | null;
}

// ==================== Session Types ====================

/**
 * Agent types supported in assistant sessions
 */
export type ChannelAgentType = 'gemini' | 'acp' | 'codex';

/**
 * User session in the assistant system
 */
export interface IChannelSession {
  id: string;
  userId: string;
  agentType: ChannelAgentType;
  conversationId?: string;
  workspace?: string;
  createdAt: number;
  lastActivity: number;
}

/**
 * Database row for assistant sessions
 */
export interface IChannelSessionRow {
  id: string;
  user_id: string;
  agent_type: string;
  conversation_id: string | null;
  workspace: string | null;
  created_at: number;
  last_activity: number;
}

// ==================== Pairing Types ====================

/**
 * Pairing request status
 */
export type PairingStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/**
 * Pending pairing request
 */
export interface IChannelPairingRequest {
  code: string;
  platformUserId: string;
  platformType: PluginType;
  displayName?: string;
  requestedAt: number;
  expiresAt: number;
  status: PairingStatus;
}

/**
 * Database row for pairing codes
 */
export interface IChannelPairingCodeRow {
  code: string;
  platform_user_id: string;
  platform_type: string;
  display_name: string | null;
  requested_at: number;
  expires_at: number;
  status: string;
}

// ==================== Message Types ====================

/**
 * Content types for unified messages
 */
export type MessageContentType = 'text' | 'photo' | 'document' | 'voice' | 'audio' | 'video' | 'sticker' | 'action' | 'command';

/**
 * Unified user information across platforms
 */
export interface IUnifiedUser {
  id: string;
  username?: string;
  displayName: string;
  avatarUrl?: string;
}

/**
 * Attachment types for messages
 */
export type AttachmentType = 'photo' | 'document' | 'voice' | 'audio' | 'video' | 'sticker';

/**
 * Unified attachment information
 */
export interface IUnifiedAttachment {
  type: AttachmentType;
  fileId: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  duration?: number;
}

/**
 * Unified message content
 */
export interface IUnifiedMessageContent {
  type: MessageContentType;
  text: string;
  attachments?: IUnifiedAttachment[];
}

/**
 * Unified action in a message
 */
export interface IMessageAction {
  type: ActionCategory;
  name: string;
  params?: Record<string, string>;
}

/**
 * Unified incoming message format (Platform -> System)
 */
export interface IUnifiedIncomingMessage {
  id: string;
  platform: PluginType;
  chatId: string;
  user: IUnifiedUser;
  content: IUnifiedMessageContent;
  timestamp: number;
  replyToMessageId?: string;
  action?: IMessageAction;
  raw?: unknown;
}

/**
 * Parse mode for outgoing messages
 */
export type MessageParseMode = 'plain' | 'markdown' | 'html';

/**
 * Button for inline keyboards
 */
export interface IActionButton {
  label: string;
  action: string;
  params?: Record<string, string>;
}

/**
 * Unified outgoing message format (System -> Platform)
 */
export interface IUnifiedOutgoingMessage {
  type: 'text' | 'image' | 'file' | 'buttons';
  text?: string;
  parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
  buttons?: IActionButton[][];
  keyboard?: IActionButton[][];
  replyMarkup?: unknown;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  replyToMessageId?: string;
  silent?: boolean;
}

/**
 * Bot information for display
 */
export interface BotInfo {
  id: string;
  username?: string;
  displayName: string;
}

// ==================== Action Types ====================

/**
 * Action categories
 */
export type ActionCategory = 'platform' | 'system' | 'chat';

/**
 * Unified action structure
 */
export interface IUnifiedAction {
  action: string;
  category: ActionCategory;
  params?: Record<string, string>;
  context: {
    platform: PluginType;
    userId: string;
    chatId: string;
    messageId?: string;
    sessionId?: string;
  };
}

/**
 * Response behavior for actions
 */
export type ActionResponseBehavior = 'send' | 'edit' | 'answer';

/**
 * Unified action response
 */
export interface IActionResponse {
  text?: string;
  parseMode?: MessageParseMode;
  buttons?: IActionButton[][];
  keyboard?: IActionButton[][];
  behavior: ActionResponseBehavior;
  toast?: string;
  editMessageId?: string;
}

// ==================== Agent Response Types ====================

/**
 * Agent response types for streaming
 */
export type AgentResponseType = 'text' | 'stream_start' | 'stream_chunk' | 'stream_end' | 'error';

/**
 * Agent response structure
 */
export interface IAgentResponse {
  type: AgentResponseType;
  text?: string;
  chunk?: string;
  error?: {
    code: string;
    message: string;
  };
  metadata?: {
    model?: string;
    tokensUsed?: number;
    duration?: number;
  };
  suggestedActions?: IActionButton[];
}

// ==================== Type Conversion Helpers ====================

/**
 * Convert database row to IChannelUser
 */
export function rowToChannelUser(row: IChannelUserRow): IChannelUser {
  return {
    id: row.id,
    platformUserId: row.platform_user_id,
    platformType: row.platform_type as PluginType,
    displayName: row.display_name ?? undefined,
    authorizedAt: row.authorized_at,
    lastActive: row.last_active ?? undefined,
    sessionId: row.session_id ?? undefined,
  };
}

/**
 * Convert IChannelUser to database row
 */
export function channelUserToRow(user: IChannelUser): IChannelUserRow {
  return {
    id: user.id,
    platform_user_id: user.platformUserId,
    platform_type: user.platformType,
    display_name: user.displayName ?? null,
    authorized_at: user.authorizedAt,
    last_active: user.lastActive ?? null,
    session_id: user.sessionId ?? null,
  };
}

/**
 * Convert database row to IChannelSession
 */
export function rowToChannelSession(row: IChannelSessionRow): IChannelSession {
  return {
    id: row.id,
    userId: row.user_id,
    agentType: row.agent_type as ChannelAgentType,
    conversationId: row.conversation_id ?? undefined,
    workspace: row.workspace ?? undefined,
    createdAt: row.created_at,
    lastActivity: row.last_activity,
  };
}

/**
 * Convert IChannelSession to database row
 */
export function channelSessionToRow(session: IChannelSession): IChannelSessionRow {
  return {
    id: session.id,
    user_id: session.userId,
    agent_type: session.agentType,
    conversation_id: session.conversationId ?? null,
    workspace: session.workspace ?? null,
    created_at: session.createdAt,
    last_activity: session.lastActivity,
  };
}

/**
 * Convert database row to IChannelPairingRequest
 */
export function rowToPairingRequest(row: IChannelPairingCodeRow): IChannelPairingRequest {
  return {
    code: row.code,
    platformUserId: row.platform_user_id,
    platformType: row.platform_type as PluginType,
    displayName: row.display_name ?? undefined,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
    status: row.status as PairingStatus,
  };
}

/**
 * Convert IChannelPairingRequest to database row
 */
export function pairingRequestToRow(request: IChannelPairingRequest): IChannelPairingCodeRow {
  return {
    code: request.code,
    platform_user_id: request.platformUserId,
    platform_type: request.platformType,
    display_name: request.displayName ?? null,
    requested_at: request.requestedAt,
    expires_at: request.expiresAt,
    status: request.status,
  };
}
