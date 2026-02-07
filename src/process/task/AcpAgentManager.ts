import { AcpAgent } from '@/agent/acp';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/constants';
import type { IResponseMessage } from '@/common/ipcBridge';
import { parseError, uuid } from '@/common/utils';
import type { AcpBackend, AcpPermissionOption, AcpPermissionRequest } from '@/types/acpTypes';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import { getDatabase } from '@process/database';
import { ProcessConfig } from '../initStorage';
import { addMessage, addOrUpdateMessage, nextTickToLocalFinish } from '../message';
import { handlePreviewOpenEvent } from '../utils/previewUtils';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { prepareFirstMessageWithSkillsIndex } from './agentUtils';
import BaseAgentManager from './BaseAgentManager';
import { hasCronCommands } from './CronCommandDetector';
import { extractTextFromMessage, processCronInMessage } from './MessageMiddleware';
import { stripThinkTags } from './ThinkTagDetector';

interface AcpAgentManagerData {
  workspace?: string;
  backend: AcpBackend;
  cliPath?: string;
  customWorkspace?: boolean;
  conversation_id: string;
  customAgentId?: string; // 用于标识特定自定义代理的 UUID / UUID for identifying specific custom agent
  presetContext?: string; // 智能助手的预设规则/提示词 / Preset context from smart assistant
  /** 启用的 skills 列表，用于过滤 SkillManager 加载的 skills / Enabled skills list for filtering SkillManager skills */
  enabledSkills?: string[];
  /** Force yolo mode (auto-approve) - used by CronService for scheduled tasks */
  yoloMode?: boolean;
  /** ACP session ID for resume support / ACP session ID 用于会话恢复 */
  acpSessionId?: string;
  /** Last update time of ACP session / ACP session 最后更新时间 */
  acpSessionUpdatedAt?: number;
}

class AcpAgentManager extends BaseAgentManager<AcpAgentManagerData, AcpPermissionOption> {
  workspace: string;
  agent: AcpAgent;
  private bootstrap: Promise<AcpAgent> | undefined;
  private isFirstMessage: boolean = true;
  options: AcpAgentManagerData;
  // Track current message for cron detection (accumulated from streaming chunks)
  private currentMsgId: string | null = null;
  private currentMsgContent: string = '';

  constructor(data: AcpAgentManagerData) {
    super('acp', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.options = data;
  }

  initAgent(data: AcpAgentManagerData = this.options) {
    if (this.bootstrap) return this.bootstrap;
    this.bootstrap = (async () => {
      let cliPath = data.cliPath;
      let customArgs: string[] | undefined;
      let customEnv: Record<string, string> | undefined;
      let yoloMode: boolean | undefined;

      // 处理自定义后端：从 acp.customAgents 配置数组中读取
      // Handle custom backend: read from acp.customAgents config array
      if (data.backend === 'custom' && data.customAgentId) {
        const customAgents = await ProcessConfig.get('acp.customAgents');
        // 通过 UUID 查找对应的自定义代理配置 / Find custom agent config by UUID
        const customAgentConfig = customAgents?.find((agent) => agent.id === data.customAgentId);
        if (customAgentConfig?.defaultCliPath) {
          // Parse defaultCliPath which may contain command + args (e.g., "node /path/to/file.js" or "goose acp")
          const parts = customAgentConfig.defaultCliPath.trim().split(/\s+/);
          cliPath = parts[0]; // First part is the command

          // 参数优先级：acpArgs > defaultCliPath 中解析的参数
          // Argument priority: acpArgs > args parsed from defaultCliPath
          if (customAgentConfig.acpArgs) {
            customArgs = customAgentConfig.acpArgs;
          } else if (parts.length > 1) {
            customArgs = parts.slice(1); // Fallback to parsed args
          }
          customEnv = customAgentConfig.env;
        }
      } else if (data.backend !== 'custom') {
        // Handle built-in backends: read from acp.config
        const config = await ProcessConfig.get('acp.config');
        if (!cliPath && config?.[data.backend]?.cliPath) {
          cliPath = config[data.backend].cliPath;
        }
        // yoloMode priority: data.yoloMode (from CronService) > config setting
        // yoloMode 优先级：data.yoloMode（来自 CronService）> 配置设置
        yoloMode = data.yoloMode ?? (config?.[data.backend] as any)?.yoloMode;

        // Get acpArgs from backend config (for goose, auggie, opencode, etc.)
        const backendConfig = ACP_BACKENDS_ALL[data.backend];
        if (backendConfig?.acpArgs) {
          customArgs = backendConfig.acpArgs;
        }

        // 如果没有配置 cliPath，使用 ACP_BACKENDS_ALL 中的默认 cliCommand
        // If cliPath is not configured, fallback to default cliCommand from ACP_BACKENDS_ALL
        if (!cliPath && backendConfig?.cliCommand) {
          cliPath = backendConfig.cliCommand;
        }
      } else {
        // backend === 'custom' but no customAgentId - this is an invalid state
        // 自定义后端但缺少 customAgentId - 这是无效状态
        console.warn('[AcpAgentManager] Custom backend specified but customAgentId is missing');
      }

      this.agent = new AcpAgent({
        id: data.conversation_id,
        backend: data.backend,
        cliPath: cliPath,
        workingDir: data.workspace,
        customArgs: customArgs,
        customEnv: customEnv,
        extra: {
          workspace: data.workspace,
          backend: data.backend,
          cliPath: cliPath,
          customWorkspace: data.customWorkspace,
          customArgs: customArgs,
          customEnv: customEnv,
          yoloMode: yoloMode,
          acpSessionId: data.acpSessionId,
          acpSessionUpdatedAt: data.acpSessionUpdatedAt,
        },
        onSessionIdUpdate: (sessionId: string) => {
          // Save ACP session ID to database for resume support
          // 保存 ACP session ID 到数据库以支持会话恢复
          this.saveAcpSessionId(sessionId);
        },
        onStreamEvent: (message) => {
          // Handle preview_open event (chrome-devtools navigation interception)
          // 处理 preview_open 事件（chrome-devtools 导航拦截）
          if (handlePreviewOpenEvent(message)) {
            return; // Don't process further / 不需要继续处理
          }

          if (message.type !== 'thought') {
            const tMessage = transformMessage(message as IResponseMessage);
            if (tMessage) {
              addOrUpdateMessage(message.conversation_id, tMessage, data.backend);

              // Track streaming content for cron detection when turn ends
              // ACP sends content in chunks, we accumulate here for later detection
              if (tMessage.type === 'text' && message.type === 'content') {
                const textContent = extractTextFromMessage(tMessage);
                if (tMessage.msg_id !== this.currentMsgId) {
                  // New message, reset accumulator
                  this.currentMsgId = tMessage.msg_id || null;
                  this.currentMsgContent = textContent;
                } else {
                  // Same message, accumulate content
                  this.currentMsgContent += textContent;
                }
              }
            }
          }

          // Filter think tags from streaming content before emitting to UI
          // 在发送到 UI 之前过滤流式内容中的 think 标签
          const filteredMessage = this.filterThinkTagsFromMessage(message as IResponseMessage);
          ipcBridge.acpConversation.responseStream.emit(filteredMessage);
        },
        onSignalEvent: async (v) => {
          // 仅发送信号到前端，不更新消息列表
          if (v.type === 'acp_permission') {
            const { toolCall, options } = v.data as AcpPermissionRequest;
            this.addConfirmation({
              title: toolCall.title || 'messages.permissionRequest',
              action: 'messages.command',
              id: v.msg_id,
              description: toolCall.rawInput?.description || 'messages.agentRequestingPermission',
              callId: toolCall.toolCallId || v.msg_id,
              options: options.map((option) => ({
                label: option.name,
                value: option,
              })),
            });
            return;
          }

          // Clear busy guard when turn ends
          if (v.type === 'finish') {
            cronBusyGuard.setProcessing(this.conversation_id, false);
          }

          // Process cron commands when turn ends (finish signal)
          // ACP streams content in chunks, so we check the accumulated content here
          if (v.type === 'finish' && this.currentMsgContent && hasCronCommands(this.currentMsgContent)) {
            const message: TMessage = {
              id: this.currentMsgId || uuid(),
              msg_id: this.currentMsgId || uuid(),
              type: 'text',
              position: 'left',
              conversation_id: this.conversation_id,
              content: { content: this.currentMsgContent },
              status: 'finish',
              createdAt: Date.now(),
            };
            // Process cron commands and send results back to AI
            const collectedResponses: string[] = [];
            await processCronInMessage(this.conversation_id, data.backend as any, message, (sysMsg) => {
              collectedResponses.push(sysMsg);
              // Also emit to frontend for display
              const systemMessage: IResponseMessage = {
                type: 'system',
                conversation_id: this.conversation_id,
                msg_id: uuid(),
                data: sysMsg,
              };
              ipcBridge.acpConversation.responseStream.emit(systemMessage);
            });
            // Send collected responses back to AI agent so it can continue
            if (collectedResponses.length > 0 && this.agent) {
              const feedbackMessage = `[System Response]\n${collectedResponses.join('\n')}`;
              await this.agent.sendMessage({ content: feedbackMessage });
            }
            // Reset after processing
            this.currentMsgId = null;
            this.currentMsgContent = '';
          }

          ipcBridge.acpConversation.responseStream.emit(v);
        },
      });
      return this.agent.start().then(() => this.agent);
    })();
    return this.bootstrap;
  }

  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<{
    success: boolean;
    msg?: string;
    message?: string;
  }> {
    // Mark conversation as busy to prevent cron jobs from running
    cronBusyGuard.setProcessing(this.conversation_id, true);
    try {
      await this.initAgent(this.options);
      // Save user message to chat history ONLY after successful sending
      if (data.msg_id && data.content) {
        let contentToSend = data.content;
        if (contentToSend.includes(AIONUI_FILES_MARKER)) {
          contentToSend = contentToSend.split(AIONUI_FILES_MARKER)[0].trimEnd();
        }

        // 首条消息时注入预设规则和 skills 索引（来自智能助手配置）
        // Inject preset context and skills INDEX on first message (from smart assistant config)
        if (this.isFirstMessage) {
          contentToSend = await prepareFirstMessageWithSkillsIndex(contentToSend, {
            presetContext: this.options.presetContext,
            enabledSkills: this.options.enabledSkills,
          });
        }

        const userMessage: TMessage = {
          id: data.msg_id,
          msg_id: data.msg_id,
          type: 'text',
          position: 'right',
          conversation_id: this.conversation_id,
          content: {
            content: data.content, // Save original content to history
          },
          createdAt: Date.now(),
        };
        addMessage(this.conversation_id, userMessage);
        const userResponseMessage: IResponseMessage = {
          type: 'user_content',
          conversation_id: this.conversation_id,
          msg_id: data.msg_id,
          data: userMessage.content.content,
        };
        ipcBridge.acpConversation.responseStream.emit(userResponseMessage);

        const result = await this.agent.sendMessage({ ...data, content: contentToSend });
        // 首条消息发送后标记，无论是否有 presetContext
        if (this.isFirstMessage) {
          this.isFirstMessage = false;
        }
        // Note: cronBusyGuard.setProcessing(false) is not called here
        // because the response streaming is still in progress.
        // It will be cleared when the conversation ends or on error.
        return result;
      }
      return await this.agent.sendMessage(data);
    } catch (e) {
      cronBusyGuard.setProcessing(this.conversation_id, false);
      const message: IResponseMessage = {
        type: 'error',
        conversation_id: this.conversation_id,
        msg_id: data.msg_id || uuid(),
        data: parseError(e),
      };

      // Backend handles persistence before emitting to frontend
      const tMessage = transformMessage(message);
      if (tMessage) {
        addOrUpdateMessage(this.conversation_id, tMessage);
      }

      // Emit to frontend for UI display only
      ipcBridge.acpConversation.responseStream.emit(message);
      return new Promise((_, reject) => {
        nextTickToLocalFinish(() => {
          reject(e);
        });
      });
    }
  }

  async confirm(id: string, callId: string, data: AcpPermissionOption) {
    super.confirm(id, callId, data);
    await this.bootstrap;
    void this.agent.confirmMessage({
      confirmKey: data.optionId,
      // msg_id: dat;
      callId: callId,
    });
  }

  /**
   * Filter think tags from message content during streaming
   * This ensures users don't see internal reasoning tags in real-time
   *
   * @param message - The streaming message to filter
   * @returns Message with think tags removed from content
   */
  private filterThinkTagsFromMessage(message: IResponseMessage): IResponseMessage {
    // Only filter content messages
    if (message.type !== 'content' || typeof message.data !== 'string') {
      return message;
    }

    const content = message.data;
    // Quick check to avoid unnecessary processing
    if (!/<think(?:ing)?>/i.test(content)) {
      return message;
    }

    // Strip think tags from content
    const cleanedContent = stripThinkTags(content);

    // Return new message object with cleaned content
    return {
      ...message,
      data: cleanedContent,
    };
  }

  /**
   * Override stop() because AcpAgentManager doesn't use ForkTask's subprocess architecture.
   * It directly creates AcpAgent in the main process, so we need to call agent.stop() directly.
   */
  async stop() {
    if (this.agent) {
      return this.agent.stop();
    }
    return Promise.resolve();
  }

  /**
   * Save ACP session ID to database for resume support.
   * 保存 ACP session ID 到数据库以支持会话恢复。
   */
  private saveAcpSessionId(sessionId: string): void {
    try {
      const db = getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'acp') {
        const conversation = result.data;
        const updatedExtra = {
          ...conversation.extra,
          acpSessionId: sessionId,
          acpSessionUpdatedAt: Date.now(),
        };
        db.updateConversation(this.conversation_id, { extra: updatedExtra } as Partial<typeof conversation>);
        console.log(`[AcpAgentManager] Saved ACP session ID: ${sessionId} for conversation: ${this.conversation_id}`);
      }
    } catch (error) {
      console.error('[AcpAgentManager] Failed to save ACP session ID:', error);
    }
  }
}

export default AcpAgentManager;
