/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import { getDatabase } from '@process/services/database';
import { ProcessConfig } from '@process/utils/initStorage';
import { conversationServiceSingleton } from '@/process/services/conversationServiceSingleton';
import { buildChatErrorResponse, chatActions } from '../actions/ChatActions';
import { handlePairingShow, platformActions } from '../actions/PlatformActions';
import { getChannelDefaultModel, systemActions } from '../actions/SystemActions';
import type { IActionContext, IRegisteredAction } from '../actions/types';
import { getChannelMessageService } from '../agent/ChannelMessageService';
import type { SessionManager } from '../core/SessionManager';
import type { PairingService } from '../pairing/PairingService';
import type { PluginMessageHandler } from '../plugins/BasePlugin';
import { getChannelConversationName, resolveChannelConvType } from '../types';
import { createMainMenuCard, createErrorRecoveryCard, createToolConfirmationCard } from '../plugins/lark/LarkCards';
import { convertHtmlToLarkMarkdown } from '../plugins/lark/LarkAdapter';
import {
  createMainMenuCard as createDingTalkMainMenuCard,
  createErrorRecoveryCard as createDingTalkErrorRecoveryCard,
  createResponseActionsCard as createDingTalkResponseActionsCard,
  createToolConfirmationCard as createDingTalkToolConfirmationCard,
} from '../plugins/dingtalk/DingTalkCards';
import { convertHtmlToDingTalkMarkdown } from '../plugins/dingtalk/DingTalkAdapter';
import { createMainMenuKeyboard, createToolConfirmationKeyboard } from '../plugins/telegram/TelegramKeyboards';
import { escapeHtml, markdownToTelegramHtml } from '../plugins/telegram/TelegramAdapter';
import { stripHtml } from '../plugins/weixin/WeixinAdapter';
import type { ChannelAgentType, IUnifiedIncomingMessage, IUnifiedOutgoingMessage, PluginType } from '../types';
import type { PluginManager } from './PluginManager';
import { buildChannelConversationExtra, resolveChannelSendProtocol } from '../utils';

// ==================== Platform-specific Helpers ====================

/**
 * Get main menu reply markup based on platform
 */
function getMainMenuMarkup(platform: PluginType) {
  if (platform === 'lark') {
    return createMainMenuCard();
  }
  if (platform === 'dingtalk') {
    return createDingTalkMainMenuCard();
  }
  return createMainMenuKeyboard();
}

/**
 * Get response actions markup based on platform
 */
function getResponseActionsMarkup(platform: PluginType, text?: string) {
  if (platform === 'dingtalk') {
    return createDingTalkResponseActionsCard(text || '');
  }
  // Telegram and Lark: no response action buttons
  return undefined;
}

/**
 * Get tool confirmation markup based on platform
 */
function getToolConfirmationMarkup(
  platform: PluginType,
  callId: string,
  options: Array<{ label: string; value: string }>,
  title?: string,
  description?: string
) {
  if (platform === 'lark') {
    return createToolConfirmationCard(callId, title || 'Confirmation', description || 'Please confirm', options);
  }
  if (platform === 'dingtalk') {
    return createDingTalkToolConfirmationCard(
      callId,
      title || 'Confirmation',
      description || 'Please confirm',
      options
    );
  }
  return createToolConfirmationKeyboard(callId, options);
}

/**
 * Get error recovery markup based on platform
 */
function getErrorRecoveryMarkup(platform: PluginType, errorMessage?: string) {
  if (platform === 'lark') {
    return createErrorRecoveryCard(errorMessage);
  }
  if (platform === 'dingtalk') {
    return createDingTalkErrorRecoveryCard(errorMessage);
  }
  return createMainMenuKeyboard(); // Telegram uses main menu for recovery
}

/**
 * Escape/format text for platform
 */
function formatTextForPlatform(text: string, platform: PluginType): string {
  if (platform === 'lark') {
    return convertHtmlToLarkMarkdown(text);
  }
  if (platform === 'dingtalk') {
    return convertHtmlToDingTalkMarkdown(text);
  }
  if (platform === 'telegram') {
    return markdownToTelegramHtml(text);
  }
  if (platform === 'weixin') {
    return stripHtml(text);
  }
  return escapeHtml(text);
}

/**
 * 获取确认选项
 * Get confirmation options based on type
 */
function getConfirmationOptions(type: string): Array<{ label: string; value: string }> {
  switch (type) {
    case 'edit':
      return [
        { label: '✅ Allow Once', value: 'proceed_once' },
        { label: '✅ Always Allow', value: 'proceed_always' },
        { label: '❌ Cancel', value: 'cancel' },
      ];
    case 'exec':
      return [
        { label: '✅ Allow Execution', value: 'proceed_once' },
        { label: '✅ Always Allow', value: 'proceed_always' },
        { label: '❌ Cancel', value: 'cancel' },
      ];
    case 'mcp':
      return [
        { label: '✅ Allow Once', value: 'proceed_once' },
        { label: '✅ Always Allow Tool', value: 'proceed_always_tool' },
        { label: '✅ Always Allow Server', value: 'proceed_always_server' },
        { label: '❌ Cancel', value: 'cancel' },
      ];
    default:
      return [
        { label: '✅ Confirm', value: 'proceed_once' },
        { label: '❌ Cancel', value: 'cancel' },
      ];
  }
}

/**
 * 获取确认提示文本
 * Get confirmation prompt text
 * 注意：所有用户输入的内容都需要转义 HTML 特殊字符
 * Note: All user input content needs HTML special characters escaped
 */
function getConfirmationPrompt(details: { type: string; title?: string; [key: string]: any }): string {
  if (!details) return 'Please confirm the operation';

  switch (details.type) {
    case 'edit':
      return `📝 <b>Edit File Confirmation</b>\nFile: <code>${escapeHtml(details.fileName || 'Unknown file')}</code>\n\nAllow editing this file?`;
    case 'exec':
      return `⚡ <b>Execute Command Confirmation</b>\nCommand: <code>${escapeHtml(details.command || 'Unknown command')}</code>\n\nAllow executing this command?`;
    case 'mcp':
      return `🔧 <b>MCP Tool Confirmation</b>\nTool: <code>${escapeHtml(details.toolDisplayName || details.toolName || 'Unknown tool')}</code>\nServer: <code>${escapeHtml(details.serverName || 'Unknown server')}</code>\n\nAllow calling this tool?`;
    case 'info':
      return `ℹ️ <b>Information Confirmation</b>\n${escapeHtml(details.prompt || '')}\n\nContinue?`;
    default:
      return 'Please confirm the operation';
  }
}

/**
 * 将 TMessage 转换为 IUnifiedOutgoingMessage
 * Convert TMessage to IUnifiedOutgoingMessage for platform
 */
function convertTMessageToOutgoing(
  message: TMessage,
  platform: PluginType,
  isComplete = false
): IUnifiedOutgoingMessage {
  switch (message.type) {
    case 'text': {
      // 根据平台格式化文本
      // Format text based on platform
      const rawText = formatTextForPlatform(message.content.content || '', platform);
      const text = rawText.trim() ? rawText : '...';
      return {
        type: 'text',
        text,
        parseMode: 'HTML',
        replyMarkup: isComplete ? getResponseActionsMarkup(platform, text) : undefined,
      };
    }

    case 'tips': {
      const icon = message.content.type === 'error' ? '❌' : message.content.type === 'success' ? '✅' : '⚠️';
      const content = formatTextForPlatform(message.content.content || '', platform);
      return {
        type: 'text',
        text: `${icon} ${content}`,
        parseMode: 'HTML',
      };
    }

    case 'tool_group': {
      // 显示工具调用状态
      // Show tool call status
      const toolLines = message.content.map((tool) => {
        const statusIcon =
          tool.status === 'Success'
            ? '✅'
            : tool.status === 'Error'
              ? '❌'
              : tool.status === 'Executing'
                ? '⏳'
                : tool.status === 'Confirming'
                  ? '❓'
                  : '📋';
        const desc = formatTextForPlatform(tool.description || tool.name || '', platform);
        return `${statusIcon} ${desc}`;
      });

      // 检查是否有需要确认的工具
      // Check if there are tools that need confirmation
      const confirmingTool = message.content.find((tool) => tool.status === 'Confirming' && tool.confirmationDetails);
      if (confirmingTool && confirmingTool.confirmationDetails) {
        // WeChat (weixin) uses yoloMode — tool confirmations are auto-approved in the background.
        // Showing "Continue?" without interactive buttons is confusing, so just show tool progress.
        if (platform === 'weixin') {
          return {
            type: 'text',
            text: toolLines.join('\n') || '⏳ 正在执行工具...',
            parseMode: 'HTML',
          };
        }

        // 根据确认类型生成选项
        // Generate options based on confirmation type
        const options = getConfirmationOptions(confirmingTool.confirmationDetails.type);
        const confirmText = toolLines.join('\n') + '\n\n' + getConfirmationPrompt(confirmingTool.confirmationDetails);

        return {
          type: 'text',
          text: confirmText,
          parseMode: 'HTML',
          replyMarkup: getToolConfirmationMarkup(
            platform,
            confirmingTool.callId,
            options,
            'Tool Confirmation',
            confirmText
          ),
        };
      }

      return {
        type: 'text',
        text: toolLines.join('\n') || '🔧 Executing tools...',
        parseMode: 'HTML',
      };
    }

    case 'tool_call': {
      const statusIcon = message.content.status === 'success' ? '✅' : message.content.status === 'error' ? '❌' : '⏳';
      const name = formatTextForPlatform(message.content.name || '', platform);
      return {
        type: 'text',
        text: `${statusIcon} ${name}`,
        parseMode: 'HTML',
      };
    }

    case 'acp_permission':
    case 'codex_permission': {
      // Channels (Telegram/Lark) use automatic approval via yoloMode.
      // Show a subtle indicator instead of an error message.
      return {
        type: 'text',
        text: `⏳ ${formatTextForPlatform('Applying automatic approval for permission request...', platform)}`,
        parseMode: 'HTML',
      };
    }

    default:
      // 其他类型暂不支持，显示通用消息
      // Other types not supported yet, show generic message
      return {
        type: 'text',
        text: '⏳ Processing...',
        parseMode: 'HTML',
      };
  }
}

/**
 * ActionExecutor - Routes and executes actions from incoming messages
 *
 * Responsibilities:
 * - Route actions to appropriate handlers (platform/system/chat)
 * - Handle AI chat processing through Gemini
 * - Manage streaming responses
 * - Execute action handlers with proper context
 */
export class ActionExecutor {
  private pluginManager: PluginManager;
  private sessionManager: SessionManager;
  private pairingService: PairingService;

  // Action registry
  private actionRegistry: Map<string, IRegisteredAction> = new Map();

  constructor(pluginManager: PluginManager, sessionManager: SessionManager, pairingService: PairingService) {
    this.pluginManager = pluginManager;
    this.sessionManager = sessionManager;
    this.pairingService = pairingService;

    // Register all actions
    this.registerActions();
  }

  /**
   * Get the message handler for plugins
   */
  getMessageHandler(): PluginMessageHandler {
    return this.handleIncomingMessage.bind(this);
  }

  /**
   * Handle incoming message from plugin
   */
  private async handleIncomingMessage(message: IUnifiedIncomingMessage): Promise<void> {
    const { platform, chatId, user, content, action } = message;

    // Get plugin for sending responses
    const plugin = this.getPluginForMessage(message);
    if (!plugin) {
      console.error(`[ActionExecutor] No plugin found for platform: ${platform}`);
      return;
    }

    // Build action context
    const context: IActionContext = {
      platform,
      pluginId: `${platform}_default`, // TODO: Get actual plugin ID
      userId: user.id,
      chatId,
      displayName: user.displayName,
      originalMessage: message,
      originalMessageId: message.id,
      sendMessage: async (msg) => plugin.sendMessage(chatId, msg),
      editMessage: async (msgId, msg) => plugin.editMessage(chatId, msgId, msg),
    };

    try {
      // Check if user is authorized
      const isAuthorized = await this.pairingService.isUserAuthorized(user.id, platform);

      // Handle /start command - always show pairing
      if (content.type === 'command' && content.text === '/start') {
        const result = await handlePairingShow(context);
        if (result.message) {
          await context.sendMessage(result.message);
        }
        return;
      }

      // If not authorized, show pairing flow
      if (!isAuthorized) {
        const result = await handlePairingShow(context);
        if (result.message) {
          await context.sendMessage(result.message);
        }
        return;
      }

      // User is authorized - look up the assistant user
      const db = await getDatabase();
      const userResult = db.getChannelUserByPlatform(user.id, platform);
      const channelUser = userResult.data;

      if (!channelUser) {
        console.error(`[ActionExecutor] Authorized user not found in database: ${user.id}`);
        await context.sendMessage({
          type: 'text',
          text: '❌ User data error. Please re-pair your account.',
          parseMode: 'HTML',
        });
        return;
      }

      // Set the assistant user in context
      context.channelUser = channelUser;

      // Get or create session (scoped by chatId for per-chat isolation)
      let session = this.sessionManager.getSession(channelUser.id, chatId);
      if (!session || !session.conversationId) {
        const source = platform;

        // Read selected agent for this platform (defaults to Gemini)
        let savedAgent: unknown = undefined;
        try {
          savedAgent = await ProcessConfig.get(
            `assistant.${platform}.agent` as Parameters<typeof ProcessConfig.get>[0]
          );
        } catch {
          // ignore
        }
        const backend = (
          savedAgent && typeof savedAgent === 'object' && typeof (savedAgent as any).backend === 'string'
            ? (savedAgent as any).backend
            : 'gemini'
        ) as string;
        const customAgentId =
          savedAgent && typeof savedAgent === 'object'
            ? ((savedAgent as any).customAgentId as string | undefined)
            : undefined;
        const agentName =
          savedAgent && typeof savedAgent === 'object' ? ((savedAgent as any).name as string | undefined) : undefined;

        // Always resolve a provider model (required by ICreateConversationParams typing; ignored by ACP/Codex)
        const model = await getChannelDefaultModel(platform);

        // Map backend to conversation type for lookup
        const { convType, convBackend } = resolveChannelConvType(backend);
        const conversationName = getChannelConversationName(platform, convType, convBackend, chatId);
        const conversationExtra = buildChannelConversationExtra({
          platform,
          backend,
          customAgentId,
          agentName,
        });

        // Lookup existing conversation by source + chatId + type + backend (per-chat isolation)
        const db2 = await getDatabase();
        const latest = db2.findChannelConversation(source, chatId, convType, convBackend);
        const existing = latest.success ? latest.data : null;

        let sessionConversation: TChatConversation | null = existing ?? null;
        if (!sessionConversation) {
          try {
            if (backend === 'gemini') {
              sessionConversation = await conversationServiceSingleton.createConversation({
                type: 'gemini',
                model,
                name: conversationName,
                source,
                channelChatId: chatId,
                extra: conversationExtra,
              });
            } else if (backend === 'codex') {
              sessionConversation = await conversationServiceSingleton.createConversation({
                type: 'codex',
                model,
                name: conversationName,
                source,
                channelChatId: chatId,
                extra: conversationExtra,
              });
            } else if (backend === 'openclaw-gateway') {
              sessionConversation = await conversationServiceSingleton.createConversation({
                type: 'openclaw-gateway',
                model,
                name: conversationName,
                source,
                channelChatId: chatId,
                extra: conversationExtra,
              });
            } else {
              sessionConversation = await conversationServiceSingleton.createConversation({
                type: 'acp',
                model,
                name: conversationName,
                source,
                channelChatId: chatId,
                extra: conversationExtra,
              });
            }
          } catch (error) {
            console.error(`[ActionExecutor] Failed to create conversation:`, error);
            await context.sendMessage({
              type: 'text',
              text: `❌ Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
              parseMode: 'HTML',
            });
            return;
          }
        }

        if (sessionConversation) {
          const { convType: agentType } = resolveChannelConvType(backend);
          session = await this.sessionManager.createSessionWithConversation(
            channelUser,
            sessionConversation.id,
            agentType as ChannelAgentType,
            undefined,
            chatId
          );
        }
      }
      context.sessionId = session.id;
      context.conversationId = session.conversationId;

      // Route based on action or content
      if (action) {
        // Explicit action from button press
        await this.executeAction(context, action.name, action.params);
      } else if (content.type === 'action') {
        // Action encoded in content
        await this.executeAction(context, content.text, {});
      } else if (content.type === 'text' && content.text) {
        // Regular text message - send to AI
        await this.handleChatMessage(context, content.text);
      } else {
        // Unsupported content type
        await context.sendMessage({
          type: 'text',
          text: 'This message type is not supported. Please send a text message.',
          parseMode: 'HTML',
          replyMarkup: getMainMenuMarkup(platform as PluginType),
        });
      }
    } catch (error: any) {
      console.error(`[ActionExecutor] Error handling message:`, error);
      await context.sendMessage({
        type: 'text',
        text: `❌ Error processing message: ${error.message}`,
        parseMode: 'HTML',
        replyMarkup: getErrorRecoveryMarkup(platform as PluginType, error.message),
      });
    }
  }

  /**
   * Execute a registered action
   */
  private async executeAction(
    context: IActionContext,
    actionName: string,
    params?: Record<string, string>
  ): Promise<void> {
    const action = this.actionRegistry.get(actionName);

    if (!action) {
      console.warn(`[ActionExecutor] Unknown action: ${actionName}`);
      await context.sendMessage({
        type: 'text',
        text: `Unknown action: ${actionName}`,
        parseMode: 'HTML',
      });
      return;
    }

    try {
      const result = await action.handler(context, params);

      if (result.message) {
        await context.sendMessage(result.message);
      }
    } catch (error: any) {
      console.error(`[ActionExecutor] Action ${actionName} failed:`, error);
      await context.sendMessage({
        type: 'text',
        text: `❌ Action failed: ${error.message}`,
        parseMode: 'HTML',
      });
    }
  }

  /**
   * Handle chat message - send to AI and stream response
   */
  private async handleChatMessage(context: IActionContext, text: string): Promise<void> {
    // Update session activity (scoped by chatId)
    if (context.channelUser) {
      this.sessionManager.updateSessionActivity(context.channelUser.id, context.chatId);
    }

    // Send "thinking" indicator
    const thinkingMsgId = await context.sendMessage({
      type: 'text',
      text: '⏳ Thinking...',
      parseMode: 'HTML',
    });

    try {
      const sessionId = context.sessionId;
      const conversationId = context.conversationId;

      if (!sessionId || !conversationId) {
        throw new Error('Session not initialized');
      }

      const messageService = getChannelMessageService();

      // 节流控制：使用定时器机制确保最后一条消息能被发送
      // Throttle control: use timer mechanism to ensure last message is sent
      let lastUpdateTime = 0;
      const UPDATE_THROTTLE_MS = 500; // Update at most every 500ms
      let pendingUpdateTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingMessage: IUnifiedOutgoingMessage | null = null;

      // 跟踪已发送的消息 ID，用于新插入消息的管理
      // Track sent message IDs for new inserted messages
      const sentMessageIds: string[] = [thinkingMsgId];

      // 跟踪最后一条消息内容，用于流结束后添加操作按钮
      // Track last message content for adding action buttons after stream ends
      let lastMessageContent: IUnifiedOutgoingMessage | null = null;

      // 执行消息编辑的函数
      // Function to perform message edit
      const doEditMessage = async (msg: IUnifiedOutgoingMessage) => {
        lastUpdateTime = Date.now();
        const targetMsgId = sentMessageIds[sentMessageIds.length - 1] || thinkingMsgId;
        try {
          await context.editMessage(targetMsgId, msg);
        } catch {
          // Ignore edit errors (message not modified, etc.)
        }
      };

      // 发送消息
      // Send message
      await messageService.sendMessage(
        sessionId,
        conversationId,
        text,
        async (message: TMessage, isInsert: boolean) => {
          const now = Date.now();

          // 转换消息格式（根据平台）
          // Convert message format (based on platform)
          const outgoingMessage = convertTMessageToOutgoing(message, context.platform as PluginType, false);

          // Strip replyMarkup during streaming to prevent premature card finalization.
          // Tool confirmation cards set replyMarkup (e.g., for Confirming status),
          // but DingTalk interprets replyMarkup as "stream complete" and finishes the AI Card.
          // Channel conversations use yoloMode (auto-approve), so confirmation buttons are unnecessary.
          const streamOutgoing: IUnifiedOutgoingMessage = {
            ...outgoingMessage,
            replyMarkup: undefined,
          };

          // 保存最后一条消息内容（不含 replyMarkup，最终消息会单独添加）
          // Save last message content (without replyMarkup, final message adds it separately)
          lastMessageContent = streamOutgoing;

          // IMPORTANT: Always treat first streaming message as update to thinking message
          // This prevents async race condition where first insert's sendMessage takes time
          // while subsequent messages arrive and get processed as updates
          // 重要：始终将第一个流式消息视为更新thinking消息
          // 这可以防止异步竞态条件：第一个insert的sendMessage耗时时，后续消息已到达并被当作update处理
          if (isInsert && sentMessageIds.length === 1) {
            // First streaming message: update thinking message instead of inserting
            // 第一个流式消息：更新thinking消息而不是插入新消息
            pendingMessage = streamOutgoing;

            if (now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
              if (pendingUpdateTimer) {
                clearTimeout(pendingUpdateTimer);
                pendingUpdateTimer = null;
              }
              await doEditMessage(streamOutgoing);
            } else {
              if (pendingUpdateTimer) {
                clearTimeout(pendingUpdateTimer);
              }
              const delay = UPDATE_THROTTLE_MS - (now - lastUpdateTime);
              pendingUpdateTimer = setTimeout(() => {
                if (pendingMessage) {
                  void doEditMessage(pendingMessage);
                  pendingMessage = null;
                }
                pendingUpdateTimer = null;
              }, delay);
            }
          } else if (isInsert) {
            // 新消息：发送新消息
            // New message: send new message
            try {
              const newMsgId = await context.sendMessage(streamOutgoing);
              sentMessageIds.push(newMsgId);
            } catch {
              // Ignore send errors
            }
          } else {
            // 更新消息：使用定时器节流，确保最后一条消息能被发送
            // Update message: throttle with timer to ensure last message is sent
            pendingMessage = streamOutgoing;

            if (now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
              // 距离上次发送超过节流时间，立即发送
              // Enough time has passed since last send, send immediately
              if (pendingUpdateTimer) {
                clearTimeout(pendingUpdateTimer);
                pendingUpdateTimer = null;
              }
              await doEditMessage(streamOutgoing);
            } else {
              // 在节流时间内，设置定时器延迟发送
              // Within throttle window, set timer to send later
              if (pendingUpdateTimer) {
                clearTimeout(pendingUpdateTimer);
              }
              const delay = UPDATE_THROTTLE_MS - (now - lastUpdateTime);
              pendingUpdateTimer = setTimeout(() => {
                if (pendingMessage) {
                  void doEditMessage(pendingMessage);
                  pendingMessage = null;
                }
                pendingUpdateTimer = null;
              }, delay);
            }
          }
        }
      );

      // 清除待处理的定时器，确保最后一条消息被处理
      // Clear pending timer and ensure last message is processed
      if (pendingUpdateTimer) {
        clearTimeout(pendingUpdateTimer);
        pendingUpdateTimer = null;
      }
      // 如果有待发送的消息，立即发送
      // If there's a pending message, send it immediately
      if (pendingMessage) {
        try {
          await doEditMessage(pendingMessage);
        } catch {
          // Ignore final edit error
        }
        pendingMessage = null;
      }

      // 流结束后，更新最后一条消息添加操作按钮（保留原内容）
      // After stream ends, update last message with action buttons (keep original content)
      const lastMsgId = sentMessageIds[sentMessageIds.length - 1] || thinkingMsgId;
      try {
        const finalizedMessage =
          context.platform === 'weixin' && context.conversationId && lastMessageContent?.text !== undefined
            ? await resolveChannelSendProtocol(lastMessageContent.text, context.conversationId)
            : null;

        // 使用最后一条消息的实际内容，添加操作按钮（根据平台）
        // Use actual content of last message, add action buttons (based on platform)
        const responseMarkup = getResponseActionsMarkup(
          context.platform as PluginType,
          finalizedMessage?.visibleText ?? lastMessageContent?.text
        );
        const finalMessage: IUnifiedOutgoingMessage = lastMessageContent
          ? {
              ...lastMessageContent,
              ...(finalizedMessage
                ? {
                    text: finalizedMessage.visibleText,
                    mediaActions: finalizedMessage.mediaActions,
                  }
                : {}),
              replyMarkup: responseMarkup,
            }
          : {
              type: 'text',
              text: '✅ Done',
              parseMode: 'HTML',
              replyMarkup: responseMarkup,
            };
        await context.editMessage(lastMsgId, finalMessage);
      } catch {
        // 忽略最终编辑错误
        // Ignore final edit error
      }
    } catch (error: any) {
      console.error(`[ActionExecutor] Chat processing failed:`, error);

      // Update message with error
      const errorResponse = buildChatErrorResponse(error.message);
      await context.editMessage(thinkingMsgId, {
        type: 'text',
        text: errorResponse.text,
        parseMode: errorResponse.parseMode,
        replyMarkup: errorResponse.replyMarkup,
      });
    }
  }

  /**
   * Get plugin instance for a message
   */
  private getPluginForMessage(message: IUnifiedIncomingMessage) {
    // For now, get the first plugin of the matching type
    const plugins = this.pluginManager.getAllPlugins();
    return plugins.find((p) => p.type === message.platform);
  }

  /**
   * Register all actions
   */
  private registerActions(): void {
    // Register system actions
    for (const action of systemActions) {
      this.actionRegistry.set(action.name, action);
    }

    // Register chat actions
    for (const action of chatActions) {
      this.actionRegistry.set(action.name, action);
    }

    // Register platform actions
    for (const action of platformActions) {
      this.actionRegistry.set(action.name, action);
    }
  }
}
