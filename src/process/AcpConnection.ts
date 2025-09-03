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

    // Add process spawn error handling
    let spawnError: Error | null = null;

    if (backend === 'claude') {
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
    } else if (backend === 'gemini') {
      // Use Gemini CLI
      if (!cliPath) {
        throw new Error('Gemini CLI path is required for gemini backend');
      }

      // Set up environment variables for Gemini authentication
      const env: Record<string, string | undefined> = {
        ...process.env,
      };
      
      // Try to get proxy configuration for OAuth check
      const { ProcessConfig } = await import('@/process/initStorage');
      const proxy = await ProcessConfig.get('gemini.config')
        .then((config: any) => config?.proxy || '')
        .catch(() => '');

      try {
        // Priority 1: Use existing Google OAuth authentication from GeminiSettings
        const { getOauthInfoWithCache, AuthType, loginWithOauth, Config } = await import('@office-ai/aioncli-core');
        
        const oauthInfo = await getOauthInfoWithCache(proxy);
        
        if (oauthInfo && oauthInfo.email) {
          // Use existing Google OAuth authentication from GeminiSettings
          // Gemini CLI will use cached credentials automatically
        } else {
          // Priority 2: Check for API Key from ModeSettings
          const modelConfig = await ProcessConfig.get('model.config').catch((): null => null);
          
          if (modelConfig && Array.isArray(modelConfig)) {
            const geminiModels = modelConfig.filter((m: any) => 
              m.platform === 'gemini' && m.apiKey
            );
            
            if (geminiModels.length > 0) {
              // Use API Key from ModeSettings
              env.GEMINI_API_KEY = geminiModels[0].apiKey;
            }
          }
          
          // Priority 3: If no API Key from ModeSettings, trigger Google OAuth login
          if (!env.GEMINI_API_KEY) {
            const config = new Config({
              proxy,
              sessionId: '',
              targetDir: '',
              debugMode: false,
              cwd: '',
              model: '',
            });
            
            const client = await loginWithOauth(AuthType.LOGIN_WITH_GOOGLE, config);
            
            if (client) {
              // OAuth login successful, Gemini CLI will use cached credentials
              const newOauthInfo = await getOauthInfoWithCache(proxy);
              
              if (newOauthInfo && newOauthInfo.email) {
                // Successfully authenticated with Google OAuth
              } else {
                throw new Error('[ACP-AUTH-003] Google 登录后无法获取有效认证信息');
              }
            } else {
              throw new Error('[ACP-AUTH-004] Google 登录失败或被取消');
            }
          }
        }
      } catch (oauthError: any) {
        throw new Error('[ACP-AUTH-002] 无法获取 Gemini 认证信息: 请在 GeminiSettings 中登录或在 ModeSettings 中配置 API Key');
      }

      this.child = spawn(cliPath, ['--experimental-acp'], {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      });
    } else {
      throw new Error(`Unsupported backend: ${backend}`);
    }

    this.child.stderr?.on('data', (data) => {
      const errorOutput = data.toString();
    });

    this.child.on('error', (error) => {
      spawnError = error;
    });

    this.child.on('exit', (code, signal) => {
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
          } catch (_error) {}
        }
      }
    });

    // Initialize protocol with timeout
    try {
      await Promise.race([
        this.initialize(),
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error('Initialize timeout after 20 seconds'));
          }, 20000)
        ),
      ]);
    } catch (error) {
      throw error;
    }
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
        timeoutDuration
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
    let pausedCount = 0;
    for (const [id, request] of this.pendingRequests) {
      if (request.method === 'session/prompt') {
        this.pauseRequestTimeout(id);
        pausedCount++;
      }
    }
  }

  // 恢复所有 session/prompt 请求的超时
  private resumeSessionPromptTimeouts(): void {
    let resumedCount = 0;
    for (const [id, request] of this.pendingRequests) {
      if (request.method === 'session/prompt' && request.isPaused) {
        this.resumeRequestTimeout(id);
        resumedCount++;
      }
    }
  }

  private sendMessage(message: AcpRequest | AcpNotification): void {
    if (this.child?.stdin) {
      const jsonString = JSON.stringify(message) + '\n';
      this.child.stdin.write(jsonString);
    } else {
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
        this.handleIncomingRequest(message).catch((error) => {});
      } else {
      }
    } catch (_error) {}
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
    const fs = require('fs').promises;
    try {
      const content = await fs.readFile(params.path, 'utf-8');
      return { content };
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleWriteTextFile(params: { path: string; content: string }): Promise<null> {
    const fs = require('fs').promises;
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

  // Test API key validity
  static async testApiKey(apiKey: string): Promise<boolean> {
    try {
      const testPayload = {
        contents: [
          {
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      });

      if (response.ok) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }
}
