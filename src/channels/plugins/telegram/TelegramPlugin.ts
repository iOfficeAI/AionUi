/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Context } from 'grammy';
import { Bot, GrammyError, HttpError } from 'grammy';

import type { UserFromGetMe } from 'grammy/types';
import type { BotInfo, IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';
import { splitMessage, TELEGRAM_MESSAGE_LIMIT, toTelegramSendParams, toUnifiedIncomingMessage } from './TelegramAdapter';
import { extractAction, extractCategory } from './TelegramKeyboards';

/**
 * TelegramPlugin - Telegram Bot integration for Personal Assistant
 *
 * Uses grammY library for Telegram Bot API
 * Supports long-polling mode with automatic reconnection
 */
export class TelegramPlugin extends BasePlugin {
  readonly type: PluginType = 'telegram';

  private bot: Bot | null = null;
  private botInfo: UserFromGetMe | null = null;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private readonly baseReconnectDelay: number = 1000; // 1 second
  private isPollingActive: boolean = false;

  // Track active users for status reporting
  private activeUsers: Set<string> = new Set();

  /**
   * Initialize the Telegram bot instance
   */
  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const token = config.credentials?.token;
    console.log(`[TelegramPlugin] onInitialize called, hasToken=${!!token}, pluginId=${config.id}`);

    if (!token) {
      throw new Error('Telegram bot token is required');
    }

    // Create bot instance
    this.bot = new Bot(token);
    console.log(`[TelegramPlugin] Bot instance created`);

    // Setup handlers
    this.setupHandlers();
    console.log(`[TelegramPlugin] Handlers setup complete`);

    console.log(`[TelegramPlugin] Initialized plugin ${config.id}`);
  }

  /**
   * Start long-polling
   *
   * Note: grammY's bot.start() automatically deletes any existing webhook
   * before starting long-polling, so we don't need to do it manually.
   */
  protected async onStart(): Promise<void> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    try {
      // Get bot info first to validate the token
      this.botInfo = await this.bot.api.getMe();
      console.log(`[TelegramPlugin] Bot info: @${this.botInfo.username}`);

      // Start polling - grammY handles webhook deletion internally
      // grammY 内部会自动删除 webhook
      await this.startPolling();

      this.reconnectAttempts = 0;
      console.log(`[TelegramPlugin] Started polling for @${this.botInfo.username}`);
    } catch (error) {
      console.error('[TelegramPlugin] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop polling and cleanup
   */
  protected async onStop(): Promise<void> {
    // Wait for polling to stop cleanly
    // grammY's bot.stop() already handles final offset confirmation
    await this.stopPolling();

    // Clear bot instance to ensure fresh state on re-enable
    this.bot = null;
    this.botInfo = null;
    this.activeUsers.clear();
    this.reconnectAttempts = 0;

    console.log('[TelegramPlugin] Stopped and cleaned up');
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
      id: this.botInfo.id.toString(),
      username: this.botInfo.username,
      displayName: this.botInfo.first_name,
    };
  }

  /**
   * Send a message to a chat
   */
  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    const { text, options } = toTelegramSendParams(message);

    // Handle long messages by splitting
    const chunks = splitMessage(text, TELEGRAM_MESSAGE_LIMIT);
    let lastMessageId = '';

    for (let i = 0; i < chunks.length; i++) {
      const isLastChunk = i === chunks.length - 1;
      const chunkOptions = isLastChunk ? options : { ...options, reply_markup: undefined };

      try {
        const result = await this.bot.api.sendMessage(chatId, chunks[i], chunkOptions);
        lastMessageId = result.message_id.toString();
      } catch (error) {
        console.error(`[TelegramPlugin] Failed to send message chunk ${i + 1}/${chunks.length}:`, error);
        throw error;
      }
    }

    return lastMessageId;
  }

  /**
   * Edit an existing message
   */
  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    const { text, options } = toTelegramSendParams(message);

    // Truncate if too long (can't split when editing)
    const truncatedText = text.length > TELEGRAM_MESSAGE_LIMIT ? text.slice(0, TELEGRAM_MESSAGE_LIMIT - 3) + '...' : text;

    try {
      await this.bot.api.editMessageText(chatId, parseInt(messageId, 10), truncatedText, {
        parse_mode: options.parse_mode,
        reply_markup: options.reply_markup,
      });
    } catch (error: any) {
      // Ignore "message is not modified" errors
      if (error instanceof GrammyError && error.description?.includes('message is not modified')) {
        return;
      }
      console.error('[TelegramPlugin] Failed to edit message:', error);
      throw error;
    }
  }

  /**
   * Setup message and callback handlers
   */
  private setupHandlers(): void {
    if (!this.bot) return;

    console.log(`[TelegramPlugin] Setting up handlers on bot instance...`);

    // Debug: Log ALL incoming updates (must be first middleware)
    this.bot.use(async (ctx, next) => {
      const updateType = ctx.message ? 'message' : ctx.callbackQuery ? 'callback_query' : 'other';
      console.log(`[TelegramPlugin] *** RAW UPDATE RECEIVED *** type=${updateType}, chatId=${ctx.chat?.id}`);
      await next();
    });

    // Handle /start command - initiate pairing
    this.bot.command('start', async (ctx) => {
      await this.handleStartCommand(ctx);
    });

    // Handle all text messages
    this.bot.on('message:text', async (ctx) => {
      console.log(`[TelegramPlugin] *** message:text event received ***`);
      await this.handleTextMessage(ctx);
    });

    // Debug: Log all updates received
    this.bot.on('message', (ctx, next) => {
      console.log(`[TelegramPlugin] *** message event received, type: ${ctx.message?.text ? 'text' : ctx.message?.photo ? 'photo' : 'other'} ***`);
      return next();
    });

    // Handle callback queries (button presses)
    this.bot.on('callback_query:data', async (ctx) => {
      console.log(`[TelegramPlugin] callback_query:data handler triggered, data:`, ctx.callbackQuery?.data);
      await this.handleCallbackQuery(ctx);
    });

    // Handle photos
    this.bot.on('message:photo', async (ctx) => {
      await this.handleMediaMessage(ctx);
    });

    // Handle documents
    this.bot.on('message:document', async (ctx) => {
      await this.handleMediaMessage(ctx);
    });

    // Handle voice messages
    this.bot.on('message:voice', async (ctx) => {
      await this.handleMediaMessage(ctx);
    });

    // Error handler - grammY wraps errors in BotError which has .error property
    this.bot.catch((botError) => {
      const actualError = botError.error || botError;
      const errorMessage = actualError instanceof Error ? actualError.message : String(actualError);
      console.error('[TelegramPlugin] Bot error:', errorMessage, botError);
      this.setError(errorMessage);
      // Don't re-throw - let the bot continue running
      // 不要重新抛出 - 让 bot 继续运行
    });
  }

  /**
   * Handle /start command
   * This initiates the pairing flow for new users
   */
  private async handleStartCommand(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    console.log(`[TelegramPlugin] handleStartCommand called: userId=${userId}`);

    // Track user
    this.activeUsers.add(userId);

    // Convert to unified message and forward to handler (non-blocking)
    const unifiedMessage = toUnifiedIncomingMessage(ctx);
    if (unifiedMessage && this.messageHandler) {
      // Mark as start command for special handling
      unifiedMessage.content.type = 'command';
      unifiedMessage.content.text = '/start';
      // Don't await - process in background
      void this.messageHandler(unifiedMessage)
        .then(() => console.log(`[TelegramPlugin] Start command handled successfully`))
        .catch((error) => console.error(`[TelegramPlugin] Error handling start command:`, error));
    }
  }

  /**
   * Handle text messages
   */
  private async handleTextMessage(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    const text = ctx.message?.text;

    console.log(`[TelegramPlugin] handleTextMessage called: text="${text}", userId=${userId}, hasMessageHandler=${!!this.messageHandler}, isPollingActive=${this.isPollingActive}`);

    if (!userId || !text) return;

    // Track user
    this.activeUsers.add(userId);

    try {
      // Check for button text commands
      if (await this.handleButtonCommand(ctx, text)) {
        return;
      }

      // Convert to unified message and forward to handler
      const unifiedMessage = toUnifiedIncomingMessage(ctx);
      if (unifiedMessage && this.messageHandler) {
        console.log(`[TelegramPlugin] Forwarding message to handler (non-blocking)`);
        // IMPORTANT: Don't await - process in background to avoid blocking polling loop
        // grammY's simple polling processes messages sequentially, so blocking here
        // would prevent subsequent messages from being received
        // 重要：不要 await - 在后台处理以避免阻塞轮询循环
        // grammY 的简单轮询是顺序处理的，阻塞这里会导致后续消息无法接收
        void this.messageHandler(unifiedMessage)
          .then(() => {
            console.log(`[TelegramPlugin] Message handler completed successfully for: ${text?.slice(0, 20)}...`);
          })
          .catch((error) => {
            console.error(`[TelegramPlugin] Message handler failed for: ${text?.slice(0, 20)}...`, error);
          });
      } else {
        console.warn(`[TelegramPlugin] Cannot forward message: unifiedMessage=${!!unifiedMessage}, messageHandler=${!!this.messageHandler}`);
      }
    } catch (error) {
      // Catch errors to prevent them from stopping the bot
      // 捕获错误以防止它们停止 bot
      console.error(`[TelegramPlugin] Error handling text message:`, error);
      // Don't re-throw - let grammY continue processing
    }
  }

  /**
   * Handle button-based commands from reply keyboard
   */
  private async handleButtonCommand(ctx: Context, text: string): Promise<boolean> {
    const unifiedMessage = toUnifiedIncomingMessage(ctx);
    if (!unifiedMessage || !this.messageHandler) return false;

    // Map button text to actions
    const buttonActions: Record<string, { type: string; action: string }> = {
      '🆕 New Chat': { type: 'system', action: 'session.new' },
      '📊 Status': { type: 'system', action: 'session.status' },
      '❓ Help': { type: 'system', action: 'help.show' },
      '🔄 Agent': { type: 'system', action: 'agent.show' },
      '🔄 Refresh Status': { type: 'platform', action: 'pairing.check' },
    };

    const buttonAction = buttonActions[text];
    if (buttonAction) {
      // Transform into action message
      unifiedMessage.content.type = 'action';
      unifiedMessage.content.text = buttonAction.action;
      unifiedMessage.action = {
        type: buttonAction.type as any,
        name: buttonAction.action,
      };
      // Don't await - process in background
      void this.messageHandler(unifiedMessage)
        .then(() => console.log(`[TelegramPlugin] Button command handled: ${buttonAction.action}`))
        .catch((error) => console.error(`[TelegramPlugin] Error handling button command:`, error));
      return true;
    }

    return false;
  }

  /**
   * Handle media messages (photos, documents, voice)
   */
  private async handleMediaMessage(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    console.log(`[TelegramPlugin] handleMediaMessage called: userId=${userId}`);

    // Track user
    this.activeUsers.add(userId);

    // Convert to unified message and forward to handler (non-blocking)
    const unifiedMessage = toUnifiedIncomingMessage(ctx);
    if (unifiedMessage && this.messageHandler) {
      // Don't await - process in background
      void this.messageHandler(unifiedMessage)
        .then(() => console.log(`[TelegramPlugin] Media message handled successfully`))
        .catch((error) => console.error(`[TelegramPlugin] Error handling media message:`, error));
    }
  }

  /**
   * Handle callback queries (inline button presses)
   */
  private async handleCallbackQuery(ctx: Context): Promise<void> {
    console.log(`[TelegramPlugin] handleCallbackQuery entered`);
    const data = ctx.callbackQuery?.data;
    console.log(`[TelegramPlugin] Callback data:`, data);
    if (!data) {
      console.log(`[TelegramPlugin] No callback data, returning`);
      return;
    }

    const userId = ctx.from?.id.toString();
    console.log(`[TelegramPlugin] Callback userId:`, userId);
    if (!userId) {
      console.log(`[TelegramPlugin] No userId, returning`);
      return;
    }

    // Track user
    this.activeUsers.add(userId);

    // Answer callback to remove loading state (don't await to avoid blocking)
    // 不等待 answerCallbackQuery 完成，避免阻塞
    void ctx.answerCallbackQuery().catch((err) => {
      console.warn('[TelegramPlugin] Failed to answer callback query:', err);
    });

    // Parse callback data
    const category = extractCategory(data);
    console.log(`[TelegramPlugin] Callback category:`, category);

    // 处理工具确认回调，格式: confirm:{callId}:{value}
    // Handle tool confirmation callback, format: confirm:{callId}:{value}
    if (category === 'confirm') {
      const parts = data.split(':');
      if (parts.length >= 3 && this.confirmHandler) {
        const callId = parts[1];
        const value = parts.slice(2).join(':'); // value 可能包含冒号
        console.log(`[TelegramPlugin] Calling confirmHandler: userId=${userId}, callId=${callId}, value=${value}`);

        // 直接调用 confirmHandler，不通过 messageHandler
        // Call confirmHandler directly, not through messageHandler
        void this.confirmHandler(userId, 'telegram', callId, value)
          .then(async () => {
            console.log(`[TelegramPlugin] Confirm callback handled: ${data}`);
            // 确认成功后移除按钮
            // Remove buttons after confirmation success
            try {
              await ctx.editMessageReplyMarkup({ reply_markup: undefined });
              console.log(`[TelegramPlugin] Removed confirmation buttons`);
            } catch (editError) {
              // 忽略编辑错误（消息可能已被删除或修改）
              // Ignore edit errors (message may have been deleted or modified)
              console.debug(`[TelegramPlugin] Failed to remove buttons (ignored):`, editError);
            }
          })
          .catch((error) => console.error(`[TelegramPlugin] Error handling confirm callback:`, error));
      } else {
        console.warn(`[TelegramPlugin] Invalid confirm callback data or no confirmHandler:`, data);
      }
      return;
    }

    // 处理 agent 选择回调，格式: agent:{agentType}
    // Handle agent selection callback, format: agent:{agentType}
    if (category === 'agent') {
      const agentType = extractAction(data); // gemini, acp, codex
      const unifiedMessage = toUnifiedIncomingMessage(ctx);
      if (unifiedMessage && this.messageHandler) {
        unifiedMessage.content.type = 'action';
        unifiedMessage.content.text = 'agent.select';
        unifiedMessage.action = {
          type: 'system',
          name: 'agent.select',
          params: { agentType },
        };
        // Don't await - process in background
        void this.messageHandler(unifiedMessage)
          .then(async () => {
            console.log(`[TelegramPlugin] Agent selection handled: ${agentType}`);
            // Remove inline keyboard after selection
            try {
              await ctx.editMessageReplyMarkup({ reply_markup: undefined });
            } catch (editError) {
              console.debug(`[TelegramPlugin] Failed to remove agent selection buttons (ignored):`, editError);
            }
          })
          .catch((error) => console.error(`[TelegramPlugin] Error handling agent selection:`, error));
      }
      return;
    }

    // 其他回调类型通过 messageHandler 处理
    // Other callback types are handled through messageHandler
    const unifiedMessage = toUnifiedIncomingMessage(ctx);
    console.log(`[TelegramPlugin] unifiedMessage:`, unifiedMessage ? 'created' : 'null', `messageHandler:`, this.messageHandler ? 'exists' : 'null');
    if (unifiedMessage && this.messageHandler) {
      unifiedMessage.content.type = 'action';
      unifiedMessage.content.text = data;

      // 其他回调类型的处理
      // Handle other callback types
      const action = extractAction(data);
      unifiedMessage.action = {
        type: category === 'pairing' ? 'platform' : category === 'action' || category === 'session' ? 'system' : 'chat',
        name: `${category}.${action}`,
        params: { originalMessageId: ctx.callbackQuery?.message?.message_id?.toString() },
      };

      // Don't await - process in background
      void this.messageHandler(unifiedMessage)
        .then(() => console.log(`[TelegramPlugin] Callback query handled: ${data}`))
        .catch((error) => console.error(`[TelegramPlugin] Error handling callback query:`, error));
    }
  }

  /**
   * Start long-polling with error handling
   *
   * Key points from Telegram Bot API:
   * - getUpdates and webhooks are mutually exclusive
   * - grammY's bot.start() handles webhook deletion internally
   * - bot.start() returns a Promise that resolves when bot STOPS (not starts)
   * - Use onStart callback to detect when polling actually begins
   */
  private async startPolling(): Promise<void> {
    if (!this.bot) {
      console.error('[TelegramPlugin] Cannot start polling: bot is null');
      return;
    }

    if (this.isPollingActive) {
      console.warn('[TelegramPlugin] Polling is already active, skipping start');
      return;
    }

    console.log('[TelegramPlugin] startPolling called, preparing to start bot.start()...');

    // Create a promise that resolves when polling starts successfully
    // 创建一个 Promise，在轮询成功启动时 resolve
    return new Promise<void>((resolve, reject) => {
      let started = false;
      const startTimeout = setTimeout(() => {
        if (!started) {
          console.error('[TelegramPlugin] Polling start timeout - bot.start() did not trigger onStart within 30s');
          reject(new Error('Polling start timeout after 30s'));
        }
      }, 30000);

      console.log('[TelegramPlugin] Calling bot.start()...');

      // Start polling in background (non-blocking)
      // bot.start() returns a Promise that resolves when the bot stops,
      // so we don't await it - let it run in background
      // grammY internally handles:
      // - Webhook deletion (via deleteWebhook)
      // - Offset management for getUpdates
      // - AbortController for graceful shutdown
      this.bot!.start({
        onStart: (botInfo) => {
          started = true;
          this.isPollingActive = true;
          clearTimeout(startTimeout);
          console.log(`[TelegramPlugin] onStart callback fired! Polling started for @${botInfo.username}`);
          resolve();
        },
        allowed_updates: ['message', 'callback_query'],
        // Drop pending updates on startup to avoid processing stale messages
        // 启动时丢弃待处理的更新，避免处理过时的消息
        drop_pending_updates: true,
      })
        .then(() => {
          // This resolves when bot.stop() is called
          this.isPollingActive = false;
          console.log('[TelegramPlugin] bot.start() Promise resolved (bot stopped normally)');
        })
        .catch((error) => {
          this.isPollingActive = false;
          clearTimeout(startTimeout);
          console.error('[TelegramPlugin] bot.start() Promise rejected:', error);
          if (!started) {
            reject(error);
          } else {
            // Polling was running but encountered an error
            void this.handlePollingError(error);
          }
        });

      console.log('[TelegramPlugin] bot.start() called, waiting for onStart callback...');
    });
  }

  /**
   * Stop polling and wait for clean shutdown
   *
   * grammY's bot.stop() will:
   * 1. Set pollingRunning to false
   * 2. Abort current getUpdates request
   * 3. Make final getUpdates call to confirm last processed update offset
   */
  private async stopPolling(): Promise<void> {
    if (!this.bot || !this.isPollingActive) {
      console.log('[TelegramPlugin] Polling not active, nothing to stop');
      return;
    }

    console.log('[TelegramPlugin] Stopping polling...');
    try {
      await this.bot.stop();
      this.isPollingActive = false;
      console.log('[TelegramPlugin] Polling stopped successfully');
    } catch (error) {
      console.error('[TelegramPlugin] Error stopping polling:', error);
      this.isPollingActive = false;
    }
  }

  /**
   * Handle polling errors with exponential backoff reconnection
   */
  private async handlePollingError(error: unknown): Promise<void> {
    if (this.status !== 'running') return;

    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error('[TelegramPlugin] Max reconnect attempts reached, stopping');
      this.setError('Connection failed after multiple attempts');
      await this.stop();
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000,
      30000 // Max 30 seconds
    );

    console.log(`[TelegramPlugin] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (this.status === 'running') {
      try {
        await this.startPolling();
        this.reconnectAttempts = 0;
      } catch (retryError) {
        await this.handlePollingError(retryError);
      }
    }
  }

  /**
   * Test connection with a token
   * Used by Settings UI to validate token before saving
   */
  static async testConnection(token: string): Promise<{ success: boolean; botInfo?: BotInfo; error?: string }> {
    try {
      const bot = new Bot(token);
      const me = await bot.api.getMe();

      return {
        success: true,
        botInfo: {
          id: me.id.toString(),
          username: me.username,
          displayName: me.first_name,
        },
      };
    } catch (error: any) {
      let errorMessage = 'Connection failed';

      if (error instanceof GrammyError) {
        if (error.error_code === 401) {
          errorMessage = 'Invalid bot token';
        } else {
          errorMessage = error.description || error.message;
        }
      } else if (error instanceof HttpError) {
        errorMessage = 'Network error - please check your internet connection';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
