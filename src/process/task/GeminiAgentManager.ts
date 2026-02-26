/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { channelEventBus } from '@/channels/agent/ChannelEventBus';
import { ipcBridge } from '@/common';
import type { IMessageToolGroup, TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { IMcpServer, TProviderWithModel } from '@/common/storage';
import { ProcessConfig, getSkillsDir } from '@/process/initStorage';
import { buildSystemInstructionsWithSkillsIndex } from './agentUtils';
import { detectSkillLoadRequest, AcpSkillManager, buildSkillContentText } from './AcpSkillManager';
import { uuid } from '@/common/utils';
import { getProviderAuthType } from '@/common/utils/platformAuthType';
import { AuthType, getOauthInfoWithCache } from '@office-ai/aioncli-core';
import { GeminiApprovalStore } from '../../agent/gemini/GeminiApprovalStore';
import { ToolConfirmationOutcome } from '../../agent/gemini/cli/tools/tools';
import { getDatabase } from '@process/database';
import { addMessage, addOrUpdateMessage, nextTickToLocalFinish } from '../message';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { handlePreviewOpenEvent } from '../utils/previewUtils';
import BaseAgentManager from './BaseAgentManager';
import { hasCronCommands } from './CronCommandDetector';
import { extractTextFromMessage, processCronInMessage } from './MessageMiddleware';
import { stripThinkTags } from './ThinkTagDetector';

// gemini agent管理器类
type UiMcpServerConfig = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: 'sse' | 'http';
  headers?: Record<string, string>;
  description?: string;
};

export class GeminiAgentManager extends BaseAgentManager<
  {
    workspace: string;
    model: TProviderWithModel;
    imageGenerationModel?: TProviderWithModel;
    webSearchEngine?: 'google' | 'default';
    mcpServers?: Record<string, UiMcpServerConfig>;
    contextFileName?: string;
    // 系统规则 / System rules
    presetRules?: string;
    contextContent?: string; // 向后兼容 / Backward compatible
    GOOGLE_CLOUD_PROJECT?: string;
    /** 内置 skills 目录路径 / Builtin skills directory path */
    skillsDir?: string;
    /** 启用的 skills 列表 / Enabled skills list */
    enabledSkills?: string[];
    /** Yolo mode: auto-approve all tool calls / 自动允许模式 */
    yoloMode?: boolean;
  },
  string
> {
  workspace: string;
  model: TProviderWithModel;
  contextFileName?: string;
  presetRules?: string;
  contextContent?: string;
  enabledSkills?: string[];
  private bootstrap: Promise<void>;

  /** Fingerprint of MCP config used by the current worker, for change detection */
  private mcpFingerprint: string = '';

  /** Session-level approval store for "always allow" memory */
  readonly approvalStore = new GeminiApprovalStore();

  private async injectHistoryFromDatabase(): Promise<void> {
    // ... (omitting injectHistoryFromDatabase for space)
  }

  /** Force yolo mode (for cron jobs) / 强制 yolo 模式（用于定时任务） */
  private forceYoloMode?: boolean;

  /** Current session mode for approval behavior / 当前会话模式（影响审批行为） */
  private currentMode: string = 'default';

  /** Stored webSearchEngine for worker re-bootstrap / 保存 webSearchEngine 用于重建 worker */
  private webSearchEngine?: 'google' | 'default';

  constructor(
    data: {
      workspace: string;
      conversation_id: string;
      webSearchEngine?: 'google' | 'default';
      contextFileName?: string;
      // 系统规则 / System rules
      presetRules?: string;
      contextContent?: string; // 向后兼容 / Backward compatible
      /** 启用的 skills 列表 / Enabled skills list */
      enabledSkills?: string[];
      /** Force yolo mode (for cron jobs) / 强制 yolo 模式（用于定时任务） */
      yoloMode?: boolean;
      /** Persisted session mode for resume support / 持久化的会话模式，用于恢复 */
      sessionMode?: string;
    },
    model: TProviderWithModel
  ) {
    super('gemini', { ...data, model });
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.model = model;
    this.contextFileName = data.contextFileName;
    this.presetRules = data.presetRules;
    this.enabledSkills = data.enabledSkills;
    this.forceYoloMode = data.yoloMode;
    this.currentMode = data.sessionMode || 'default';
    this.webSearchEngine = data.webSearchEngine;
    // 向后兼容 / Backward compatible
    this.contextContent = data.contextContent || data.presetRules;
    this.bootstrap = this.createBootstrap();
  }

  /**
   * Create bootstrap promise that initializes the worker with current config.
   * Extracted to allow re-bootstrapping when MCP config changes.
   */
  private createBootstrap(): Promise<void> {
    return Promise.all([ProcessConfig.get('gemini.config'), this.getImageGenerationModel(), this.getMcpServers()])
      .then(async ([config, imageGenerationModel, mcpServers]) => {
        let projectId: string | undefined;
        const authType = getProviderAuthType(this.model);
        const needsGoogleOAuth = authType === AuthType.LOGIN_WITH_GOOGLE || authType === AuthType.USE_VERTEX_AI;

        if (needsGoogleOAuth) {
          try {
            const oauthInfo = await getOauthInfoWithCache(config?.proxy);
            if (oauthInfo && oauthInfo.email && config?.accountProjects) {
              projectId = config.accountProjects[oauthInfo.email];
            }
          } catch {
            // If account retrieval fails, don't set projectId
          }
        }

        // Build system instructions with skills INDEX only (not full content)
        // 使用 skills 索引构建系统指令（不注入全文，按需通过 activate_skill 加载）
        // Builtin skills (e.g. cron) are auto-included in the index by AcpSkillManager
        const skillManager = AcpSkillManager.getInstance(this.enabledSkills);
        await skillManager.discoverSkills(this.enabledSkills);
        const finalPresetRules = await buildSystemInstructionsWithSkillsIndex({
          presetContext: this.presetRules,
          enabledSkills: this.enabledSkills,
        });

        // Merge builtin skill names into enabledSkills for the worker's activate_skill tool
        // 将内置 skill 名称合并到 enabledSkills，使 worker 的 activate_skill 能找到它们
        const builtinSkillNames = skillManager.getBuiltinSkillsIndex().map((s) => s.name);
        const allEnabledSkills = [...new Set([...builtinSkillNames, ...(this.enabledSkills || [])])];

        // Determine yoloMode from legacy config (SecurityModalContent)
        const legacyYoloMode = this.forceYoloMode ?? config?.yoloMode ?? false;
        if (legacyYoloMode && this.currentMode === 'default') {
          this.currentMode = 'yolo';
        }
        if (legacyYoloMode && this.currentMode !== 'yolo') {
          void this.clearLegacyYoloConfig();
        }
        const effectiveYoloMode = this.forceYoloMode ?? this.currentMode === 'yolo';

        return this.start({
          ...config,
          GOOGLE_CLOUD_PROJECT: projectId,
          workspace: this.workspace,
          model: this.model,
          imageGenerationModel,
          webSearchEngine: this.webSearchEngine,
          mcpServers,
          contextFileName: this.contextFileName,
          presetRules: finalPresetRules,
          contextContent: this.contextContent,
          skillsDir: getSkillsDir(),
          // 启用的 skills 列表（含内置 skills），用于 worker 的 activate_skill 工具
          // Enabled skills list (including builtins) for worker's activate_skill tool
          enabledSkills: allEnabledSkills,
          // Yolo mode: derived from currentMode, not directly from legacy config
          yoloMode: effectiveYoloMode,
        });
      })
      .then(async () => {
        await this.injectHistoryFromDatabase();
      });
  }

  private getImageGenerationModel(): Promise<TProviderWithModel | undefined> {
    return ProcessConfig.get('tools.imageGenerationModel')
      .then((imageGenerationModel) => {
        if (imageGenerationModel && imageGenerationModel.switch) {
          return imageGenerationModel;
        }
        return undefined;
      })
      .catch(() => Promise.resolve(undefined));
  }

  /**
   * Compute a fingerprint of ALL MCP servers for change detection.
   * Includes name, enabled, status and transport key for every server so that
   * any add / remove / toggle / reconnect / config-change is detected —
   * even when a server is deleted and re-added with the same name.
   */
  private static computeMcpFingerprint(mcpServers: IMcpServer[] | undefined | null): string {
    if (!mcpServers || !Array.isArray(mcpServers)) return '[]';
    const entries = mcpServers
      .map((s: IMcpServer) => {
        // Include transport identity so config changes (e.g. different command/url) are detected
        const transportKey = s.transport.type === 'stdio' ? `${s.transport.command}|${(s.transport.args || []).join(',')}` : 'url' in s.transport ? s.transport.url : '';
        return { n: s.name, e: s.enabled, st: s.status, t: transportKey };
      })
      .sort((a, b) => a.n.localeCompare(b.n));
    return JSON.stringify(entries);
  }

  private async getMcpServers(): Promise<Record<string, UiMcpServerConfig>> {
    try {
      const mcpServers = await ProcessConfig.get('mcp.config');
      if (!mcpServers || !Array.isArray(mcpServers)) {
        this.mcpFingerprint = '[]';
        return {};
      }

      // Store fingerprint for later change detection
      // 保存指纹用于后续变更检测
      this.mcpFingerprint = GeminiAgentManager.computeMcpFingerprint(mcpServers);

      // 转换为 aioncli-core 期望的格式
      // MCPServerConfig supports: stdio (command/args/env), sse/http (url/type/headers)
      const mcpConfig: Record<string, UiMcpServerConfig> = {};
      mcpServers
        .filter((server: IMcpServer) => server.enabled && server.status === 'connected') // 只使用启用且连接成功的服务器
        .forEach((server: IMcpServer) => {
          if (server.transport.type === 'stdio') {
            mcpConfig[server.name] = {
              command: server.transport.command,
              args: server.transport.args || [],
              env: server.transport.env || {},
              description: server.description,
            };
          } else if (server.transport.type === 'sse' || server.transport.type === 'http' || server.transport.type === 'streamable_http') {
            // aioncli-core MCPServerConfig.type only accepts "sse" | "http"
            const type = server.transport.type === 'streamable_http' ? 'http' : server.transport.type;
            mcpConfig[server.name] = {
              url: server.transport.url,
              type,
              headers: server.transport.headers || {},
              description: server.description,
            };
          }
        });

      return mcpConfig;
    } catch (error) {
      this.mcpFingerprint = '[]';
      return {};
    }
  }

  async sendMessage(data: { input: string; msg_id: string; files?: string[] }) {
    const message: TMessage = {
      id: data.msg_id,
      type: 'text',
      position: 'right',
      conversation_id: this.conversation_id,
      content: {
        content: data.input,
      },
    };
    addMessage(this.conversation_id, message);

    // Check if MCP config has changed since worker was initialized
    // If changed, kill old worker and re-bootstrap with fresh config
    // 检查 MCP 配置是否在 worker 初始化后发生变更
    // 若变更则终止旧 worker 并使用最新配置重新初始化
    await this.refreshWorkerIfMcpChanged();

    this.status = 'pending';
    cronBusyGuard.setProcessing(this.conversation_id, true);
    const result = await this.bootstrap
      .catch((e) => {
        cronBusyGuard.setProcessing(this.conversation_id, false);
        this.emit('gemini.message', {
          type: 'error',
          data: e.message || JSON.stringify(e),
          msg_id: data.msg_id,
        });
        return new Promise((_, reject) => {
          nextTickToLocalFinish(() => {
            reject(e);
          });
        });
      })
      .then(() => super.sendMessage(data))
      .finally(() => {
        cronBusyGuard.setProcessing(this.conversation_id, false);
      });
    return result;
  }

  /**
   * Re-bootstrap the worker if MCP config has changed since last initialization.
   * This ensures deleted/disabled MCP servers are no longer callable.
   */
  private async refreshWorkerIfMcpChanged(): Promise<void> {
    try {
      const mcpServers = await ProcessConfig.get('mcp.config');
      const currentFingerprint = GeminiAgentManager.computeMcpFingerprint(mcpServers);

      if (currentFingerprint !== this.mcpFingerprint) {
        console.log(`[GeminiAgentManager] MCP config changed (${this.mcpFingerprint} -> ${currentFingerprint}), re-bootstrapping worker...`);
        // Kill old worker process and its child processes (MCP server connections)
        this.kill();
        // Re-bootstrap with fresh config (getMcpServers will update the fingerprint)
        this.bootstrap = this.createBootstrap();
        await this.bootstrap;
        console.log('[GeminiAgentManager] Worker re-bootstrapped with updated MCP config');
      }
    } catch (error) {
      console.warn('[GeminiAgentManager] Failed to check MCP config changes:', error);
      // Don't block message sending on MCP check failure
    }
  }

  private getConfirmationButtons = (confirmationDetails: IMessageToolGroup['content'][number]['confirmationDetails'], t: (key: string, options?: any) => string) => {
    if (!confirmationDetails) return {};
    let question: string;
    let description: string;
    const options: Array<{ label: string; value: ToolConfirmationOutcome; params?: Record<string, string> }> = [];
    switch (confirmationDetails.type) {
      case 'edit':
        {
          question = t('messages.confirmation.applyChange');
          description = confirmationDetails.fileName;
          options.push(
            {
              label: t('messages.confirmation.yesAllowOnce'),
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: t('messages.confirmation.yesAllowAlways'),
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: t('messages.confirmation.no'), value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      case 'exec':
        {
          question = t('messages.confirmation.allowExecution');
          description = confirmationDetails.command;
          options.push(
            {
              label: t('messages.confirmation.yesAllowOnce'),
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: t('messages.confirmation.yesAllowAlways'),
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: t('messages.confirmation.no'), value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      case 'info':
        {
          question = t('messages.confirmation.proceed');
          description = confirmationDetails.urls?.join(';') || confirmationDetails.prompt;
          options.push(
            {
              label: t('messages.confirmation.yesAllowOnce'),
              value: ToolConfirmationOutcome.ProceedOnce,
            },
            {
              label: t('messages.confirmation.yesAllowAlways'),
              value: ToolConfirmationOutcome.ProceedAlways,
            },
            { label: t('messages.confirmation.no'), value: ToolConfirmationOutcome.Cancel }
          );
        }
        break;
      default: {
        const mcpProps = confirmationDetails;
        question = t('messages.confirmation.allowMCPTool', {
          toolName: mcpProps.toolName,
          serverName: mcpProps.serverName,
        });
        description = confirmationDetails.serverName + ':' + confirmationDetails.toolName;
        options.push(
          {
            label: t('messages.confirmation.yesAllowOnce'),
            value: ToolConfirmationOutcome.ProceedOnce,
          },
          {
            label: t('messages.confirmation.yesAlwaysAllowTool', {
              toolName: mcpProps.toolName,
              serverName: mcpProps.serverName,
            }),
            value: ToolConfirmationOutcome.ProceedAlwaysTool,
            params: { toolName: mcpProps.toolName, serverName: mcpProps.serverName },
          },
          {
            label: t('messages.confirmation.yesAlwaysAllowServer', {
              serverName: mcpProps.serverName,
            }),
            value: ToolConfirmationOutcome.ProceedAlwaysServer,
            params: { serverName: mcpProps.serverName },
          },
          { label: t('messages.confirmation.no'), value: ToolConfirmationOutcome.Cancel }
        );
      }
    }
    return {
      question,
      description,
      options,
    };
  };
  /**
   * Check if a confirmation should be auto-approved based on current mode.
   * Returns true if auto-approved (caller should skip UI), false otherwise.
   */
  private tryAutoApprove(content: IMessageToolGroup['content'][number]): boolean {
    const type = content.confirmationDetails?.type;
    console.log(`[GeminiAgentManager] tryAutoApprove: currentMode=${this.currentMode}, confirmationType=${type}, callId=${content.callId}`);
    if (this.currentMode === 'yolo') {
      // yolo: auto-approve ALL operations
      console.log(`[GeminiAgentManager] YOLO auto-approving ${type}: callId=${content.callId}`);
      void this.postMessagePromise(content.callId, ToolConfirmationOutcome.ProceedOnce);
      return true;
    }
    if (this.currentMode === 'autoEdit') {
      // autoEdit: auto-approve edit (write/replace) and info (read) operations
      // Only exec and mcp still require manual confirmation
      if (type === 'edit' || type === 'info') {
        console.log(`[GeminiAgentManager] Auto-approving ${type}: callId=${content.callId}`);
        void this.postMessagePromise(content.callId, ToolConfirmationOutcome.ProceedOnce);
        return true;
      }
    }
    return false;
  }

  private handleConformationMessage(message: IMessageToolGroup) {
    const execMessages = message.content.filter((c) => c.status === 'Confirming');
    if (execMessages.length) {
      execMessages.forEach((content) => {
        // Check mode-based auto-approval before showing UI
        if (this.tryAutoApprove(content)) return;

        const { question, options, description } = this.getConfirmationButtons(content.confirmationDetails, (k) => k);
        const hasDetails = Boolean(content.confirmationDetails);
        const hasOptions = options && options.length > 0;
        if (!question && !hasDetails) {
          // Fallback confirmation when tool is waiting but missing details
          // 当工具处于确认状态但缺少详情时，提供兜底确认
          this.addConfirmation({
            title: 'Awaiting Confirmation',
            id: content.callId,
            action: 'confirm',
            description: content.description || content.name || 'Tool requires confirmation',
            callId: content.callId,
            options: [
              { label: 'messages.confirmation.yesAllowOnce', value: ToolConfirmationOutcome.ProceedOnce },
              { label: 'messages.confirmation.no', value: ToolConfirmationOutcome.Cancel },
            ],
          });
          return;
        }
        if (!question || !hasOptions) return;
        // Extract commandType from exec confirmations for "always allow" memory
        const commandType = content.confirmationDetails?.type === 'exec' ? (content.confirmationDetails as { rootCommand?: string }).rootCommand : undefined;
        this.addConfirmation({
          title: content.confirmationDetails?.title || '',
          id: content.callId,
          action: content.confirmationDetails.type,
          description: description || content.description || '',
          callId: content.callId,
          options: options,
          commandType,
        });
      });
    }
  }

  init() {
    super.init();
    // 接受来子进程的对话消息
    this.on('gemini.message', (data) => {
      // Mark as finished when content is output (visible to user)
      // Gemini uses: content, tool_group
      const contentTypes = ['content', 'tool_group'];
      if (contentTypes.includes(data.type)) {
        this.status = 'finished';
      }

      if (data.type === 'finish') {
        // When stream finishes, check for cron commands in the accumulated message
        // Use longer delay and retry logic to ensure message is persisted
        this.checkCronWithRetry(0);
      }
      if (data.type === 'start') {
        this.status = 'running';
      }

      // 处理预览打开事件（chrome-devtools 导航触发）/ Handle preview open event (triggered by chrome-devtools navigation)
      if (handlePreviewOpenEvent(data)) {
        return; // 不需要继续处理 / No need to continue processing
      }

      data.conversation_id = this.conversation_id;
      // Transform and persist message (skip transient UI state messages)
      // 跳过 thought, finished 等不需要持久化的消息类型
      // Skip transient UI state messages that don't need persistence
      // 跳过不需要持久化的临时 UI 状态消息 (thought, finished, start, finish)
      const skipTransformTypes = ['thought', 'finished', 'start', 'finish'];
      if (!skipTransformTypes.includes(data.type)) {
        const tMessage = transformMessage(data as IResponseMessage);
        if (tMessage) {
          addOrUpdateMessage(this.conversation_id, tMessage, 'gemini');
          if (tMessage.type === 'tool_group') {
            this.handleConformationMessage(tMessage);
          }
        }
      }

      // Filter think tags from streaming content before emitting to UI
      // 在发送到 UI 前过滤流式内容中的 think 标签
      const filteredData = this.filterThinkTagsFromMessage(data);
      ipcBridge.geminiConversation.responseStream.emit(filteredData);

      // 发送到 Channel 全局事件总线（用于 Telegram 等外部平台）
      // Emit to Channel global event bus (for Telegram and other external platforms)
      channelEventBus.emitAgentMessage(this.conversation_id, filteredData);
    });
  }

  /**
   * Retry checking for cron commands with increasing delays
   * Max 3 retries: 1s, 2s, 3s
   * @param attempt - current attempt number
   * @param checkAfterTimestamp - only process messages created after this timestamp
   */
  private checkCronWithRetry(attempt: number, checkAfterTimestamp?: number): void {
    const delays = [1000, 2000, 3000];
    const maxAttempts = delays.length;

    if (attempt >= maxAttempts) {
      return;
    }

    // Record timestamp on first attempt to avoid re-processing old messages
    const timestamp = checkAfterTimestamp ?? Date.now();
    const delay = delays[attempt];

    setTimeout(async () => {
      const found = await this.checkCronCommandsOnFinish(timestamp);
      if (!found && attempt < maxAttempts - 1) {
        // No assistant messages found, retry with same timestamp
        this.checkCronWithRetry(attempt + 1, timestamp);
      }
    }, delay);
  }

  /**
   * Check for cron commands when stream finishes
   * Gets recent assistant messages from database and processes them
   * @param afterTimestamp - Only process messages created after this timestamp
   * Returns true if assistant messages were found (regardless of cron commands)
   */
  private async checkCronCommandsOnFinish(afterTimestamp: number): Promise<boolean> {
    try {
      const { getDatabase } = await import('@process/database');
      const db = getDatabase();
      const result = db.getConversationMessages(this.conversation_id, 0, 20, 'DESC');

      if (!result.data || result.data.length === 0) {
        return false;
      }

      // Check recent assistant messages for cron commands (position: left means assistant)
      // Filter by timestamp to avoid re-processing old messages
      const assistantMsgs = result.data.filter((m) => m.position === 'left' && (m.createdAt ?? 0) > afterTimestamp);

      // Return false if no assistant messages found after timestamp (will trigger retry)
      if (assistantMsgs.length === 0) {
        return false;
      }

      // Only check the LATEST assistant message to avoid re-processing old messages
      // Messages are sorted DESC, so the first one is the latest
      const latestMsg = assistantMsgs[0];
      const textContent = extractTextFromMessage(latestMsg);

      // Collect system responses to send back to AI
      const collectedResponses: string[] = [];

      // Detect [LOAD_SKILL: ...] requests and load skill content on demand
      if (textContent) {
        const skillRequests = detectSkillLoadRequest(textContent);
        if (skillRequests.length > 0) {
          const skillManager = AcpSkillManager.getInstance(this.enabledSkills);
          await skillManager.discoverSkills(this.enabledSkills);
          const skills = await skillManager.getSkills(skillRequests);
          if (skills.length > 0) {
            const skillContent = buildSkillContentText(skills);
            collectedResponses.push(skillContent);
            ipcBridge.geminiConversation.responseStream.emit({
              type: 'system',
              conversation_id: this.conversation_id,
              msg_id: uuid(),
              data: skillContent,
            });
          }
        }
      }

      // Detect cron commands
      if (textContent && hasCronCommands(textContent)) {
        // Create a message with finish status for middleware
        const msgWithStatus = { ...latestMsg, status: 'finish' as const };
        await processCronInMessage(this.conversation_id, 'gemini', msgWithStatus, (sysMsg) => {
          collectedResponses.push(sysMsg);
          // Also emit to frontend for display
          ipcBridge.geminiConversation.responseStream.emit({
            type: 'system',
            conversation_id: this.conversation_id,
            msg_id: uuid(),
            data: sysMsg,
          });
        });
      }

      // Send collected responses back to AI agent so it can continue
      if (collectedResponses.length > 0) {
        const feedbackMessage = `[System Response]\n${collectedResponses.join('\n')}`;
        await this.sendMessage({
          input: feedbackMessage,
          msg_id: uuid(),
        });
      }

      // Found assistant messages, no need to retry
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current session mode.
   * 获取当前会话模式。
   */
  getMode(): { mode: string; initialized: boolean } {
    return { mode: this.currentMode, initialized: true };
  }

  /**
   * Set the session mode (e.g., default, autoEdit).
   * 设置会话模式（如 default、autoEdit）。
   *
   * Unlike ACP agents, Gemini mode affects approval behavior at the manager layer,
   * not via a protocol-level session/set_mode call.
   */
  async setMode(mode: string): Promise<{ success: boolean; msg?: string; data?: { mode: string } }> {
    const prev = this.currentMode;
    this.currentMode = mode;
    this.saveSessionMode(mode);

    // Sync legacy yoloMode config: when leaving yolo mode, clear the old
    // SecurityModalContent setting to prevent it from re-activating on next session.
    if (prev === 'yolo' && mode !== 'yolo') {
      void this.clearLegacyYoloConfig();
    }

    return { success: true, data: { mode: this.currentMode } };
  }

  /**
   * Check if yoloMode is already enabled for this Gemini worker.
   * Gemini workers cannot change yoloMode at runtime (forked process),
   * so this only returns true if the worker was started with yoloMode.
   */
  async ensureYoloMode(): Promise<boolean> {
    return !!this.forceYoloMode;
  }

  /**
   * Save session mode to database for resume support.
   * 保存会话模式到数据库以支持恢复。
   */
  private saveSessionMode(mode: string): void {
    try {
      const db = getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'gemini') {
        const conversation = result.data;
        const updatedExtra = {
          ...conversation.extra,
          sessionMode: mode,
        };
        db.updateConversation(this.conversation_id, { extra: updatedExtra } as Partial<typeof conversation>);
      }
    } catch (error) {
      console.error('[GeminiAgentManager] Failed to save session mode:', error);
    }
  }

  /**
   * Clear legacy yoloMode in gemini.config.
   * This syncs back to the old SecurityModalContent config key so that
   * switching away from YOLO mode persists across new sessions.
   */
  private async clearLegacyYoloConfig(): Promise<void> {
    try {
      const config = await ProcessConfig.get('gemini.config');
      if (config?.yoloMode) {
        await ProcessConfig.set('gemini.config', { ...config, yoloMode: false });
      }
    } catch (error) {
      console.error('[GeminiAgentManager] Failed to clear legacy yoloMode config:', error);
    }
  }

  confirm(id: string, callId: string, data: string) {
    // Store "always allow" decision before removing confirmation from cache
    // 在从缓存中移除确认之前，存储 "always allow" 决策
    if (data === ToolConfirmationOutcome.ProceedAlways) {
      const confirmation = this.confirmations.find((c) => c.callId === callId);
      if (confirmation?.action) {
        const keys = GeminiApprovalStore.createKeysFromConfirmation(confirmation.action, confirmation.commandType);
        this.approvalStore.approveAll(keys);
      }
    }

    super.confirm(id, callId, data);
    // 发送确认到 worker，使用 callId 作为消息类型
    // Send confirmation to worker, using callId as message type
    return this.postMessagePromise(callId, data);
  }

  // Manually trigger context reload
  async reloadContext(): Promise<void> {
    await this.injectHistoryFromDatabase();
  }

  /**
   * Filter think tags from message content during streaming
   * This ensures users don't see internal reasoning tags in real-time
   * Handles both 'content' and 'thought' message types
   *
   * @param message - The streaming message to filter
   * @returns Message with think tags removed from content
   */
  private filterThinkTagsFromMessage(message: IResponseMessage): IResponseMessage {
    // Filter content messages: only strip complete <think>...</think> blocks.
    // Orphaned </think> tags must be preserved so the frontend can detect them
    // in accumulated content and strip all preceding thinking content.
    // 仅剔除完整的 <think>...</think> 块。
    // 保留孤立的 </think> 标签，让前端在累积内容中检测并过滤思考内容。
    if (message.type === 'content' && typeof message.data === 'string') {
      const content = message.data;
      const completeBlockRegex = /<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/i;
      if (completeBlockRegex.test(content)) {
        return {
          ...message,
          data: content
            .replace(/<\s*think\s*>([\s\S]*?)<\s*\/\s*think\s*>/gi, '')
            .replace(/<\s*thinking\s*>([\s\S]*?)<\s*\/\s*thinking\s*>/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim(),
        };
      }
    }

    // Filter thought messages (they might contain think tags too)
    if (message.type === 'thought' && typeof message.data === 'string') {
      const content = message.data;
      if (/<\/?think(?:ing)?>/i.test(content)) {
        return {
          ...message,
          data: stripThinkTags(content),
        };
      }
    }

    return message;
  }
}
