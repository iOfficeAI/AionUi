/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { JSONRPC_VERSION } from '@/common/acpTypes';
import type { AcpBackend, AcpMessage, AcpNotification, AcpPermissionRequest, AcpRequest, AcpResponse, AcpSessionUpdate } from '@/common/acpTypes';
import type { ChildProcess, SpawnOptions } from 'child_process';
import { spawn } from 'child_process';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeoutId?: NodeJS.Timeout;
  method: string;
  isPaused: boolean;
  startTime: number;
  timeoutDuration: number;
}

export class AcpConnection {
  private child: ChildProcess | null = null;
  private pendingRequests = new Map<number, PendingRequest>();
  private nextRequestId = 0;
  private sessionId: string | null = null;
  private isInitialized = false;
  private backend: AcpBackend | null = null;
  private initializeResponse: any = null;

  public onSessionUpdate: (data: AcpSessionUpdate) => void = () => {};
  public onPermissionRequest: (data: AcpPermissionRequest) => Promise<{
    optionId: string;
  }> = async () => ({ optionId: 'allow' });
  public onEndTurn: () => void = () => {}; // Handler for end_turn messages
  public onFileOperation: (operation: { method: string; path: string; content?: string; sessionId: string }) => void = () => {};

  // 通用的spawn配置生成方法
  private createGenericSpawnConfig(backend: string, cliPath: string, workingDir: string) {
    const isWindows = process.platform === 'win32';
    const env = {
      ...process.env,
    };

    let spawnCommand: string;
    let spawnArgs: string[];

    if (cliPath.startsWith('npx ')) {
      // For "npx @package/name", split into command and arguments
      const parts = cliPath.split(' ');
      spawnCommand = isWindows ? 'npx.cmd' : 'npx';
      spawnArgs = [...parts.slice(1), '--experimental-acp'];
    } else {
      // For regular paths like '/usr/local/bin/cli'
      spawnCommand = cliPath;
      spawnArgs = ['--experimental-acp'];
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

  // 通用的后端连接方法
  private async connectGenericBackend(backend: 'gemini' | 'qwen' | 'iflow', cliPath: string, workingDir: string): Promise<void> {
    const config = this.createGenericSpawnConfig(backend, cliPath, workingDir);
    this.child = spawn(config.command, config.args, config.options);
    await this.setupChildProcessHandlers(backend);
  }

  async connect(backend: AcpBackend, cliPath?: string, workingDir: string = process.cwd()): Promise<void> {
    if (this.child) {
      this.disconnect();
    }

    this.backend = backend;

    switch (backend) {
      case 'claude':
        await this.connectClaude(workingDir);
        break;

      case 'gemini':
      case 'qwen':
      case 'iflow':
        if (!cliPath) {
          throw new Error(`${backend} CLI path is required for ${backend} backend`);
        }
        await this.connectGenericBackend(backend, cliPath, workingDir);
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

    this.child.on('exit', (code, signal) => {
      console.error(`[ACP ${backend}] Process exited with code: ${code}, signal: ${signal}`);
      if (code !== 0) {
        if (!spawnError) {
          spawnError = new Error(`${backend} ACP process failed with exit code: ${code}`);
        }
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
  }

  private async sendRequest(method: string, params?: any): Promise<any> {
    const id = this.nextRequestId++;
    const message: AcpRequest = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
      ...(params && { params }),
    };

    return new Promise((resolve, reject) => {
      // Use longer timeout for session/prompt requests as they involve LLM processing
      const timeoutDuration = method === 'session/prompt' ? 120000 : 60000; // 2 minutes for prompts, 1 minute for others
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

      const pendingRequest: PendingRequest = {
        resolve: (value: any) => {
          if (pendingRequest.timeoutId) {
            clearTimeout(pendingRequest.timeoutId);
          }
          resolve(value);
        },
        reject: (error: any) => {
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
      // 修复：优先检查是否为 request（有 method 字段），而不是仅基于 ID
      if ('method' in message) {
        // This is a request or notification
        this.handleIncomingRequest(message).catch((_error) => {
          // Handle request errors silently
        });
      } else if ('id' in message && typeof message.id === 'number' && this.pendingRequests.has(message.id)) {
        // This is a response to a previous request
        const { resolve, reject } = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if ('result' in message) {
          // Check for end_turn message
          if (message.result && typeof message.result === 'object' && message.result.stopReason === 'end_turn') {
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

  private async handleIncomingRequest(message: AcpRequest | AcpNotification): Promise<void> {
    const { method, params } = message;

    try {
      let result = null;

      switch (method) {
        case 'session/update':
          this.onSessionUpdate(params);
          break;
        case 'session/request_permission':
          result = await this.handlePermissionRequest(params);
          break;
        case 'fs/read_text_file':
          // 通知UI文件读取操作
          this.onFileOperation({
            method: 'fs/read_text_file',
            path: params.path,
            sessionId: params.sessionId || '',
          });
          result = await this.handleReadTextFile(params);
          break;
        case 'fs/write_text_file':
          // 通知UI文件写入操作
          this.onFileOperation({
            method: 'fs/write_text_file',
            path: params.path,
            content: params.content,
            sessionId: params.sessionId || '',
          });
          result = await this.handleWriteTextFile(params);
          break;
        default:
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
    const { promises: fs } = await import('fs');
    try {
      const content = await fs.readFile(params.path, 'utf-8');
      return { content };
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleWriteTextFile(params: { path: string; content: string }): Promise<null> {
    const { promises: fs } = await import('fs');
    try {
      await fs.writeFile(params.path, params.content, 'utf-8');
      return null;
    } catch (error) {
      throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async initialize(): Promise<any> {
    const initializeParams = {
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    };

    const response = await this.sendRequest('initialize', initializeParams);
    this.isInitialized = true;
    this.initializeResponse = response;
    return response;
  }

  async authenticate(methodId?: string): Promise<any> {
    const result = await this.sendRequest('authenticate', methodId ? { methodId } : undefined);
    return result;
  }

  async newSession(cwd: string = process.cwd()): Promise<any> {
    const response = await this.sendRequest('session/new', {
      cwd,
      mcpServers: [] as any[],
    });

    this.sessionId = response.sessionId;
    return response;
  }

  async sendPrompt(prompt: string): Promise<any> {
    if (!this.sessionId) {
      throw new Error('No active ACP session');
    }

    // console.log('Sending ACP session...', prompt);

    return await this.sendRequest('session/prompt', {
      sessionId: this.sessionId,
      prompt: [{ type: 'text', text: prompt }],
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

  getInitializeResponse(): any {
    return this.initializeResponse;
  }
}
