/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DWClient, TOPIC_ROBOT, TOPIC_CARD, EventAck } from 'dingtalk-stream';
import type { DWClientDownStream } from 'dingtalk-stream';
import https from 'https';

import type { BotInfo, IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';
import { DINGTALK_MESSAGE_LIMIT, encodeChatId, extractCardAction, parseChatId, toDingTalkSendParams, toUnifiedIncomingMessage, convertHtmlToDingTalkMarkdown } from './DingTalkAdapter';
import type { DingTalkStreamMessage } from './DingTalkAdapter';

/**
 * DingTalkPlugin - DingTalk Bot integration for Personal Assistant
 *
 * Uses dingtalk-stream SDK for WebSocket Stream connection.
 * Supports AI Card streaming for real-time response updates.
 * Falls back to sessionWebhook for plain markdown messages.
 */

// Event deduplication settings
const EVENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const EVENT_CACHE_CLEANUP_INTERVAL = 60 * 1000; // 1 minute

// DingTalk API base URL (new version)
const DINGTALK_API_BASE = 'https://api.dingtalk.com';

// AI Card template ID (DingTalk built-in streaming card)
const AI_CARD_TEMPLATE_ID = '382e4302-551d-4880-bf29-a30acfab2e71.schema';

// AI Card flow status values
const AICardStatus = {
  PROCESSING: '1',
  INPUTING: '2',
  FINISHED: '3',
  FAILED: '5',
} as const;

/**
 * Token cache structure
 */
interface ITokenCache {
  accessToken: string;
  expiresAt: number;
}

/**
 * AI Card session tracking
 */
interface IAICardSession {
  outTrackId: string;
  openSpaceId: string;
  isFinished: boolean;
  inputingStarted: boolean;
}

export class DingTalkPlugin extends BasePlugin {
  readonly type: PluginType = 'dingtalk';

  private client: DWClient | null = null;
  private isConnected: boolean = false;

  // Credentials
  private clientId: string = '';
  private clientSecret: string = '';

  // Token management
  private tokenCache: ITokenCache | null = null;

  // Track active users for status reporting
  private activeUsers: Set<string> = new Set();

  // Event deduplication
  private processedEvents: Map<string, number> = new Map();
  private eventCleanupTimer: ReturnType<typeof setInterval> | null = null;

  // AI Card sessions: messageId -> card session
  private aiCardSessions: Map<string, IAICardSession> = new Map();

  // Store sessionWebhook per chatId for fallback sending
  private webhookCache: Map<string, string> = new Map();

  /**
   * Initialize the DingTalk client
   */
  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const clientId = config.credentials?.clientId;
    const clientSecret = config.credentials?.clientSecret;

    if (!clientId || !clientSecret) {
      throw new Error('DingTalk Client ID and Client Secret are required');
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Start WebSocket Stream connection
   */
  protected async onStart(): Promise<void> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Credentials not available');
    }

    try {
      // Refresh access token first
      await this.refreshAccessToken();

      // Create DWClient
      this.client = new DWClient({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        keepAlive: true,
        debug: false,
      });

      // Register robot message listener (TOPIC_ROBOT uses CALLBACK type in Stream protocol)
      this.client.registerCallbackListener(TOPIC_ROBOT, (msg: DWClientDownStream) => {
        // Immediately acknowledge the message to prevent retry
        this.client?.socketCallBackResponse(msg.headers.messageId, EventAck.SUCCESS);

        // Process message asynchronously
        try {
          const data: DingTalkStreamMessage = JSON.parse(msg.data);
          void this.handleRobotMessage(data, msg.headers.messageId).catch((error) => {
            console.error('[DingTalkPlugin] Error handling robot message:', error);
          });
        } catch (error) {
          console.error('[DingTalkPlugin] Failed to parse robot message:', error);
        }
      });

      // Register card callback listener
      this.client.registerCallbackListener(TOPIC_CARD, (msg: DWClientDownStream) => {
        // Acknowledge card callback
        this.client?.socketCallBackResponse(msg.headers.messageId, EventAck.SUCCESS);

        // Process card action asynchronously
        try {
          const data = JSON.parse(msg.data);
          void this.handleCardCallback(data, msg.headers.messageId).catch((error) => {
            console.error('[DingTalkPlugin] Error handling card callback:', error);
          });
        } catch (error) {
          console.error('[DingTalkPlugin] Failed to parse card callback:', error);
        }
      });

      // Connect
      await this.client.connect();
      this.isConnected = true;

      // Start event cache cleanup timer
      this.startEventCleanup();

      console.log(`[DingTalkPlugin] Started for client ${this.clientId}`);
    } catch (error) {
      console.error('[DingTalkPlugin] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop connection and cleanup
   */
  protected async onStop(): Promise<void> {
    this.stopEventCleanup();

    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.client = null;
    }

    this.tokenCache = null;
    this.activeUsers.clear();
    this.processedEvents.clear();
    this.aiCardSessions.clear();
    this.webhookCache.clear();
    this.isConnected = false;

    console.log('[DingTalkPlugin] Stopped and cleaned up');
  }

  /**
   * Get active user count
   */
  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  /**
   * Get bot information
   */
  getBotInfo(): BotInfo | null {
    if (!this.clientId) return null;
    return {
      id: this.clientId,
      displayName: 'Aion Assistant',
    };
  }

  /**
   * Send a message to a chat
   * Uses AI Card for streaming support, falls back to sessionWebhook
   */
  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    await this.ensureAccessToken();

    const { contentType, content, rawText } = toDingTalkSendParams(message);
    const { type: chatType, id } = parseChatId(chatId);

    // Try AI Card streaming for text/markdown messages
    if (contentType === 'markdown' && rawText !== undefined) {
      try {
        const cardMessageId = await this.createAndDeliverAICard(chatType, id, rawText);
        return cardMessageId;
      } catch (error) {
        console.warn('[DingTalkPlugin] AI Card failed, falling back to webhook:', error);
      }
    }

    // Fallback: use sessionWebhook for sending
    const webhook = this.webhookCache.get(chatId);
    if (webhook) {
      try {
        const msgId = await this.sendViaWebhook(webhook, contentType, content, rawText);
        return msgId;
      } catch (error) {
        console.error('[DingTalkPlugin] Webhook send failed:', error);
        throw error;
      }
    }

    // Last resort: use DingTalk API to send message
    try {
      const msgId = await this.sendViaAPI(chatType, id, contentType, content, rawText);
      return msgId;
    } catch (error) {
      console.error('[DingTalkPlugin] API send failed:', error);
      throw error;
    }
  }

  /**
   * Edit an existing message (update AI Card content)
   */
  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    const cardSession = this.aiCardSessions.get(messageId);
    const isFinal = !!message.replyMarkup;

    // No card session (sent via webhook/API) or card already finished/failed
    if (!cardSession || cardSession.isFinished) {
      // Send final response as a new plain message
      if (isFinal && message.text) {
        await this.sendPlainMessage(chatId, message);
      }
      return;
    }

    await this.ensureAccessToken();

    const { rawText } = toDingTalkSendParams(message);
    const text = rawText || message.text || '';

    // Truncate if too long
    const truncatedText = text.length > DINGTALK_MESSAGE_LIMIT ? text.slice(0, DINGTALK_MESSAGE_LIMIT - 3) + '...' : text;

    try {
      await this.streamAICard(cardSession.outTrackId, truncatedText, isFinal);

      if (isFinal) {
        await this.finishAICard(cardSession.outTrackId, truncatedText);
        this.aiCardSessions.set(messageId, { ...cardSession, isFinished: true });
      }
    } catch (error: any) {
      // Ignore "not modified" style errors
      const errorMsg = error?.message || '';
      if (errorMsg.includes('not modified') || errorMsg.includes('not found')) {
        return;
      }
      console.error('[DingTalkPlugin] Failed to update AI Card:', error);

      // Mark card as finished to prevent further failed streaming attempts
      this.aiCardSessions.set(messageId, { ...cardSession, isFinished: true });

      // Fall back to sending the final response as a plain message
      if (isFinal && message.text) {
        await this.sendPlainMessage(chatId, message);
      }
    }
  }

  // ==================== Robot Message Handling ====================

  /**
   * Handle incoming robot message from Stream
   */
  private async handleRobotMessage(data: DingTalkStreamMessage, streamMessageId: string): Promise<void> {
    try {
      const eventId = data.msgId || streamMessageId;

      // Event deduplication
      if (eventId && this.isEventProcessed(eventId)) {
        return;
      }
      if (eventId) {
        this.markEventProcessed(eventId);
      }

      const userId = data.senderStaffId || '';
      if (!userId) return;

      // Track user
      this.activeUsers.add(userId);

      // Cache sessionWebhook for this chat
      if (data.sessionWebhook) {
        const chatId = encodeChatId(data);
        this.webhookCache.set(chatId, data.sessionWebhook);
      }

      // Convert to unified message
      const unifiedMessage = toUnifiedIncomingMessage(data);
      if (unifiedMessage && this.messageHandler) {
        // Check for menu button commands
        if (unifiedMessage.content.type === 'text' && unifiedMessage.content.text) {
          const buttonAction = this.getMenuButtonAction(unifiedMessage.content.text);
          if (buttonAction) {
            unifiedMessage.content.type = 'action';
            unifiedMessage.content.text = buttonAction.action;
            unifiedMessage.action = {
              type: buttonAction.type as 'system' | 'platform' | 'chat',
              name: buttonAction.action,
            };
          }
        }

        // Process in background to avoid blocking
        void this.emitMessage(unifiedMessage).catch((error) => console.error('[DingTalkPlugin] Error handling message:', error));
      }
    } catch (error) {
      console.error('[DingTalkPlugin] Error processing robot message:', error);
    }
  }

  /**
   * Handle card action callback from Stream
   */
  private async handleCardCallback(data: any, streamMessageId: string): Promise<void> {
    try {
      // Event deduplication
      const eventId = `card_${streamMessageId}`;
      if (this.isEventProcessed(eventId)) {
        return;
      }
      this.markEventProcessed(eventId);

      const userId = data.userId || '';
      if (!userId) return;

      // Track user
      this.activeUsers.add(userId);

      // Extract action from card callback
      const params = data.content?.cardPrivateData?.params || {};
      const actionInfo = extractCardAction(params);
      if (!actionInfo) return;

      // Handle tool confirmation specially
      if (actionInfo.name === 'system.confirm' && actionInfo.params?.callId && actionInfo.params?.value) {
        if (this.confirmHandler) {
          void this.confirmHandler(userId, 'dingtalk', actionInfo.params.callId, actionInfo.params.value).catch((error) => {
            console.error('[DingTalkPlugin] Confirm handler error:', error);
          });
        }
        return;
      }

      // Build a minimal DingTalkStreamMessage for conversion
      const mockData: DingTalkStreamMessage = {
        senderStaffId: userId,
        senderNick: `User ${userId.slice(-6)}`,
        msgId: streamMessageId,
        conversationType: '1', // Assume private for card actions
        createAt: Date.now(),
      };

      const unifiedMessage = toUnifiedIncomingMessage(mockData, actionInfo);
      if (unifiedMessage && this.messageHandler) {
        void this.emitMessage(unifiedMessage).catch((error) => console.error('[DingTalkPlugin] Error handling card action:', error));
      }
    } catch (error) {
      console.error('[DingTalkPlugin] Error processing card callback:', error);
    }
  }

  /**
   * Map menu action strings to action info
   */
  private getMenuButtonAction(text: string): { type: string; action: string } | null {
    const menuActions: Record<string, { type: string; action: string }> = {
      'session.new': { type: 'system', action: 'session.new' },
      'session.status': { type: 'system', action: 'session.status' },
      'help.show': { type: 'system', action: 'help.show' },
      'agent.show': { type: 'system', action: 'agent.show' },
      'pairing.check': { type: 'platform', action: 'pairing.check' },
    };
    return menuActions[text] || null;
  }

  // ==================== AI Card Streaming ====================

  /**
   * Create and deliver an AI Card for streaming
   * Returns a synthetic messageId for tracking
   */
  private async createAndDeliverAICard(chatType: 'user' | 'group', id: string, _initialText: string): Promise<string> {
    const token = await this.getAccessToken();
    const outTrackId = `aion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 1. Create AI Card instance with STREAM callback type and space models
    await this.apiRequest('POST', '/v1.0/card/instances', token, {
      cardTemplateId: AI_CARD_TEMPLATE_ID,
      outTrackId,
      cardData: {
        cardParamMap: {},
      },
      callbackType: 'STREAM',
      imGroupOpenSpaceModel: { supportForward: true },
      imRobotOpenSpaceModel: { supportForward: true },
    });

    // 2. Deliver card to user/group
    const openSpaceId = chatType === 'group' ? `dtv1.card//IM_GROUP.${id}` : `dtv1.card//IM_ROBOT.${id}`;

    await this.apiRequest('POST', '/v1.0/card/instances/deliver', token, {
      outTrackId,
      openSpaceId,
      userIdType: 1,
      imGroupOpenDeliverModel: chatType === 'group' ? { robotCode: this.clientId } : undefined,
      imRobotOpenDeliverModel: chatType === 'user' ? { spaceType: 'IM_ROBOT' } : undefined,
    });

    // Track the AI Card session
    const messageId = `aicard_${outTrackId}`;
    this.aiCardSessions.set(messageId, {
      outTrackId,
      openSpaceId,
      isFinished: false,
      inputingStarted: false,
    });

    return messageId;
  }

  /**
   * Update AI Card content (streaming)
   */
  private async streamAICard(outTrackId: string, content: string, isFinalize = false): Promise<void> {
    const token = await this.getAccessToken();

    // Transition to INPUTING state on first stream write
    const session = this.findCardSessionByTrackId(outTrackId);
    if (session && !session.inputingStarted) {
      await this.apiRequest('PUT', '/v1.0/card/instances', token, {
        outTrackId,
        cardData: {
          cardParamMap: {
            flowStatus: AICardStatus.INPUTING,
            msgContent: '',
            staticMsgContent: '',
            sys_full_json_obj: JSON.stringify({ order: ['msgContent'] }),
          },
        },
      });
      session.inputingStarted = true;
    }

    // Stream content update
    // Always use isFull=true because editMessage sends complete content each time (not deltas)
    await this.apiRequest('PUT', '/v1.0/card/streaming', token, {
      outTrackId,
      key: 'msgContent',
      content,
      isFull: true,
      isFinalize,
      isError: false,
      guid: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    });
  }

  /**
   * Finish AI Card by setting flow status to FINISHED
   */
  private async finishAICard(outTrackId: string, finalContent: string): Promise<void> {
    const token = await this.getAccessToken();
    await this.apiRequest('PUT', '/v1.0/card/instances', token, {
      outTrackId,
      cardData: {
        cardParamMap: {
          flowStatus: AICardStatus.FINISHED,
          msgContent: finalContent,
          staticMsgContent: '',
          sys_full_json_obj: JSON.stringify({ order: ['msgContent'] }),
        },
      },
    });
  }

  /**
   * Find AI Card session by outTrackId
   */
  private findCardSessionByTrackId(outTrackId: string): IAICardSession | undefined {
    for (const session of this.aiCardSessions.values()) {
      if (session.outTrackId === outTrackId) return session;
    }
    return undefined;
  }

  // ==================== Fallback Sending ====================

  /**
   * Send a message via webhook or API, bypassing AI Card
   * Used as fallback when AI Card streaming is unavailable or fails
   */
  private async sendPlainMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    try {
      await this.ensureAccessToken();
      const { contentType, content, rawText } = toDingTalkSendParams(message);
      const { type: chatType, id } = parseChatId(chatId);

      // Try sessionWebhook first
      const webhook = this.webhookCache.get(chatId);
      if (webhook) {
        await this.sendViaWebhook(webhook, contentType, content, rawText);
        return;
      }

      // Fall back to DingTalk API
      await this.sendViaAPI(chatType, id, contentType, content, rawText);
    } catch (error) {
      console.error('[DingTalkPlugin] Fallback plain message send failed:', error);
    }
  }

  // ==================== Message Sending ====================

  /**
   * Send message via sessionWebhook (simple markdown)
   */
  private async sendViaWebhook(webhook: string, contentType: string, content: Record<string, unknown>, rawText?: string): Promise<string> {
    let body: Record<string, unknown>;

    if (contentType === 'actionCard') {
      body = {
        msgtype: 'actionCard',
        actionCard: content,
      };
    } else {
      body = {
        msgtype: 'markdown',
        markdown: {
          title: 'Message',
          text: rawText || JSON.stringify(content),
        },
      };
    }

    const response = await this.httpPost(webhook, body);
    return response?.messageId || `webhook_${Date.now()}`;
  }

  /**
   * Send message via DingTalk Open API
   */
  private async sendViaAPI(chatType: 'user' | 'group', id: string, contentType: string, content: Record<string, unknown>, rawText?: string): Promise<string> {
    const token = await this.getAccessToken();

    if (chatType === 'user') {
      // Send to individual user via robot
      const body: Record<string, unknown> = {
        robotCode: this.clientId,
        userIds: [id],
        msgKey: contentType === 'actionCard' ? 'sampleActionCard6' : 'sampleMarkdown',
        msgParam: contentType === 'actionCard' ? JSON.stringify(content) : JSON.stringify({ title: 'Message', text: rawText || '' }),
      };

      const response = await this.apiRequest('POST', '/v1.0/robot/oToMessages/batchSend', token, body);
      return response?.processQueryKey || `api_${Date.now()}`;
    }

    // Send to group via robot
    const body: Record<string, unknown> = {
      robotCode: this.clientId,
      openConversationId: id,
      msgKey: contentType === 'actionCard' ? 'sampleActionCard6' : 'sampleMarkdown',
      msgParam: contentType === 'actionCard' ? JSON.stringify(content) : JSON.stringify({ title: 'Message', text: rawText || '' }),
    };

    const response = await this.apiRequest('POST', '/v1.0/robot/groupMessages/send', token, body);
    return response?.processQueryKey || `api_${Date.now()}`;
  }

  // ==================== Access Token Management ====================

  /**
   * Get current access token (cached)
   */
  private async getAccessToken(): Promise<string> {
    await this.ensureAccessToken();
    return this.tokenCache?.accessToken || '';
  }

  /**
   * Ensure access token is valid
   */
  private async ensureAccessToken(): Promise<void> {
    const now = Date.now();
    // Refresh if token expires in less than 60 seconds
    if (!this.tokenCache || this.tokenCache.expiresAt - now < 60 * 1000) {
      await this.refreshAccessToken();
    }
  }

  /**
   * Refresh access token from DingTalk API
   */
  private async refreshAccessToken(): Promise<void> {
    try {
      const response = await this.httpPost(`${DINGTALK_API_BASE}/v1.0/oauth2/accessToken`, {
        appKey: this.clientId,
        appSecret: this.clientSecret,
      });

      if (response?.accessToken) {
        this.tokenCache = {
          accessToken: response.accessToken,
          expiresAt: Date.now() + (response.expireIn || 7200) * 1000,
        };
      } else {
        throw new Error('No access token in response');
      }
    } catch (error) {
      console.error('[DingTalkPlugin] Failed to refresh access token:', error);
      throw error;
    }
  }

  // ==================== HTTP Helpers ====================

  /**
   * Make an API request to DingTalk
   */
  private async apiRequest(method: string, path: string, token: string, body?: Record<string, unknown>): Promise<any> {
    const url = `${DINGTALK_API_BASE}${path}`;
    return this.httpRequest(method, url, body, {
      'x-acs-dingtalk-access-token': token,
      'Content-Type': 'application/json',
    });
  }

  /**
   * HTTP POST helper
   */
  private async httpPost(url: string, body: Record<string, unknown>): Promise<any> {
    return this.httpRequest('POST', url, body, {
      'Content-Type': 'application/json',
    });
  }

  /**
   * Generic HTTP request helper using Node.js https module
   */
  private httpRequest(method: string, url: string, body?: Record<string, unknown>, headers?: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const data = body ? JSON.stringify(body) : undefined;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          ...headers,
          ...(data ? { 'Content-Length': Buffer.byteLength(data).toString() } : {}),
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = responseData ? JSON.parse(responseData) : {};
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`));
            } else {
              resolve(parsed);
            }
          } catch {
            resolve(responseData);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      if (data) {
        req.write(data);
      }
      req.end();
    });
  }

  // ==================== Event Deduplication ====================

  private isEventProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  private markEventProcessed(eventId: string): void {
    this.processedEvents.set(eventId, Date.now());
  }

  private startEventCleanup(): void {
    if (this.eventCleanupTimer) return;

    this.eventCleanupTimer = setInterval(() => {
      this.cleanupOldEvents();
    }, EVENT_CACHE_CLEANUP_INTERVAL);
  }

  private stopEventCleanup(): void {
    if (this.eventCleanupTimer) {
      clearInterval(this.eventCleanupTimer);
      this.eventCleanupTimer = null;
    }
  }

  private cleanupOldEvents(): void {
    const now = Date.now();

    for (const [eventId, timestamp] of this.processedEvents.entries()) {
      if (now - timestamp > EVENT_CACHE_TTL) {
        this.processedEvents.delete(eventId);
      }
    }
  }

  // ==================== Static Methods ====================

  /**
   * Test connection with the given credentials
   */
  static async testConnection(clientId: string, clientSecret?: string): Promise<{ success: boolean; botInfo?: { name?: string }; error?: string }> {
    if (!clientSecret) {
      return { success: false, error: 'Client Secret is required for DingTalk' };
    }

    try {
      // Try to get access token to verify credentials
      const response = await new Promise<any>((resolve, reject) => {
        const data = JSON.stringify({
          appKey: clientId,
          appSecret: clientSecret,
        });

        const options = {
          hostname: 'api.dingtalk.com',
          port: 443,
          path: '/v1.0/oauth2/accessToken',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data).toString(),
          },
        };

        const req = https.request(options, (res) => {
          let responseData = '';
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(responseData));
            } catch {
              reject(new Error('Invalid response'));
            }
          });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => {
          req.destroy(new Error('Connection timeout'));
        });
        req.write(data);
        req.end();
      });

      if (response?.accessToken) {
        return { success: true, botInfo: { name: 'DingTalk Bot' } };
      }

      return {
        success: false,
        error: response?.message || response?.errmsg || 'Failed to get access token',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to connect to DingTalk API',
      };
    }
  }
}
