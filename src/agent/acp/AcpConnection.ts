/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend, AcpIncomingMessage, AcpMessage, AcpNotification, AcpPermissionRequest, AcpRequest, AcpResponse, AcpSessionUpdate } from '@/types/acpTypes';
import { ACP_METHODS, JSONRPC_VERSION } from '@/types/acpTypes';
import type { ChildProcess, SpawnOptions } from 'child_process';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId?: NodeJS.Timeout;
  method: string;
  isPaused: boolean;
  startTime: number;
  timeoutDuration: number;
}

/**
 * Creates spawn configuration for ACP CLI commands.
 * Exported for unit testing.
 *
 * @param cliPath - CLI command path (e.g., 'goose', 'npx @pkg/cli')
 * @param workingDir - Working directory for the spawned process
 * @param acpArgs - Arguments to enable ACP mode (e.g., ['acp'] for goose, ['--acp'] for auggie, ['exec','--output-format','acp'] for droid)
 * @param customEnv - Custom environment variables
 */
export function createGenericSpawnConfig(cliPath: string, workingDir: string, acpArgs?: string[], customEnv?: Record<string, string>) {
  const isWindows = process.platform === 'win32';
  const env = { ...process.env, ...customEnv };

  // Default to --experimental-acp if no acpArgs specified
  const effectiveAcpArgs = acpArgs && acpArgs.length > 0 ? acpArgs : ['--experimental-acp'];

  let spawnCommand: string;
  let spawnArgs: string[];

  if (cliPath.startsWith('npx ')) {
    // For "npx @package/name", split into command and arguments
    const parts = cliPath.split(' ');
    spawnCommand = isWindows ? 'npx.cmd' : 'npx';
    spawnArgs = [...parts.slice(1), ...effectiveAcpArgs];
  } else {
    // For regular paths like '/usr/local/bin/cli' or simple commands like 'goose'
    spawnCommand = cliPath;
    spawnArgs = effectiveAcpArgs;
  }

  const options: SpawnOptions = {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    shell: isWindows,
  };

  return {
    command: spawnCommand,
    args: spawnArgs,
    options,
  };
}

export class AcpConnection {
  private child: ChildProcess | null = null;
  private pendingRequests = new Map<number, PendingRequest<unknown>>();
  private nextRequestId = 0;
  private sessionId: string | null = null;
  private isInitialized = false;
  private backend: AcpBackend | null = null;
  private initializeResponse: AcpResponse | null = null;
  private workingDir: string = process.cwd();

  public onSessionUpdate: (data: AcpSessionUpdate) => void = () => {};
  public onPermissionRequest: (data: AcpPermissionRequest) => Promise<{
    optionId: string;
  }> = () => Promise.resolve({ optionId: 'allow' }); // Returns a resolved Promise for interface consistency
  public onEndTurn: () => void = () => {}; // Handler for end_turn messages
  public onFileOperation: (operation: { method: string; path: string; content?: string; sessionId: string }) => void = () => {};
  // Disconnect callback - called when child process exits unexpectedly during runtime
  public onDisconnect: (error: { code: number | null; signal: NodeJS.Signals | null }) => void = () => {};

  // Track if initial setup is complete (to distinguish startup errors from runtime exits)
  private isSetupComplete = false;

  // 通用的后端连接方法
  private async connectGenericBackend(backend: 'gemini' | 'qwen' | 'iflow' | 'droid' | 'goose' | 'auggie' | 'kimi' | 'opencode' | 'custom', cliPath: string, workingDir: string, acpArgs?: string[], customEnv?: Record<string, string>): Promise<void> {
    const config = createGenericSpawnConfig(cliPath, workingDir, acpArgs, customEnv);
    this.child = spawn(config.command, config.args, config.options);
    await this.setupChildProcessHandlers(backend);
  }

  async connect(backend: AcpBackend, cliPath?: string, workingDir: string = process.cwd(), acpArgs?: string[], customEnv?: Record<string, string>): Promise<void> {
    if (this.child) {
      this.disconnect();
    }

    this.backend = backend;
    if (workingDir) {
      this.workingDir = workingDir;
    }

    switch (backend) {
      case 'claude':
        await this.connectClaude(workingDir);
        break;

      case 'gemini':
      case 'qwen':
      case 'iflow':
      case 'droid':
      case 'goose':
      case 'auggie':
      case 'kimi':
      case 'opencode':
        if (!cliPath) {
          throw new Error(`CLI path is required for ${backend} backend`);
        }
        await this.connectGenericBackend(backend, cliPath, workingDir, acpArgs);
        break;

      case 'custom':
        if (!cliPath) {
          throw new Error('Custom agent CLI path/command is required');
        }
        await this.connectGenericBackend('custom', cliPath, workingDir, acpArgs, customEnv);
        break;

      default:
        throw new Error(`Unsupported backend: ${backend}`);
    }
  }

  private async connectClaude(workingDir: string = process.cwd()): Promise<void> {
    // Use NPX to run Claude Code ACP bridge directly from npm registry
    // This eliminates dependency packaging issues and simplifies deployment
    console.error('[ACP] Using NPX approach for Claude ACP bridge');

    // Clean environment
    const cleanEnv = { ...process.env };
    delete cleanEnv.NODE_OPTIONS;
    delete cleanEnv.NODE_INSPECT;
    delete cleanEnv.NODE_DEBUG;

    // Use npx to run the Claude ACP bridge directly from npm registry
    const isWindows = process.platform === 'win32';
    const spawnCommand = isWindows ? 'npx.cmd' : 'npx';
    const spawnArgs = ['@zed-industries/claude-code-acp'];

    this.child = spawn(spawnCommand, spawnArgs, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
      shell: isWindows,
    });

    await this.setupChildProcessHandlers('claude');
  }

  private async setupChildProcessHandlers(backend: string): Promise<void> {
    let spawnError: Error | null = null;

    this.child.stderr?.on('data', (data) => {
      console.error(`[ACP ${backend} STDERR]:`, data.toString());
    });

    this.child.on('error', (error) => {
      spawnError = error;
    });

    // Exit handler for both startup and runtime phases
    this.child.on('exit', (code, signal) => {
      console.error(`[ACP ${backend}] Process exited with code: ${code}, signal: ${signal}`);

      if (!this.isSetupComplete) {
        // Startup phase - set error for initial check
        if (code !== 0 && !spawnError) {
          spawnError = new Error(`${backend} ACP process failed with exit code: ${code}`);
        }
      } else {
        // Runtime phase - handle unexpected exit
        this.handleProcessExit(code, signal);
      }
    });

    // Wait a bit for the process to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if process spawn failed
    if (spawnError) {
      throw spawnError;
    }

    // Check if process is still running
    if (!this.child || this.child.killed) {
      throw new Error(`${backend} ACP process failed to start or exited immediately`);
    }

    // Handle messages from ACP server
    let buffer = '';
    this.child.stdout?.on('data', (data) => {
      const dataStr = data.toString();
      buffer += dataStr;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line) as AcpMessage;
            // console.log('AcpMessage==>', JSON.stringify(message));
            this.handleMessage(message);
          } catch (error) {
            // Ignore parsing errors for non-JSON messages
          }
        }
      }
    });

    // Initialize protocol with timeout
    await Promise.race([
      this.initialize(),
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error('Initialize timeout after 60 seconds'));
        }, 60000)
      ),
    ]);

    // Mark setup as complete - future exits will be handled as runtime disconnects
    this.isSetupComplete = true;
  }

  /**
   * Handle unexpected process exit during runtime
   * Similar to Codex's handleProcessExit implementation
   */
  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    // 1. Reject all pending requests with clear error message
    for (const [_id, request] of this.pendingRequests) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error(`ACP process exited unexpectedly (code: ${code}, signal: ${signal})`));
    }
    this.pendingRequests.clear();

    // 2. Clear connection state
    this.sessionId = null;
    this.isInitialized = false;
    this.isSetupComplete = false;
    this.backend = null;
    this.initializeResponse = null;
    this.child = null;

    // 3. Notify AcpAgent about disconnect
    this.onDisconnect({ code, signal });
  }

  private sendRequest<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextRequestId++;
    const message: AcpRequest = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
      ...(params && { params }),
    };

    return new Promise((resolve, reject) => {
      // Use longer timeout for session/prompt requests as they involve LLM processing
      // Complex tasks like document processing may need significantly more time
      const timeoutDuration = method === 'session/prompt' ? 300000 : 60000; // 5 minutes for prompts, 1 minute for others
      const startTime = Date.now();

      const createTimeoutHandler = () => {
        return setTimeout(() => {
          const request = this.pendingRequests.get(id);
          if (request && !request.isPaused) {
            this.pendingRequests.delete(id);
            const timeoutMsg = method === 'session/prompt' ? `LLM request timed out after ${timeoutDuration / 1000} seconds` : `Request ${method} timed out after ${timeoutDuration / 1000} seconds`;
            reject(new Error(timeoutMsg));
          }
        }, timeoutDuration);
      };

      const initialTimeout = createTimeoutHandler();

      const pendingRequest: PendingRequest<T> = {
        resolve: (value: T) => {
          if (pendingRequest.timeoutId) {
            clearTimeout(pendingRequest.timeoutId);
          }
          resolve(value);
        },
        reject: (error: Error) => {
          if (pendingRequest.timeoutId) {
            clearTimeout(pendingRequest.timeoutId);
          }
          reject(error);
        },
        timeoutId: initialTimeout,
        method,
        isPaused: false,
        startTime,
        timeoutDuration,
      };

      this.pendingRequests.set(id, pendingRequest);

      this.sendMessage(message);
    });
  }

  // 暂停指定请求的超时计时器
  private pauseRequestTimeout(requestId: number): void {
    const request = this.pendingRequests.get(requestId);
    if (request && !request.isPaused && request.timeoutId) {
      clearTimeout(request.timeoutId);
      request.isPaused = true;
      request.timeoutId = undefined;
    }
  }

  // 恢复指定请求的超时计时器
  private resumeRequestTimeout(requestId: number): void {
    const request = this.pendingRequests.get(requestId);
    if (request && request.isPaused) {
      const elapsedTime = Date.now() - request.startTime;
      const remainingTime = Math.max(0, request.timeoutDuration - elapsedTime);

      if (remainingTime > 0) {
        request.timeoutId = setTimeout(() => {
          if (this.pendingRequests.has(requestId) && !request.isPaused) {
            this.pendingRequests.delete(requestId);
            request.reject(new Error(`Request ${request.method} timed out`));
          }
        }, remainingTime);
        request.isPaused = false;
      } else {
        // 时间已超过，立即触发超时
        this.pendingRequests.delete(requestId);
        request.reject(new Error(`Request ${request.method} timed out`));
      }
    }
  }

  // 暂停所有 session/prompt 请求的超时
  private pauseSessionPromptTimeouts(): void {
    let _pausedCount = 0;
    for (const [id, request] of this.pendingRequests) {
      if (request.method === 'session/prompt') {
        this.pauseRequestTimeout(id);
        _pausedCount++;
      }
    }
  }

  // 恢复所有 session/prompt 请求的超时
  private resumeSessionPromptTimeouts(): void {
    let _resumedCount = 0;
    for (const [id, request] of this.pendingRequests) {
      if (request.method === 'session/prompt' && request.isPaused) {
        this.resumeRequestTimeout(id);
        _resumedCount++;
      }
    }
  }

  // 重置所有 session/prompt 请求的超时计时器（在收到流式更新时调用）
  // Reset timeout timers for all session/prompt requests (called when receiving streaming updates)
  private resetSessionPromptTimeouts(): void {
    for (const [id, request] of this.pendingRequests) {
      if (request.method === 'session/prompt' && !request.isPaused && request.timeoutId) {
        // Clear existing timeout
        clearTimeout(request.timeoutId);
        // Reset start time and create new timeout
        request.startTime = Date.now();
        request.timeoutId = setTimeout(() => {
          if (this.pendingRequests.has(id) && !request.isPaused) {
            this.pendingRequests.delete(id);
            request.reject(new Error(`LLM request timed out after ${request.timeoutDuration / 1000} seconds`));
          }
        }, request.timeoutDuration);
      }
    }
  }

  private sendMessage(message: AcpRequest | AcpNotification): void {
    if (this.child?.stdin) {
      const jsonString = JSON.stringify(message);
      // Windows 可能需要 \r\n 换行符
      const lineEnding = process.platform === 'win32' ? '\r\n' : '\n';
      const fullMessage = jsonString + lineEnding;

      this.child.stdin.write(fullMessage);
    } else {
      // Child process not available, cannot send message
    }
  }

  private sendResponseMessage(response: AcpResponse): void {
    if (this.child?.stdin) {
      const jsonString = JSON.stringify(response);
      // Windows 可能需要 \r\n 换行符
      const lineEnding = process.platform === 'win32' ? '\r\n' : '\n';
      const fullMessage = jsonString + lineEnding;

      this.child.stdin.write(fullMessage);
    }
  }

  private handleMessage(message: AcpMessage): void {
    try {
      // 优先检查是否为 request/notification（有 method 字段）
      if ('method' in message) {
        // 直接传递给 handleIncomingRequest，switch 会过滤未知 method
        this.handleIncomingRequest(message as AcpIncomingMessage).catch((_error) => {
          // Handle request errors silently
        });
      } else if ('id' in message && typeof message.id === 'number' && this.pendingRequests.has(message.id)) {
        // This is a response to a previous request
        const { resolve, reject } = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if ('result' in message) {
          // Check for end_turn message
          if (message.result && typeof message.result === 'object' && (message.result as Record<string, unknown>).stopReason === 'end_turn') {
            this.onEndTurn();
          }
          resolve(message.result);
        } else if ('error' in message) {
          const errorMsg = message.error?.message || 'Unknown ACP error';
          reject(new Error(errorMsg));
        }
      } else {
        // Unknown message format, ignore
      }
    } catch (_error) {
      // Handle message parsing errors silently
    }
  }

  private async handleIncomingRequest(message: AcpIncomingMessage): Promise<void> {
    try {
      let result = null;

      // 可辨识联合类型：TypeScript 根据 method 字面量自动窄化 params 类型
      switch (message.method) {
        case ACP_METHODS.SESSION_UPDATE:
          // Reset timeout on streaming updates - LLM is still processing
          this.resetSessionPromptTimeouts();
          this.onSessionUpdate(message.params);
          break;
        case ACP_METHODS.REQUEST_PERMISSION:
          result = await this.handlePermissionRequest(message.params);
          break;
        case ACP_METHODS.READ_TEXT_FILE:
          result = await this.handleReadOperation(message.params);
          break;
        case ACP_METHODS.WRITE_TEXT_FILE:
          result = await this.handleWriteOperation(message.params);
          break;
      }

      // If this is a request (has id), send response
      if ('id' in message && typeof message.id === 'number') {
        this.sendResponseMessage({
          jsonrpc: JSONRPC_VERSION,
          id: message.id,
          result,
        });
      }
    } catch (error) {
      if ('id' in message && typeof message.id === 'number') {
        this.sendResponseMessage({
          jsonrpc: JSONRPC_VERSION,
          id: message.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }

  private async handlePermissionRequest(params: AcpPermissionRequest): Promise<{
    outcome: { outcome: string; optionId: string };
  }> {
    // 暂停所有 session/prompt 请求的超时计时器
    this.pauseSessionPromptTimeouts();
    try {
      const response = await this.onPermissionRequest(params);

      // 根据用户的选择决定outcome
      const optionId = response.optionId;
      const outcome = optionId.includes('reject') ? 'rejected' : 'selected';

      return {
        outcome: {
          outcome,
          optionId: optionId,
        },
      };
    } catch (error) {
      // 处理超时或其他错误情况，默认拒绝
      console.error('Permission request failed:', error);
      return {
        outcome: {
          outcome: 'rejected',
          optionId: 'reject_once', // 默认拒绝
        },
      };
    } finally {
      // 无论成功还是失败，都恢复 session/prompt 请求的超时计时器
      this.resumeSessionPromptTimeouts();
    }
  }

  private async handleReadTextFile(params: { path: string }): Promise<{ content: string }> {
    try {
      const content = await fs.readFile(params.path, 'utf-8');
      return { content };
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleWriteTextFile(params: { path: string; content: string }): Promise<null> {
    try {
      await fs.mkdir(path.dirname(params.path), { recursive: true });
      await fs.writeFile(params.path, params.content, 'utf-8');

      // 发送流式内容更新事件到预览面板（用于实时更新）
      // Send streaming content update to preview panel (for real-time updates)
      try {
        const { ipcBridge } = await import('@/common');
        const pathSegments = params.path.split(path.sep);
        const fileName = pathSegments[pathSegments.length - 1];
        const workspace = pathSegments.slice(0, -1).join(path.sep);

        const eventData = {
          filePath: params.path,
          content: params.content,
          workspace: workspace,
          relativePath: fileName,
          operation: 'write' as const,
        };
        ipcBridge.fileStream.contentUpdate.emit(eventData);
      } catch (emitError) {
        console.error('[AcpConnection] ❌ Failed to emit file stream update:', emitError);
      }

      return null;
    } catch (error) {
      throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private resolveWorkspacePath(targetPath: string): string {
    // Absolute paths are used as-is; relative paths are anchored to the conversation workspace
    // 绝对路径保持不变， 相对路径锚定到当前会话的工作区
    if (!targetPath) return this.workingDir;
    if (path.isAbsolute(targetPath)) {
      return targetPath;
    }
    return path.join(this.workingDir, targetPath);
  }

  private async initialize(): Promise<AcpResponse> {
    const initializeParams = {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    };

    const response = await this.sendRequest<AcpResponse>('initialize', initializeParams);
    this.isInitialized = true;
    this.initializeResponse = response;
    return response;
  }

  async authenticate(methodId?: string): Promise<AcpResponse> {
    const result = await this.sendRequest<AcpResponse>('authenticate', methodId ? { methodId } : undefined);
    return result;
  }

  async newSession(cwd: string = process.cwd()): Promise<AcpResponse> {
    // Normalize workspace-relative paths:
    // Agents such as qwen already run with `workingDir` as their process cwd.
    // Sending the absolute path again makes some CLIs treat it as a nested relative path.
    const normalizedCwd = this.normalizeCwdForAgent(cwd);

    const response = await this.sendRequest<AcpResponse & { sessionId?: string }>('session/new', {
      cwd: normalizedCwd,
      mcpServers: [] as unknown[],
    });

    this.sessionId = response.sessionId;
    return response;
  }

  /**
   * Ensure the cwd we send to ACP agents is relative to the actual working directory.
   * 某些 CLI 会对绝对路径进行再次拼接，导致“套娃”路径，因此需要转换为相对路径。
   */
  private normalizeCwdForAgent(cwd?: string): string {
    const defaultPath = '.';
    if (!cwd) return defaultPath;

    try {
      const workspaceRoot = path.resolve(this.workingDir);
      const requested = path.resolve(cwd);

      const relative = path.relative(workspaceRoot, requested);
      const isInsideWorkspace = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

      if (isInsideWorkspace) {
        return relative.length === 0 ? defaultPath : relative;
      }
    } catch (error) {
      console.warn('[ACP] Failed to normalize cwd for agent, using default "."', error);
    }

    return defaultPath;
  }

  async sendPrompt(prompt: string): Promise<AcpResponse> {
    if (!this.sessionId) {
      throw new Error('No active ACP session');
    }

    return await this.sendRequest('session/prompt', {
      sessionId: this.sessionId,
      prompt: [{ type: 'text', text: prompt }],
    });
  }

  async setSessionMode(modeId: string): Promise<AcpResponse> {
    if (!this.sessionId) {
      throw new Error('No active ACP session');
    }

    return await this.sendRequest('session/set_mode', {
      sessionId: this.sessionId,
      modeId,
    });
  }

  async setModel(modelId: string): Promise<AcpResponse> {
    if (!this.sessionId) {
      throw new Error('No active ACP session');
    }

    return await this.sendRequest('session/set_model', {
      sessionId: this.sessionId,
      modelId,
    });
  }

  disconnect(): void {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }

    // Reset state
    this.pendingRequests.clear();
    this.sessionId = null;
    this.isInitialized = false;
    this.isSetupComplete = false;
    this.backend = null;
    this.initializeResponse = null;
  }

  get isConnected(): boolean {
    const connected = this.child !== null && !this.child.killed;
    return connected;
  }

  get hasActiveSession(): boolean {
    const hasSession = this.sessionId !== null;
    return hasSession;
  }

  get currentBackend(): AcpBackend | null {
    return this.backend;
  }

  getInitializeResponse(): AcpResponse | null {
    return this.initializeResponse;
  }

  // Normalize read operations to the conversation workspace before touching the filesystem
  // 访问文件前先把读取操作映射到会话工作区
  private async handleReadOperation(params: { path: string; sessionId?: string }): Promise<{ content: string }> {
    const resolvedReadPath = this.resolveWorkspacePath(params.path);
    this.onFileOperation({
      method: 'fs/read_text_file',
      path: resolvedReadPath,
      sessionId: params.sessionId || '',
    });
    return await this.handleReadTextFile({ ...params, path: resolvedReadPath });
  }

  // Normalize write operations and emit UI events so the workspace view stays in sync
  // 将写入操作归一化并通知 UI，保持工作区视图同步
  private async handleWriteOperation(params: { path: string; content: string; sessionId?: string }): Promise<null> {
    const resolvedWritePath = this.resolveWorkspacePath(params.path);
    this.onFileOperation({
      method: 'fs/write_text_file',
      path: resolvedWritePath,
      content: params.content,
      sessionId: params.sessionId || '',
    });
    return await this.handleWriteTextFile({ ...params, path: resolvedWritePath });
  }
}
