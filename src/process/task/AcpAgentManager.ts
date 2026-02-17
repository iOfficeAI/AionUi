import { promises as fs } from 'fs';
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
import { findSessionFile } from '@process/services/devtools/sessionDiscovery';
import { prepareFirstMessageWithSkillsIndex, runQueueInitHooks } from './agentUtils';
import { AcpMessageQueue, type QueuedMessageSource, type QueuedMessagePriority, type QueueEvent } from './AcpMessageQueue';
/** Enable ACP performance diagnostics via ACP_PERF=1 */
const ACP_PERF_LOG = process.env.ACP_PERF === '1';

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
  /** Path to assistant hooks directory for onQueueInit and other runtime hooks */
  assistantHooksPath?: string;
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
  // Track the ACP session ID in memory so we can write JSONL entries for devtools
  private currentAcpSessionId: string | null = null;
  // Pending hook messages to write to JSONL once the session ID is known
  private pendingQueueOpsToWrite: Array<{ content: string }> | null = null;

  /** Message queue for sequential auto-prompting */
  readonly messageQueue: AcpMessageQueue;

  constructor(data: AcpAgentManagerData) {
    super('acp', data);
    this.conversation_id = data.conversation_id;
    this.workspace = data.workspace;
    this.options = data;
    this.status = 'pending';

    // Initialize message queue with sender wired to sendMessageDirect
    this.messageQueue = new AcpMessageQueue();
    this.messageQueue.setSender((msg) => this.sendMessageDirect(msg));

    // Forward queue events to frontend
    this.messageQueue.on((event: QueueEvent) => {
      ipcBridge.acpConversation.responseStream.emit({
        type: 'queue_status',
        conversation_id: this.conversation_id,
        msg_id: uuid(),
        data: {
          eventType: event.type,
          queueLength: event.queueLength,
          message: event.message ? { id: event.message.id, source: event.message.source, content: event.message.content.substring(0, 100) } : undefined,
          error: event.error,
        },
      });
    });
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
          this.currentAcpSessionId = sessionId; // Track in memory for JSONL writes
          this.saveAcpSessionId(sessionId);
          // Flush any hook messages that were enqueued before the session ID was known
          if (this.pendingQueueOpsToWrite) {
            const pending = this.pendingQueueOpsToWrite;
            this.pendingQueueOpsToWrite = null;
            void this.writeQueueOperationsToSession(pending);
          }
        },
        onStreamEvent: (message) => {
          const pipelineStart = Date.now();

          // Handle preview_open event (chrome-devtools navigation interception)
          // 处理 preview_open 事件（chrome-devtools 导航拦截）
          if (handlePreviewOpenEvent(message)) {
            return; // Don't process further / 不需要继续处理
          }

          // Mark as finished when content is output (visible to user)
          // ACP uses: content, agent_status, acp_tool_call, plan
          const contentTypes = ['content', 'agent_status', 'acp_tool_call', 'plan'];
          if (contentTypes.includes(message.type)) {
            this.status = 'finished';
          }

          if (message.type !== 'thought') {
            const transformStart = Date.now();
            const tMessage = transformMessage(message as IResponseMessage);
            const transformDuration = Date.now() - transformStart;

            if (tMessage) {
              const dbStart = Date.now();
              addOrUpdateMessage(message.conversation_id, tMessage, data.backend);
              const dbDuration = Date.now() - dbStart;

              if (transformDuration > 5 || dbDuration > 5) {
                if (ACP_PERF_LOG) console.log(`[ACP-PERF] stream: transform ${transformDuration}ms, db ${dbDuration}ms type=${message.type}`);
              }

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
          const filterStart = Date.now();
          const filteredMessage = this.filterThinkTagsFromMessage(message as IResponseMessage);
          const filterDuration = Date.now() - filterStart;

          const emitStart = Date.now();
          ipcBridge.acpConversation.responseStream.emit(filteredMessage);
          const emitDuration = Date.now() - emitStart;

          const totalDuration = Date.now() - pipelineStart;
          if (totalDuration > 10) {
            if (ACP_PERF_LOG) console.log(`[ACP-PERF] stream: onStreamEvent pipeline ${totalDuration}ms (filter=${filterDuration}ms, emit=${emitDuration}ms) type=${message.type}`);
          }
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

          // Clear busy guard when turn ends and notify message queue
          if (v.type === 'finish') {
            cronBusyGuard.setProcessing(this.conversation_id, false);
            // Notify message queue so it can process the next queued message
            this.messageQueue.onAgentFinished();
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

  /**
   * Public sendMessage - routes through the message queue for sequential processing.
   * If the agent is currently busy, the message is queued and sent automatically
   * when the current turn finishes.
   */
  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<{
    success: boolean;
    msg?: string;
    message?: string;
  }> {
    // If queue is idle and not processing, send directly for zero-overhead on the normal path
    const queueStatus = this.messageQueue.getStatus();
    if (queueStatus.status === 'idle' && queueStatus.queueLength === 0) {
      return this.sendMessageDirect(data);
    }

    // Queue the message for sequential processing
    this.messageQueue.enqueue({
      content: data.content,
      files: data.files,
      msg_id: data.msg_id,
      priority: 'normal',
      source: 'user',
    });

    return { success: true, msg: 'Message queued' };
  }

  /**
   * Enqueue messages from hooks or external sources.
   * Messages are sent sequentially after the current agent turn finishes.
   */
  enqueueMessages(
    messages: Array<{
      content: string;
      files?: string[];
      priority?: QueuedMessagePriority;
      source?: QueuedMessageSource;
    }>
  ): string[] {
    return this.messageQueue.enqueueAll(
      messages.map((msg) => ({
        content: msg.content,
        files: msg.files,
        priority: msg.priority || 'normal',
        source: msg.source || 'hook',
      }))
    );
  }

  /**
   * Internal direct send - bypasses the queue and sends immediately.
   * This is the actual message sending implementation.
   */
  private async sendMessageDirect(data: { content: string; files?: string[]; msg_id?: string }): Promise<{
    success: boolean;
    msg?: string;
    message?: string;
  }> {
    const managerSendStart = Date.now();
    // Mark conversation as busy to prevent cron jobs from running
    cronBusyGuard.setProcessing(this.conversation_id, true);
    // Set status to running when message is being processed
    this.status = 'running';
    try {
      const initStart = Date.now();
      await this.initAgent(this.options);
      if (ACP_PERF_LOG) console.log(`[ACP-PERF] manager: initAgent completed ${Date.now() - initStart}ms`);
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

        const agentSendStart = Date.now();
        const result = await this.agent.sendMessage({ ...data, content: contentToSend });
        if (ACP_PERF_LOG) console.log(`[ACP-PERF] manager: agent.sendMessage completed ${Date.now() - agentSendStart}ms (total manager.sendMessage: ${Date.now() - managerSendStart}ms)`);
        // 首条消息发送后标记，无论是否有 presetContext
        if (this.isFirstMessage) {
          this.isFirstMessage = false;
          // Run onQueueInit hooks to populate the message queue
          // Messages will be sent after the agent finishes this turn
          void this.runQueueInitHooks();
        }
        // Note: cronBusyGuard.setProcessing(false) is not called here
        // because the response streaming is still in progress.
        // It will be cleared when the conversation ends or on error.
        return result;
      }
      const agentSendStart = Date.now();
      const result = await this.agent.sendMessage(data);
      console.log(`[ACP-PERF] manager: agent.sendMessage completed ${Date.now() - agentSendStart}ms (total manager.sendMessage: ${Date.now() - managerSendStart}ms)`);
      return result;
    } catch (e) {
      cronBusyGuard.setProcessing(this.conversation_id, false);
      this.status = 'finished';
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
   * Run onQueueInit hooks to collect and enqueue messages from hook modules.
   * Called once after the first message is sent.
   */
  private async runQueueInitHooks(): Promise<void> {
    try {
      const messages = await runQueueInitHooks({
        workspace: this.workspace,
        backend: this.options.backend,
        conversationId: this.conversation_id,
        enabledSkills: this.options.enabledSkills,
        presetContext: this.options.presetContext,
        assistantHooksPath: this.options.assistantHooksPath,
      });
      if (messages.length > 0) {
        console.log(`[AcpAgentManager] onQueueInit hook returned ${messages.length} messages to enqueue`);
        this.enqueueMessages(messages);
        void this.writeQueueOperationsToSession(messages); // Write to JSONL for devtools
      }
    } catch (error) {
      console.warn('[AcpAgentManager] onQueueInit hooks failed:', error);
    }
  }

  /**
   * Write queue-operation JSONL entries for hook-queued messages so the devtools
   * session analyzer can surface them as user messages.
   * If the session ID isn't known yet, stores the messages to be flushed when it arrives.
   */
  private async writeQueueOperationsToSession(messages: Array<{ content: string }>): Promise<void> {
    if (!this.currentAcpSessionId) {
      // Session ID not yet known — store for later flush in onSessionIdUpdate
      this.pendingQueueOpsToWrite = messages;
      return;
    }
    const sessionFile = findSessionFile(this.currentAcpSessionId, this.workspace);
    if (!sessionFile) return;

    const ts = new Date().toISOString();
    const entries = messages.map((msg) =>
      JSON.stringify({
        type: 'queue-operation',
        operation: 'enqueue',
        timestamp: ts,
        sessionId: this.currentAcpSessionId,
        content: msg.content,
        source: 'hook',
      })
    );

    try {
      await fs.appendFile(sessionFile, entries.join('\n') + '\n', 'utf-8');
    } catch (error) {
      console.warn('[AcpAgentManager] Failed to write queue-operation entries to JSONL:', error);
    }
  }

  /**
   * Override stop() because AcpAgentManager doesn't use ForkTask's subprocess architecture.
   * It directly creates AcpAgent in the main process, so we need to call agent.stop() directly.
   * Also clears the message queue to prevent queued messages from being sent.
   */
  async stop() {
    this.messageQueue.clear();
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
