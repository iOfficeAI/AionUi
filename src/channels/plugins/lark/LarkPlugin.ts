/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as lark from '@larksuiteoapi/node-sdk';

import type { BotInfo, IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';
import { extractCardAction, LARK_MESSAGE_LIMIT, toLarkSendParams, toUnifiedIncomingMessage } from './LarkAdapter';

/**
 * LarkPlugin - Lark/Feishu Bot integration for Personal Assistant
 *
 * Uses official Lark Node SDK
 * Supports WebSocket long connection mode (no public URL required)
 */
// Event deduplication settings
const EVENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const EVENT_CACHE_CLEANUP_INTERVAL = 60 * 1000; // 1 minute

export class LarkPlugin extends BasePlugin {
  readonly type: PluginType = 'lark';

  private client: lark.Client | null = null;
  private wsClient: lark.WSClient | null = null;
  private eventDispatcher: lark.EventDispatcher | null = null;
  private botInfo: { appId: string; name?: string } | null = null;
  private isConnected: boolean = false;

  // Token management
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  // Track active users for status reporting
  private activeUsers: Set<string> = new Set();

  // Event deduplication - track processed event IDs with timestamps
  private processedEvents: Map<string, number> = new Map();
  private eventCleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Initialize the Lark client instance
   */
  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const appId = config.credentials?.appId;
    const appSecret = config.credentials?.appSecret;

    if (!appId || !appSecret) {
      throw new Error('Lark App ID and App Secret are required');
    }

    // Create Lark client
    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu, // Use Feishu domain, can be configured for Lark international
    });

    this.botInfo = { appId };
  }

  /**
   * Start WebSocket connection for receiving events
   */
  protected async onStart(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const appId = this.config?.credentials?.appId;
    const appSecret = this.config?.credentials?.appSecret;

    if (!appId || !appSecret) {
      throw new Error('Credentials not available');
    }

    try {
      // Refresh access token first
      await this.refreshAccessToken();

      // Get bot info
      // Note: Lark doesn't have a direct "getMe" API like Telegram
      // Bot info is configured in the app settings
      // Get optional security config
      const encryptKey = this.config?.credentials?.encryptKey;
      const verificationToken = this.config?.credentials?.verificationToken;

      // Create EventDispatcher with security config
      this.eventDispatcher = new lark.EventDispatcher({
        encryptKey: encryptKey || '',
        verificationToken: verificationToken || '',
      });

      // Setup event handlers on the dispatcher
      this.setupEventHandlers();

      // Create WebSocket client for receiving events
      // Enable SDK logging to see connection details
      this.wsClient = new lark.WSClient({
        appId,
        appSecret,
        domain: lark.Domain.Feishu,
        loggerLevel: lark.LoggerLevel.info,
      });

      // Start WebSocket connection with event dispatcher
      this.wsClient
        .start({
          eventDispatcher: this.eventDispatcher,
        })
        .catch((err: unknown) => {
          console.error(`[LarkPlugin] WebSocket start() error:`, err);
        });

      this.isConnected = true;

      // Start event cache cleanup timer
      this.startEventCleanup();

      console.log(`[LarkPlugin] Started for app ${appId}`);
    } catch (error) {
      console.error('[LarkPlugin] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop WebSocket connection and cleanup
   */
  protected async onStop(): Promise<void> {
    // Stop event cleanup timer
    this.stopEventCleanup();

    if (this.wsClient) {
      // WSClient doesn't have a stop method, we just set to null
      this.wsClient = null;
    }

    this.eventDispatcher = null;
    this.client = null;
    this.botInfo = null;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.activeUsers.clear();
    this.processedEvents.clear();
    this.isConnected = false;

    console.log('[LarkPlugin] Stopped and cleaned up');
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
    if (!this.botInfo) return null;
    return {
      id: this.botInfo.appId,
      displayName: this.botInfo.name || 'Aion Assistant',
    };
  }

  /**
   * Get receive_id_type based on the ID prefix
   * - ou_ -> open_id (user's open_id)
   * - oc_ -> chat_id (group chat)
   * - on_ -> union_id
   * - other -> user_id
   */
  private getReceiveIdType(receiveId: string): 'open_id' | 'chat_id' | 'union_id' | 'user_id' {
    if (receiveId.startsWith('ou_')) return 'open_id';
    if (receiveId.startsWith('oc_')) return 'chat_id';
    if (receiveId.startsWith('on_')) return 'union_id';
    return 'user_id';
  }

  /**
   * Send a message to a chat
   * Note: For streaming support, we send text as interactive card (can be updated)
   */
  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    await this.ensureAccessToken();

    const { contentType, content, rawText } = toLarkSendParams(message);
    const receiveIdType = this.getReceiveIdType(chatId);

    // Handle text messages - send as card for streaming support
    // Lark only allows editing card messages, not text messages
    if (contentType === 'text' && rawText !== undefined) {
      // Build a simple card with text content
      const card = this.buildTextCard(rawText);

      try {
        const response = await this.client.im.message.create({
          params: {
            receive_id_type: receiveIdType,
          },
          data: {
            receive_id: chatId,
            msg_type: 'interactive',
            content: JSON.stringify(card),
          },
        });

        return response.data?.message_id || '';
      } catch (error) {
        console.error('[LarkPlugin] Failed to send card message:', error);
        throw error;
      }
    }

    // Send interactive card or other content types
    try {
      const response = await this.client.im.message.create({
        params: {
          receive_id_type: receiveIdType,
        },
        data: {
          receive_id: chatId,
          msg_type: contentType,
          content: JSON.stringify(content),
        },
      });

      return response.data?.message_id || '';
    } catch (error) {
      console.error('[LarkPlugin] Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Build a simple card for text content (enables editing)
   */
  private buildTextCard(text: string): Record<string, unknown> {
    return {
      config: {
        wide_screen_mode: true,
      },
      elements: [
        {
          tag: 'markdown',
          content: text,
        },
      ],
    };
  }

  /**
   * Edit an existing message
   * Note: Lark message.patch only supports updating CARD messages, not text messages
   * Since we send text as cards (see sendMessage), this should work for streaming updates
   */
  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    await this.ensureAccessToken();

    const { contentType, content, rawText } = toLarkSendParams(message);

    try {
      let cardContent: Record<string, unknown>;

      // For text messages, build a card (since we send text as cards)
      if (contentType === 'text' && rawText !== undefined) {
        // Truncate if too long
        const truncatedText = rawText.length > LARK_MESSAGE_LIMIT ? rawText.slice(0, LARK_MESSAGE_LIMIT - 3) + '...' : rawText;
        cardContent = this.buildTextCard(truncatedText);
      } else if (contentType === 'interactive') {
        // Already a card
        cardContent = content as Record<string, unknown>;
      } else {
        // Other types - build a simple card
        cardContent = this.buildTextCard(rawText || JSON.stringify(content));
      }

      await this.client.im.message.patch({
        path: {
          message_id: messageId,
        },
        data: {
          content: JSON.stringify(cardContent),
        },
      });
    } catch (error: any) {
      // Ignore common errors
      const errorCode = error?.response?.data?.code || error?.code;
      const errorMsg = error?.response?.data?.msg || error?.message || '';

      // Ignore "message not changed" or "not modified" errors
      if (errorCode === 230002 || errorMsg.includes('not modified')) {
        return;
      }

      // Log but don't throw for "not a card" errors (shouldn't happen now but just in case)
      if (errorMsg.includes('NOT a card')) {
        console.warn(`[LarkPlugin] Cannot edit non-card message: ${messageId}, skipping`);
        return;
      }

      console.error('[LarkPlugin] Failed to edit message:', error);
      throw error;
    }
  }

  /**
   * Setup event handlers for incoming messages and card actions
   */
  private setupEventHandlers(): void {
    if (!this.eventDispatcher) return;

    // Register event handlers on the EventDispatcher
    this.eventDispatcher.register({
      // Handle incoming messages
      'im.message.receive_v1': async (data: Record<string, unknown>) => {
        await this.handleMessageEvent({ event: data });
      },

      // Handle card action callbacks (button clicks)
      // Event name: card.action.trigger
      'card.action.trigger': async (data: Record<string, unknown>) => {
        // Don't await - process in background to avoid 200340 timeout
        // Lark requires immediate response within 3 seconds
        void this.handleCardAction({ event: data });
        // Return immediately to acknowledge the callback
        return {};
      },

      // Handle bot menu clicks (custom menu in chat)
      // Event name: application.bot.menu_v6
      'application.bot.menu_v6': async (data: Record<string, unknown>) => {
        await this.handleBotMenuEvent({ event: data });
      },
    });
  }

  /**
   * Handle incoming message events
   */
  private async handleMessageEvent(event: any): Promise<void> {
    try {
      const message = event?.event?.message;
      const sender = event?.event?.sender;

      if (!message || !sender) {
        console.warn('[LarkPlugin] Invalid message event:', event);
        return;
      }

      // Event deduplication - use message_id as unique identifier
      const eventId = message.message_id;
      if (eventId && this.isEventProcessed(eventId)) {
        return;
      }
      if (eventId) {
        this.markEventProcessed(eventId);
      }

      const userId = sender.sender_id?.user_id || sender.sender_id?.open_id;
      if (!userId) return;

      // Track user
      this.activeUsers.add(userId);

      // Convert to unified message
      const unifiedMessage = toUnifiedIncomingMessage(event);
      if (unifiedMessage && this.messageHandler) {
        // Check for menu button commands first
        if (unifiedMessage.content.type === 'text' && unifiedMessage.content.text) {
          const buttonAction = this.getMenuButtonAction(unifiedMessage.content.text);
          if (buttonAction) {
            // Transform into action message
            unifiedMessage.content.type = 'action';
            unifiedMessage.content.text = buttonAction.action;
            unifiedMessage.action = {
              type: buttonAction.type as 'system' | 'platform' | 'chat',
              name: buttonAction.action,
            };
          }
        }

        // Process in background to avoid blocking
        void this.messageHandler(unifiedMessage).catch((error) => console.error(`[LarkPlugin] Error handling message:`, error));
      }
    } catch (error) {
      console.error('[LarkPlugin] Error processing message event:', error);
    }
  }

  /**
   * Map menu action strings to action info
   * These are the action strings configured in Feishu bot custom menu
   */
  private getMenuButtonAction(text: string): { type: string; action: string } | null {
    // Feishu custom menu sends action strings directly
    const menuActions: Record<string, { type: string; action: string }> = {
      'session.new': { type: 'system', action: 'session.new' },
      'session.status': { type: 'system', action: 'session.status' },
      'help.show': { type: 'system', action: 'help.show' },
      'agent.show': { type: 'system', action: 'agent.show' },
      'pairing.check': { type: 'platform', action: 'pairing.check' },
    };
    return menuActions[text] || null;
  }

  /**
   * Handle bot menu click events (application.bot.menu_v6)
   * Feishu custom menu triggers this event when clicked
   */
  private async handleBotMenuEvent(event: any): Promise<void> {
    try {
      const operator = event?.event?.operator;
      const eventKey = event?.event?.event_key;
      const timestamp = event?.event?.timestamp;

      if (!operator || !eventKey) {
        console.warn('[LarkPlugin] Invalid bot menu event:', event);
        return;
      }

      // Event deduplication - use timestamp + eventKey as unique identifier
      const eventId = `menu_${eventKey}_${timestamp}`;
      if (this.isEventProcessed(eventId)) {
        return;
      }
      this.markEventProcessed(eventId);

      const userId = operator.operator_id?.user_id || operator.operator_id?.open_id;
      if (!userId) {
        console.warn('[LarkPlugin] No user ID in bot menu event');
        return;
      }

      // Track user
      this.activeUsers.add(userId);

      // Get chat_id from event (for sending response)
      const chatId = event?.event?.chat_id || userId;

      // Map event_key to action
      const buttonAction = this.getMenuButtonAction(eventKey);
      if (!buttonAction) {
        console.warn(`[LarkPlugin] Unknown menu event_key: ${eventKey}`);
        return;
      }

      // Build unified message for action
      const unifiedMessage = {
        id: eventId,
        platform: 'lark' as const,
        chatId,
        user: {
          id: userId,
          displayName: `User ${userId.slice(-6)}`,
        },
        content: {
          type: 'action' as const,
          text: buttonAction.action,
        },
        action: {
          type: buttonAction.type as 'system' | 'platform' | 'chat',
          name: buttonAction.action,
        },
        timestamp: timestamp ? parseInt(timestamp, 10) : Date.now(),
        raw: event,
      };

      if (this.messageHandler) {
        void this.messageHandler(unifiedMessage).catch((error) => console.error(`[LarkPlugin] Error handling bot menu action:`, error));
      }
    } catch (error) {
      console.error('[LarkPlugin] Error processing bot menu event:', error);
    }
  }

  /**
   * Handle card action callbacks (button clicks)
   */
  private async handleCardAction(event: any): Promise<void> {
    try {
      const action = event?.event?.action;
      const operator = event?.event?.operator;
      const eventToken = event?.event?.token;

      if (!action || !operator) {
        console.warn('[LarkPlugin] Invalid card action event:', event);
        return;
      }

      // Event deduplication - use event token as unique identifier
      if (eventToken && this.isEventProcessed(eventToken)) {
        return;
      }
      if (eventToken) {
        this.markEventProcessed(eventToken);
      }

      const userId = operator.user_id || operator.open_id;
      if (!userId) return;

      // Track user
      this.activeUsers.add(userId);

      // Extract action info
      const actionInfo = extractCardAction(action);
      if (!actionInfo) return;

      // Convert to unified message with action
      const unifiedMessage = toUnifiedIncomingMessage(event, actionInfo);
      if (unifiedMessage && this.messageHandler) {
        void this.messageHandler(unifiedMessage).catch((error) => console.error(`[LarkPlugin] Error handling card action:`, error));
      }
    } catch (error) {
      console.error('[LarkPlugin] Error processing card action:', error);
    }
  }

  /**
   * Refresh access token
   * Lark tokens expire after 2 hours
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      // The SDK handles token refresh internally
    } catch (error) {
      console.error('[LarkPlugin] Failed to refresh access token:', error);
      throw error;
    }
  }

  /**
   * Ensure access token is valid before making API calls
   */
  private async ensureAccessToken(): Promise<void> {
    const now = Date.now();
    // Refresh if token expires in less than 5 minutes
    if (this.tokenExpiresAt - now < 5 * 60 * 1000) {
      await this.refreshAccessToken();
    }
  }

  // ==================== Event Deduplication ====================

  /**
   * Check if an event has already been processed
   */
  private isEventProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  /**
   * Mark an event as processed
   */
  private markEventProcessed(eventId: string): void {
    this.processedEvents.set(eventId, Date.now());
  }

  /**
   * Start periodic cleanup of old event entries
   */
  private startEventCleanup(): void {
    if (this.eventCleanupTimer) return;

    this.eventCleanupTimer = setInterval(() => {
      this.cleanupOldEvents();
    }, EVENT_CACHE_CLEANUP_INTERVAL);
  }

  /**
   * Stop event cleanup timer
   */
  private stopEventCleanup(): void {
    if (this.eventCleanupTimer) {
      clearInterval(this.eventCleanupTimer);
      this.eventCleanupTimer = null;
    }
  }

  /**
   * Remove events older than TTL
   */
  private cleanupOldEvents(): void {
    const now = Date.now();

    for (const [eventId, timestamp] of this.processedEvents.entries()) {
      if (now - timestamp > EVENT_CACHE_TTL) {
        this.processedEvents.delete(eventId);
      }
    }
  }

  /**
   * Test connection with the given credentials
   * For Lark, appId is required and appSecret should be passed as the second parameter
   * @param appId - Lark App ID
   * @param appSecret - Lark App Secret (optional parameter for BasePlugin compatibility)
   */
  static async testConnection(appId: string, appSecret?: string): Promise<{ success: boolean; botInfo?: { name?: string }; error?: string }> {
    if (!appSecret) {
      return { success: false, error: 'App Secret is required for Lark' };
    }

    try {
      const client = new lark.Client({
        appId,
        appSecret,
        appType: lark.AppType.SelfBuild,
        domain: lark.Domain.Feishu,
      });

      // Try to get tenant access token to verify credentials
      // The SDK will throw if credentials are invalid
      await client.auth.tenantAccessToken.internal({
        data: {
          app_id: appId,
          app_secret: appSecret,
        },
      });

      return { success: true, botInfo: { name: 'Lark Bot' } };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to connect to Lark API',
      };
    }
  }
}
