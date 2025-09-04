/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import path from 'path';
import type { AcpBackend } from '@/common/acpTypes';

// JSON-RPC 协议版本 - ACP 规范要求使用 2.0
const JSONRPC_VERSION = '2.0' as const;

interface AcpRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: string;
  params?: any;
}

interface AcpResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

interface AcpNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: any;
}

type AcpMessage = AcpRequest | AcpResponse | AcpNotification;

export interface AcpSessionUpdate {
  sessionId: string;
  messages?: Array<{
    type: 'assistant' | 'user' | 'tool_call' | 'tool_result';
    content: any;
  }>;
}

export interface AcpPermissionRequest {
  options: Array<{
    optionId: string;
    name: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
    // 以下字段为向后兼容，不是官方协议标准
    description?: string;
    title?: string;
  }>;
  title?: string;
  description?: string;
}

// Re-export from common types for backward compatibility
export type { AcpBackend } from '@/common/acpTypes';

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

  // Event handlers
  public onSessionUpdate: (data: AcpSessionUpdate) => void = () => {};
  public onPermissionRequest: (data: AcpPermissionRequest) => Promise<{ optionId: string }> = async () => ({ optionId: 'allow' });

  async connect(backend: AcpBackend, cliPath?: string, workingDir: string = process.cwd()): Promise<void> {
    // Disconnect existing connection to prevent process leaks
    if (this.child) {
      this.disconnect();
    }

    this.backend = backend;

    switch (backend) {
      case 'claude':
        await this.connectClaude(cliPath, workingDir);
        break;

      case 'gemini':
        await this.connectGemini(cliPath, workingDir);
        break;

      case 'qwen':
        await this.connectQwen(cliPath, workingDir);
        break;

      default:
        throw new Error(`Unsupported backend: ${backend}`);
    }
  }

  private async connectClaude(cliPath?: string, workingDir: string = process.cwd()): Promise<void> {
    // Use npm package version of Claude Code ACP with patch support
    const claudeAcpPath = path.join(__dirname, '..', '..', 'node_modules', '@zed-industries', 'claude-code-acp', 'dist', 'index.js');

    const args = [claudeAcpPath];
    if (cliPath) {
      args.push('--claude-path', cliPath);
    }

    // Clean environment
    const cleanEnv = { ...process.env };
    delete cleanEnv.NODE_OPTIONS;
    delete cleanEnv.NODE_INSPECT;
    delete cleanEnv.NODE_DEBUG;

    this.child = spawn('node', args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
    });

    await this.setupChildProcessHandlers('claude');
  }

  private async connectGemini(cliPath?: string, workingDir: string = process.cwd()): Promise<void> {
    if (!cliPath) {
      throw new Error('Gemini CLI path is required for gemini backend');
    }

    // Clean environment - let Gemini CLI handle its own authentication
    const env: Record<string, string | undefined> = {
      ...process.env,
    };

    // Handle npx command format properly
    let spawnCommand: string;
    let spawnArgs: string[];

    if (cliPath.startsWith('npx ')) {
      // For "npx @google/gemini-cli", split into command and arguments
      const parts = cliPath.split(' ');
      const isWindows = process.platform === 'win32';
      spawnCommand = isWindows ? 'npx.cmd' : 'npx'; // Use npx.cmd on Windows
      spawnArgs = [...parts.slice(1), '--experimental-acp']; // ['@google/gemini-cli', '--experimental-acp']
    } else {
      // For regular paths like '/usr/local/bin/gemini'
      spawnCommand = cliPath;
      spawnArgs = ['--experimental-acp'];
    }

    this.child = spawn(spawnCommand, spawnArgs, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    await this.setupChildProcessHandlers('gemini');
  }

  private async connectQwen(cliPath?: string, workingDir: string = process.cwd()): Promise<void> {
    if (!cliPath) {
      throw new Error('Qwen Code CLI path is required for qwen backend');
    }

    // Clean environment - let Qwen CLI handle its own authentication
    const env: Record<string, string | undefined> = {
      ...process.env,
    };

    // Handle command format
    let spawnCommand: string;
    let spawnArgs: string[];

    if (cliPath.startsWith('npx ')) {
      // For "npx @qwen-code/qwen-code", split into command and arguments
      const parts = cliPath.split(' ');
      const isWindows = process.platform === 'win32';
      spawnCommand = isWindows ? 'npx.cmd' : 'npx'; // Use npx.cmd on Windows
      spawnArgs = [...parts.slice(1), '--experimental-acp']; // ['@qwen-code/qwen-code', '--experimental-acp']
    } else {
      // For regular paths like '/usr/local/bin/qwen'
      spawnCommand = cliPath;
      spawnArgs = ['--experimental-acp'];
    }

    this.child = spawn(spawnCommand, spawnArgs, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    await this.setupChildProcessHandlers('qwen');
  }

  private async setupChildProcessHandlers(backend: string): Promise<void> {
    let spawnError: Error | null = null;

    this.child.stderr?.on('data', (_data) => {
      // Error output handled by parent process
    });

    this.child.on('error', (error) => {
      spawnError = error;
    });

    this.child.on('exit', (code, _signal) => {
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
            this.handleMessage(message);
          } catch (_error) {
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
          reject(new Error('Initialize timeout after 20 seconds'));
        }, 20000)
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
      const timeoutDuration = 15000;
      const startTime = Date.now();

      const createTimeoutHandler = () => {
        return setTimeout(() => {
          const request = this.pendingRequests.get(id);
          if (request && !request.isPaused) {
            this.pendingRequests.delete(id);
            reject(new Error(`Request ${method} timed out`));
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
      const jsonString = JSON.stringify(message) + '\n';
      this.child.stdin.write(jsonString);
    } else {
      // Child process not available, cannot send message
    }
  }

  private sendResponseMessage(response: AcpResponse): void {
    if (this.child?.stdin) {
      const jsonString = JSON.stringify(response) + '\n';
      this.child.stdin.write(jsonString);
    }
  }

  private handleMessage(message: AcpMessage): void {
    try {
      if ('id' in message && typeof message.id === 'number' && this.pendingRequests.has(message.id)) {
        // This is a response
        const { resolve, reject } = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        if ('result' in message) {
          resolve(message.result);
        } else if ('error' in message) {
          const errorMsg = message.error?.message || 'Unknown ACP error';
          reject(new Error(errorMsg));
        }
      } else if ('method' in message) {
        // This is a request or notification
        this.handleIncomingRequest(message).catch((_error) => {
          // Handle request errors silently
        });
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
          this.handleSessionUpdate(params);
          break;
        case 'session/request_permission':
          result = await this.handlePermissionRequest(params);
          break;
        case 'fs/read_text_file':
          result = await this.handleReadTextFile(params);
          break;
        case 'fs/write_text_file':
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

  private handleSessionUpdate(params: AcpSessionUpdate): void {
    this.onSessionUpdate(params);
  }

  private async handlePermissionRequest(params: AcpPermissionRequest): Promise<{ outcome: { outcome: string; optionId: string } }> {
    // 暂停所有 session/prompt 请求的超时计时器
    this.pauseSessionPromptTimeouts();

    try {
      const response = await this.onPermissionRequest(params);

      return {
        outcome: {
          outcome: 'selected',
          optionId: response.optionId,
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
    return this.child !== null && !this.child.killed;
  }

  get hasActiveSession(): boolean {
    return this.sessionId !== null;
  }

  get currentBackend(): AcpBackend | null {
    return this.backend;
  }

  getInitializeResponse(): any {
    return this.initializeResponse;
  }
}
