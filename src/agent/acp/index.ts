/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AcpAdapter } from '@/agent/acp/AcpAdapter';
import { extractAtPaths, parseAllAtCommands, reconstructQuery } from '@/common/atCommandParser';
import type { TMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { NavigationInterceptor } from '@/common/navigation';
import { uuid } from '@/common/utils';
import type { AcpBackend, AcpPermissionRequest, AcpResult, AcpSessionUpdate, ToolCallUpdate } from '@/types/acpTypes';
import { AcpErrorType, createAcpError } from '@/types/acpTypes';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AcpConnection } from './AcpConnection';
import { AcpApprovalStore, createAcpApprovalKey } from './ApprovalStore';
import { CLAUDE_YOLO_SESSION_MODE } from './constants';
import { getClaudeModel } from './utils';

/**
 * Initialize response result interface
 * ACP 初始化响应结果接口
 */
interface InitializeResult {
  authMethods?: Array<{
    type: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Helper function to normalize tool call status
 * 辅助函数：规范化工具调用状态
 *
 * Note: This preserves the original behavior of (status as any) || 'pending'
 * Only converts falsy values to 'pending', keeps all truthy values unchanged
 * 注意：保持原始行为，只将 falsy 值转换为 'pending'，保留所有 truthy 值
 */
function normalizeToolCallStatus(status: string | undefined): 'pending' | 'in_progress' | 'completed' | 'failed' {
  // Matches original: (status as any) || 'pending'
  // If falsy (undefined, null, ''), return 'pending'
  if (!status) {
    return 'pending';
  }
  // Preserve original value for backward compatibility
  return status as 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface AcpAgentConfig {
  id: string;
  backend: AcpBackend;
  cliPath?: string;
  workingDir: string;
  customArgs?: string[]; // Custom CLI arguments (for custom backend)
  customEnv?: Record<string, string>; // Custom environment variables (for custom backend)
  extra?: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
    customArgs?: string[];
    customEnv?: Record<string, string>;
    yoloMode?: boolean;
  };
  onStreamEvent: (data: IResponseMessage) => void;
  onSignalEvent?: (data: IResponseMessage) => void; // 新增：仅发送信号，不更新UI
}

// ACP agent任务类
export class AcpAgent {
  private readonly id: string;
  private extra: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
    customArgs?: string[];
    customEnv?: Record<string, string>;
    yoloMode?: boolean;
  };
  private connection: AcpConnection;
  private adapter: AcpAdapter;
  private pendingPermissions = new Map<string, { resolve: (response: { optionId: string }) => void; reject: (error: Error) => void }>();
  private statusMessageId: string | null = null;
  private readonly onStreamEvent: (data: IResponseMessage) => void;
  private readonly onSignalEvent?: (data: IResponseMessage) => void;

  // Track pending navigation tool calls for URL extraction from results
  // 跟踪待处理的导航工具调用，以便从结果中提取 URL
  private pendingNavigationTools = new Set<string>();

  // ApprovalStore for session-level "always allow" caching
  // Workaround for claude-code-acp bug: it doesn't check suggestions to auto-approve
  private approvalStore = new AcpApprovalStore();

  // Store permission request metadata for later use in confirmMessage
  private permissionRequestMeta = new Map<string, { kind?: string; title?: string; rawInput?: Record<string, unknown> }>();

  constructor(config: AcpAgentConfig) {
    this.id = config.id;
    this.onStreamEvent = config.onStreamEvent;
    this.onSignalEvent = config.onSignalEvent;
    this.extra = config.extra || {
      workspace: config.workingDir,
      backend: config.backend,
      cliPath: config.cliPath,
      customWorkspace: false, // Default to system workspace
      customArgs: config.customArgs,
      customEnv: config.customEnv,
      yoloMode: false,
    };

    this.connection = new AcpConnection();
    this.adapter = new AcpAdapter(this.id, this.extra.backend);

    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.connection.onSessionUpdate = (data: AcpSessionUpdate) => {
      this.handleSessionUpdate(data);
    };
    this.connection.onPermissionRequest = (data: AcpPermissionRequest) => {
      return this.handlePermissionRequest(data);
    };
    this.connection.onEndTurn = () => {
      this.handleEndTurn();
    };
    this.connection.onFileOperation = (operation) => {
      this.handleFileOperation(operation);
    };
    this.connection.onDisconnect = (error) => {
      this.handleDisconnect(error);
    };
  }

  /**
   * Check if a tool is a chrome-devtools navigation tool
   * 检查工具是否为 chrome-devtools 导航工具
   *
   * Delegates to NavigationInterceptor for unified logic
   */
  private isNavigationTool(toolName: string): boolean {
    return NavigationInterceptor.isNavigationTool(toolName);
  }

  /**
   * Extract URL from navigation tool's permission request data
   * 从导航工具的权限请求数据中提取 URL
   *
   * Delegates to NavigationInterceptor for unified logic
   */
  // eslint-disable-next-line max-len
  private extractNavigationUrl(toolCall: { rawInput?: Record<string, unknown>; content?: Array<{ type?: string; content?: { type?: string; text?: string }; text?: string }>; title?: string }): string | null {
    return NavigationInterceptor.extractUrl(toolCall);
  }

  /**
   * Handle intercepted navigation tool by emitting preview_open event
   * 处理被拦截的导航工具，发出 preview_open 事件
   */
  private handleInterceptedNavigation(url: string, _toolName: string): void {
    const previewMessage = NavigationInterceptor.createPreviewMessage(url, this.id);
    this.onStreamEvent(previewMessage);
  }

  // 启动ACP连接和会话
  async start(): Promise<void> {
    try {
      this.emitStatusMessage('connecting');

      let connectTimeoutId: NodeJS.Timeout | null = null;
      const connectTimeoutPromise = new Promise<never>((_, reject) => {
        connectTimeoutId = setTimeout(() => reject(new Error('Connection timeout after 70 seconds')), 70000);
      });

      try {
        await Promise.race([this.connection.connect(this.extra.backend, this.extra.cliPath, this.extra.workspace, this.extra.customArgs, this.extra.customEnv), connectTimeoutPromise]);
      } finally {
        if (connectTimeoutId) {
          clearTimeout(connectTimeoutId);
        }
      }
      this.emitStatusMessage('connected');
      await this.performAuthentication();
      // 避免重复创建会话：仅当尚无活动会话时再创建
      if (!this.connection.hasActiveSession) {
        await this.connection.newSession(this.extra.workspace);
      }

      // Claude Code "YOLO" mode: bypass all permission checks (equivalent to --dangerously-skip-permissions)
      if (this.extra.backend === 'claude' && this.extra.yoloMode) {
        try {
          await this.connection.setSessionMode(CLAUDE_YOLO_SESSION_MODE);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`[ACP] Failed to enable Claude YOLO mode (${CLAUDE_YOLO_SESSION_MODE}): ${errorMessage}`);
        }
      }

      // Auto-set model from ~/.claude/settings.json for Claude backend
      if (this.extra.backend === 'claude') {
        const configuredModel = getClaudeModel();
        if (configuredModel) {
          try {
            await this.connection.setModel(configuredModel);
          } catch (error) {
            // Log warning but don't fail - fallback to default model
            console.warn(`[ACP] Failed to set model from settings: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      this.emitStatusMessage('session_active');
    } catch (error) {
      this.emitStatusMessage('error');
      throw error;
    }
  }

  stop(): Promise<void> {
    this.connection.disconnect();
    this.emitStatusMessage('disconnected');
    // Clear session-scoped caches when session ends
    this.approvalStore.clear();
    this.permissionRequestMeta.clear();
    // Emit finish event to reset frontend UI state
    this.onStreamEvent({
      type: 'finish',
      conversation_id: this.id,
      msg_id: uuid(),
      data: null,
    });
    return Promise.resolve();
  }

  // 发送消息到ACP服务器
  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
    try {
      // Auto-reconnect if connection is lost (e.g., after unexpected process exit)
      if (!this.connection.isConnected || !this.connection.hasActiveSession) {
        try {
          await this.start();
        } catch (reconnectError) {
          const errorMsg = reconnectError instanceof Error ? reconnectError.message : String(reconnectError);
          return {
            success: false,
            error: createAcpError(AcpErrorType.CONNECTION_NOT_READY, `Failed to reconnect: ${errorMsg}`, true),
          };
        }
      }
      this.adapter.resetMessageTracking();
      let processedContent = data.content;

      // Add @ prefix to ALL uploaded files (including images) with FULL PATH
      // Claude CLI needs full path to read files
      // 为所有上传的文件添加 @ 前缀（包括图片），使用完整路径让 Claude CLI 读取
      if (data.files && data.files.length > 0) {
        const fileRefs = data.files
          .map((filePath) => {
            // Use full path instead of just filename
            // Escape paths with spaces using quotes for Claude CLI
            // 对含空格的路径使用引号包裹，确保 Claude CLI 正确解析
            if (filePath.includes(' ')) {
              return `@"${filePath}"`;
            }
            return '@' + filePath;
          })
          .join(' ');
        // Prepend file references to the content
        processedContent = fileRefs + ' ' + processedContent;
      }

      // Process @ file references in the message
      // 处理消息中的 @ 文件引用
      processedContent = await this.processAtFileReferences(processedContent, data.files);

      await this.connection.sendPrompt(processedContent);
      this.statusMessageId = null;
      return { success: true, data: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Special handling for Internal error
      if (errorMsg.includes('Internal error')) {
        if (this.extra.backend === 'qwen') {
          const enhancedMsg = `Qwen ACP Internal Error: This usually means authentication failed or ` + `the Qwen CLI has compatibility issues. Please try: 1) Restart the application ` + `2) Use 'npx @qwen-code/qwen-code' instead of global qwen 3) Check if you have valid Qwen credentials.`;
          this.emitErrorMessage(enhancedMsg);
          return {
            success: false,
            error: createAcpError(AcpErrorType.AUTHENTICATION_FAILED, enhancedMsg, false),
          };
        }
      }
      // Classify error types based on message content
      let errorType: AcpErrorType = AcpErrorType.UNKNOWN;
      let retryable = false;

      if (errorMsg.includes('authentication') || errorMsg.includes('认证失败') || errorMsg.includes('[ACP-AUTH-')) {
        errorType = AcpErrorType.AUTHENTICATION_FAILED;
        retryable = false;
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout') || errorMsg.includes('timed out')) {
        errorType = AcpErrorType.TIMEOUT;
        retryable = true;
      } else if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
        errorType = AcpErrorType.PERMISSION_DENIED;
        retryable = false;
      } else if (errorMsg.includes('connection') || errorMsg.includes('Connection')) {
        errorType = AcpErrorType.NETWORK_ERROR;
        retryable = true;
      }

      this.emitErrorMessage(errorMsg);
      return {
        success: false,
        error: createAcpError(errorType, errorMsg, retryable),
      };
    }
  }

  /**
   * Process @ file references in the message content
   * 处理消息内容中的 @ 文件引用
   *
   * This method resolves @ references to actual files in the workspace,
   * reads their content, and appends it to the message.
   * 此方法解析工作区中的 @ 引用，读取文件内容并附加到消息中。
   */
  private async processAtFileReferences(content: string, uploadedFiles?: string[]): Promise<string> {
    const workspace = this.extra.workspace;
    if (!workspace) {
      return content;
    }

    // Parse all @ references in the content
    // Note: @ prefix is already added to content by sendMessage for uploaded files
    // 解析 content 中的所有 @ 引用
    // 注意：sendMessage 已为上传的文件添加了 @ 前缀
    const parts = parseAllAtCommands(content);
    const atPaths = extractAtPaths(content);

    // If no @ references found, return original content
    if (atPaths.length === 0) {
      return content;
    }

    // Track which @ references are resolved to files
    const resolvedFiles: Map<string, string> = new Map(); // atPath -> file content
    // Track @ references that should be removed (duplicate file references by filename)
    const referencesToRemove: Set<string> = new Set();

    for (const atPath of atPaths) {
      // Check if this @ reference is an uploaded file (full path or filename)
      // If yes, skip it - let Claude CLI handle it natively
      // 检查此 @ 引用是否是上传的文件（完整路径或文件名），如果是则跳过，让 Claude CLI 原生处理
      const matchedUploadFile = uploadedFiles?.find((filePath) => {
        // Match by full path
        if (atPath === filePath) return true;
        // Match by filename (for cases where message contains just filename)
        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        return atPath === fileName;
      });

      if (matchedUploadFile) {
        // If this is a filename reference (not full path), mark for removal
        // The full path reference will be kept
        // 如果这是文件名引用（不是完整路径），标记为移除，因为已经有完整路径引用了
        if (atPath !== matchedUploadFile) {
          referencesToRemove.add(atPath);
        }
        // Skip uploaded files - they are already in @ format with full path
        // Claude CLI will handle them natively
        continue;
      }

      // For workspace file references (filename only), try to resolve and read
      // 对于工作区文件引用（只有文件名），尝试解析和读取
      const resolvedPath = await this.resolveAtPath(atPath, workspace);

      if (resolvedPath) {
        try {
          // Try to read as text file
          const fileContent = await fs.readFile(resolvedPath, 'utf-8');
          resolvedFiles.set(atPath, fileContent);
        } catch (error) {
          // Binary files (images, etc.) cannot be read as text
          // Keep the @ reference as-is, let CLI handle it
          // 二进制文件（图片等）无法作为文本读取，保持 @ 引用，让 CLI 处理
          console.warn(`[ACP] Skipping binary file ${atPath} (will be handled by CLI)`);
        }
      }
    }

    // If no files were resolved and no references to remove, return original content
    if (resolvedFiles.size === 0 && referencesToRemove.size === 0) {
      return content;
    }

    // Reconstruct the message: replace @ references with plain text and append file contents
    const reconstructedQuery = reconstructQuery(parts, (atPath) => {
      // Remove duplicate filename references (when full path already exists)
      if (referencesToRemove.has(atPath)) {
        return '';
      }
      if (resolvedFiles.has(atPath)) {
        // Replace with just the filename (without @) as the reference
        return atPath;
      }
      // Keep unresolved @ references as-is
      return '@' + atPath;
    });

    // Append file contents at the end of the message
    let result = reconstructedQuery;
    if (resolvedFiles.size > 0) {
      result += '\n\n--- Referenced file contents ---';
      for (const [atPath, fileContent] of resolvedFiles) {
        result += `\n\n[Content of ${atPath}]:\n${fileContent}`;
      }
      result += '\n--- End of file contents ---';
    }

    return result;
  }

  /**
   * Resolve an @ path to an actual file path in the workspace
   * 将 @ 路径解析为工作区中的实际文件路径
   */
  private async resolveAtPath(atPath: string, workspace: string): Promise<string | null> {
    // Try direct path first
    const directPath = path.resolve(workspace, atPath);
    try {
      const stats = await fs.stat(directPath);
      if (stats.isFile()) {
        return directPath;
      }
      // If it's a directory, we don't read it (for now)
      return null;
    } catch {
      // Direct path doesn't exist, try searching for the file
    }

    // Try to find file by name in workspace (simple search)
    try {
      const fileName = path.basename(atPath);
      const foundPath = await this.findFileInWorkspace(workspace, fileName);
      return foundPath;
    } catch {
      return null;
    }
  }

  /**
   * Simple file search in workspace (non-recursive for performance)
   * 在工作区中简单搜索文件（非递归以保证性能）
   */
  private async findFileInWorkspace(workspace: string, fileName: string, maxDepth: number = 3): Promise<string | null> {
    const searchDir = async (dir: string, depth: number): Promise<string | null> => {
      if (depth > maxDepth) return null;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile() && entry.name === fileName) {
            return fullPath;
          }
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            const found = await searchDir(fullPath, depth + 1);
            if (found) return found;
          }
        }
      } catch {
        // Ignore permission errors
      }
      return null;
    };

    return await searchDir(workspace, 0);
  }

  confirmMessage(data: { confirmKey: string; callId: string }): Promise<AcpResult> {
    try {
      if (this.pendingPermissions.has(data.callId)) {
        const { resolve } = this.pendingPermissions.get(data.callId)!;
        this.pendingPermissions.delete(data.callId);

        // Store "allow_always" decision to ApprovalStore for future auto-approval
        // Workaround for claude-code-acp bug: it returns updatedPermissions but doesn't check suggestions
        if (data.confirmKey === 'allow_always') {
          const meta = this.permissionRequestMeta.get(data.callId);
          if (meta) {
            const approvalKey = createAcpApprovalKey({
              kind: meta.kind,
              title: meta.title,
              rawInput: meta.rawInput,
            });
            this.approvalStore.put(approvalKey, 'allow_always');
          }
        }

        // Clean up metadata
        this.permissionRequestMeta.delete(data.callId);

        resolve({ optionId: data.confirmKey });
        return Promise.resolve({ success: true, data: null });
      }
      return Promise.resolve({
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, `Permission request not found for callId: ${data.callId}`, false),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return Promise.resolve({
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, errorMsg, false),
      });
    }
  }

  private handleSessionUpdate(data: AcpSessionUpdate): void {
    try {
      // Intercept chrome-devtools navigation tools from session updates
      // 从会话更新中拦截 chrome-devtools 导航工具
      if (data.update?.sessionUpdate === 'tool_call') {
        const toolCallUpdate = data as ToolCallUpdate;
        const toolName = toolCallUpdate.update?.title || '';
        const toolCallId = toolCallUpdate.update?.toolCallId;
        if (this.isNavigationTool(toolName)) {
          // Track this navigation tool call for result interception
          // 跟踪此导航工具调用以拦截结果
          if (toolCallId) {
            this.pendingNavigationTools.add(toolCallId);
          }
          const url = this.extractNavigationUrl(toolCallUpdate.update);
          if (url) {
            // Emit preview_open event to show URL in preview panel
            // 发出 preview_open 事件，在预览面板中显示 URL
            this.handleInterceptedNavigation(url, toolName);
          }
        }
      }

      // Intercept tool_call_update to extract URL from navigation tool results
      // 拦截 tool_call_update 以从导航工具结果中提取 URL
      if (data.update?.sessionUpdate === 'tool_call_update') {
        const statusUpdate = data as import('@/types/acpTypes').ToolCallUpdateStatus;
        const toolCallId = statusUpdate.update?.toolCallId;
        if (toolCallId && this.pendingNavigationTools.has(toolCallId)) {
          // This is a result for a tracked navigation tool
          // 这是已跟踪的导航工具的结果
          if (statusUpdate.update?.status === 'completed' && statusUpdate.update?.content) {
            // Try to extract URL from the result content
            // 尝试从结果内容中提取 URL
            for (const item of statusUpdate.update.content) {
              const text = item.content?.text || '';
              const urlMatch = text.match(/https?:\/\/[^\s<>"]+/i);
              if (urlMatch) {
                this.handleInterceptedNavigation(urlMatch[0], 'navigate_page');
                break;
              }
            }
          }
          // Clean up tracking
          // 清理跟踪
          this.pendingNavigationTools.delete(toolCallId);
        }
      }

      const messages = this.adapter.convertSessionUpdate(data);

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        // 所有消息都直接发送，不做复杂的替换逻辑
        this.emitMessage(message);
      }
    } catch (error) {
      this.emitErrorMessage(`Failed to process session update: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private handlePermissionRequest(data: AcpPermissionRequest): Promise<{ optionId: string }> {
    return new Promise((resolve, reject) => {
      // Ensure every permission request has a stable toolCallId so UI + pending map stay in sync
      // 确保每个权限请求都拥有稳定的 toolCallId，保证 UI 与 pending map 对齐
      if (data.toolCall && !data.toolCall.toolCallId) {
        data.toolCall.toolCallId = uuid();
      }
      const requestId = data.toolCall.toolCallId; // 使用 toolCallId 作为 requestId

      // Check ApprovalStore for cached "always allow" decision
      // Workaround for claude-code-acp bug: it returns updatedPermissions but doesn't check suggestions
      const approvalKey = createAcpApprovalKey(data.toolCall);
      if (this.approvalStore.isApprovedForSession(approvalKey)) {
        // Auto-approve without showing dialog - no metadata storage needed
        resolve({ optionId: 'allow_always' });
        return;
      }

      // Clean up any existing metadata for this requestId before storing new one
      // This handles duplicate permission requests properly
      if (this.permissionRequestMeta.has(requestId)) {
        this.permissionRequestMeta.delete(requestId);
      }

      // Store metadata for later use in confirmMessage
      this.permissionRequestMeta.set(requestId, {
        kind: data.toolCall.kind,
        title: data.toolCall.title,
        rawInput: data.toolCall.rawInput,
      });

      // Intercept chrome-devtools navigation tools and show in preview panel
      // 拦截 chrome-devtools 导航工具，在预览面板中显示
      // Note: We only emit preview_open event, do NOT block tool execution
      // 注意：只发送 preview_open 事件，不阻止工具执行，agent 需要 chrome-devtools 获取网页内容
      const toolName = data.toolCall?.title || '';
      if (this.isNavigationTool(toolName)) {
        const url = this.extractNavigationUrl(data.toolCall);
        if (url) {
          // Emit preview_open event to show URL in preview panel
          // 发出 preview_open 事件，在预览面板中显示 URL
          this.handleInterceptedNavigation(url, toolName);
        }
        // Track for later extraction from result if URL not available now
        // 跟踪以便稍后从结果中提取 URL（如果现在不可用）
        this.pendingNavigationTools.add(requestId);
      }

      // 检查是否有重复的权限请求
      if (this.pendingPermissions.has(requestId)) {
        // 如果是重复请求，先清理旧的
        const oldRequest = this.pendingPermissions.get(requestId);
        if (oldRequest) {
          oldRequest.reject(new Error('Replaced by new permission request'));
        }
        this.pendingPermissions.delete(requestId);
      }

      this.pendingPermissions.set(requestId, { resolve, reject });

      // 确保权限消息总是被发送，即使有异步问题
      try {
        this.emitPermissionRequest(data); // 直接传递 AcpPermissionRequest
      } catch (error) {
        this.pendingPermissions.delete(requestId);
        reject(error);
        return;
      }

      setTimeout(() => {
        if (this.pendingPermissions.has(requestId)) {
          this.pendingPermissions.delete(requestId);
          reject(new Error('Permission request timed out'));
        }
      }, 70000);
    });
  }

  private handleEndTurn(): void {
    // 使用信号回调发送 end_turn 事件，不添加到消息列表
    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
    }
  }

  /**
   * Handle unexpected disconnect from ACP backend
   * Notify frontend and clean up internal state
   */
  private handleDisconnect(error: { code: number | null; signal: NodeJS.Signals | null }): void {
    // 1. Emit disconnected status to frontend
    this.emitStatusMessage('disconnected');

    // 2. Emit error message with helpful information
    const errorMsg = `${this.extra.backend} process disconnected unexpectedly ` + `(code: ${error.code}, signal: ${error.signal}). ` + `Please try sending a new message to reconnect.`;
    this.emitErrorMessage(errorMsg);

    // 3. Emit finish signal to reset UI loading state
    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
    }

    // 4. Clear internal state
    this.pendingPermissions.clear();
    this.permissionRequestMeta.clear();
    this.approvalStore.clear();
    this.pendingNavigationTools.clear();
    this.statusMessageId = null;
  }

  private handleFileOperation(operation: { method: string; path: string; content?: string; sessionId: string }): void {
    // 创建文件操作消息显示在UI中
    const fileOperationMessage: TMessage = {
      id: uuid(),
      conversation_id: this.id,
      type: 'text',
      position: 'left',
      createdAt: Date.now(),
      content: {
        content: this.formatFileOperationMessage(operation),
      },
    };

    this.emitMessage(fileOperationMessage);
  }

  private formatFileOperationMessage(operation: { method: string; path: string; content?: string; sessionId: string }): string {
    switch (operation.method) {
      case 'fs/write_text_file': {
        const content = operation.content || '';
        return `📝 File written: \`${operation.path}\`\n\n\`\`\`\n${content}\n\`\`\``;
      }
      case 'fs/read_text_file':
        return `📖 File read: \`${operation.path}\``;
      default:
        return `🔧 File operation: \`${operation.path}\``;
    }
  }

  private emitStatusMessage(status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error'): void {
    // Use fixed ID for status messages so they update instead of duplicate
    if (!this.statusMessageId) {
      this.statusMessageId = uuid();
    }

    const statusMessage: TMessage = {
      id: this.statusMessageId,
      msg_id: this.statusMessageId,
      conversation_id: this.id,
      type: 'agent_status',
      position: 'center',
      createdAt: Date.now(),
      content: {
        backend: this.extra.backend,
        status,
      },
    };

    this.emitMessage(statusMessage);
  }

  private emitPermissionRequest(data: AcpPermissionRequest): void {
    // 重要：将权限请求中的 toolCall 注册到 adapter 的 activeToolCalls 中
    // 这样后续的 tool_call_update 事件就能找到对应的 tool call 了
    if (data.toolCall) {
      // 将权限请求中的 kind 映射到正确的类型
      const mapKindToValidType = (kind?: string): 'read' | 'edit' | 'execute' => {
        switch (kind) {
          case 'read':
            return 'read';
          case 'edit':
            return 'edit';
          case 'execute':
            return 'execute';
          default:
            return 'execute'; // 默认为 execute
        }
      };

      const toolCallUpdate: ToolCallUpdate = {
        sessionId: data.sessionId,
        update: {
          sessionUpdate: 'tool_call' as const,
          toolCallId: data.toolCall.toolCallId,
          status: normalizeToolCallStatus(data.toolCall.status),
          title: data.toolCall.title || 'Tool Call',
          kind: mapKindToValidType(data.toolCall.kind),
          content: data.toolCall.content || [],
          locations: data.toolCall.locations || [],
        },
      };

      // 创建 tool call 消息以注册到 activeToolCalls
      this.adapter.convertSessionUpdate(toolCallUpdate);
    }

    // 使用 onSignalEvent 而不是 emitMessage，这样消息不会被持久化到数据库
    // Permission request 是临时交互消息，一旦用户做出选择就失去意义
    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'acp_permission',
        conversation_id: this.id,
        msg_id: uuid(),
        data: data,
      });
    }
  }

  private emitErrorMessage(error: string): void {
    const errorMessage: TMessage = {
      id: uuid(),
      conversation_id: this.id,
      type: 'tips',
      position: 'center',
      createdAt: Date.now(),
      content: {
        content: error,
        type: 'error',
      },
    };

    this.emitMessage(errorMessage);
  }

  private extractThoughtSubject(content: string): string {
    const lines = content.split('\n');
    const firstLine = lines[0].trim();

    // Try to extract subject from **Subject** format
    const subjectMatch = firstLine.match(/^\*\*(.+?)\*\*$/);
    if (subjectMatch) {
      return subjectMatch[1];
    }

    // Use first line as subject if it looks like a title
    if (firstLine.length < 80 && !firstLine.endsWith('.')) {
      return firstLine;
    }

    // Extract first sentence as subject
    const firstSentence = content.split('.')[0];
    if (firstSentence.length < 100) {
      return firstSentence;
    }

    return 'Thinking';
  }

  private emitMessage(message: TMessage): void {
    // Create response message based on the message type, following GeminiAgentTask pattern
    const responseMessage: IResponseMessage = {
      type: '', // Will be set in switch statement
      data: null, // Will be set in switch statement
      conversation_id: this.id,
      msg_id: message.msg_id || message.id, // 使用消息自己的 msg_id
    };

    // Map TMessage types to backend response types
    switch (message.type) {
      case 'text':
        responseMessage.type = 'content';
        responseMessage.data = message.content.content;
        break;
      case 'agent_status':
        responseMessage.type = 'agent_status';
        responseMessage.data = message.content;
        break;
      case 'acp_permission':
        responseMessage.type = 'acp_permission';
        responseMessage.data = message.content;
        break;
      case 'tips':
        // Distinguish between thought messages and error messages
        if (message.content.type === 'warning' && message.position === 'center') {
          const subject = this.extractThoughtSubject(message.content.content);

          responseMessage.type = 'thought';
          responseMessage.data = {
            subject,
            description: message.content.content,
          };
        } else {
          responseMessage.type = 'error';
          responseMessage.data = message.content.content;
        }
        break;
      case 'acp_tool_call': {
        responseMessage.type = 'acp_tool_call';
        responseMessage.data = message.content;
        break;
      }
      case 'plan':
        {
          responseMessage.type = 'plan';
          responseMessage.data = message.content;
        }
        break;
      default:
        responseMessage.type = 'content';
        responseMessage.data = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    }
    this.onStreamEvent(responseMessage);
  }

  postMessagePromise(action: string, data: unknown): Promise<AcpResult | void> {
    switch (action) {
      case 'send.message':
        return this.sendMessage(data as { content: string; files?: string[]; msg_id?: string });
      case 'stop.stream':
        return this.stop();
      default:
        return Promise.reject(new Error(`Unknown action: ${action}`));
    }
  }

  get isConnected(): boolean {
    return this.connection.isConnected;
  }

  get hasActiveSession(): boolean {
    return this.connection.hasActiveSession;
  }

  // Add kill method for compatibility with WorkerManage
  kill(): void {
    this.stop().catch((error) => {
      console.error('Error stopping ACP agent:', error);
    });
  }

  private async ensureBackendAuth(backend: AcpBackend, loginArg: string): Promise<void> {
    try {
      this.emitStatusMessage('connecting');

      // 使用配置的 CLI 路径调用 login 命令
      if (!this.extra.cliPath) {
        throw new Error(`No CLI path configured for ${backend} backend`);
      }

      // 使用与 AcpConnection 相同的命令解析逻辑
      let command: string;
      let args: string[];

      if (this.extra.cliPath.startsWith('npx ')) {
        // For "npx @qwen-code/qwen-code" or "npx @anthropic-ai/claude-code"
        const parts = this.extra.cliPath.split(' ');
        const isWindows = process.platform === 'win32';
        command = isWindows ? 'npx.cmd' : 'npx';
        args = [...parts.slice(1), loginArg];
      } else {
        // For regular paths like '/usr/local/bin/qwen' or '/usr/local/bin/claude'
        command = this.extra.cliPath;
        args = [loginArg];
      }

      const loginProcess = spawn(command, args, {
        stdio: 'pipe', // 避免干扰用户界面
        timeout: 70000,
      });

      await new Promise<void>((resolve, reject) => {
        loginProcess.on('close', (code) => {
          if (code === 0) {
            console.log(`${backend} authentication refreshed`);
            resolve();
          } else {
            reject(new Error(`${backend} login failed with code ${code}`));
          }
        });

        loginProcess.on('error', reject);
      });
    } catch (error) {
      console.warn(`${backend} auth refresh failed, will try to connect anyway:`, error);
      // 不抛出错误，让连接尝试继续
    }
  }

  private async ensureQwenAuth(): Promise<void> {
    if (this.extra.backend !== 'qwen') return;
    await this.ensureBackendAuth('qwen', 'login');
  }

  private async ensureClaudeAuth(): Promise<void> {
    if (this.extra.backend !== 'claude') return;
    await this.ensureBackendAuth('claude', '/login');
  }

  private async performAuthentication(): Promise<void> {
    try {
      const initResponse = this.connection.getInitializeResponse();
      const result = initResponse?.result as InitializeResult | undefined;
      if (!initResponse || !result?.authMethods?.length) {
        // No auth methods available - CLI should handle authentication itself
        this.emitStatusMessage('authenticated');
        return;
      }

      // 先尝试直接创建session以判断是否已鉴权
      try {
        await this.connection.newSession(this.extra.workspace);
        this.emitStatusMessage('authenticated');
        return;
      } catch (_err) {
        // 需要鉴权，进行条件化"预热"尝试
      }

      // 条件化预热：仅在需要鉴权时尝试调用后端CLI登录以刷新token
      if (this.extra.backend === 'qwen') {
        await this.ensureQwenAuth();
      } else if (this.extra.backend === 'claude') {
        await this.ensureClaudeAuth();
      }

      // 预热后重试创建session
      try {
        await this.connection.newSession(this.extra.workspace);
        this.emitStatusMessage('authenticated');
        return;
      } catch (error) {
        // If still failing,引导用户手动登录
        this.emitStatusMessage('error');
      }
    } catch (error) {
      this.emitStatusMessage('error');
    }
  }
}
