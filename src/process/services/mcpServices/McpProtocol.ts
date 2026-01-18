/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { AcpBackendAll } from '@/types/acpTypes';
import { JSONRPC_VERSION } from '@/types/acpTypes';
import type { IMcpServer } from '@/common/storage';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * MCP源类型 - 包括所有ACP后端和AionUi内置
 */
export type McpSource = AcpBackendAll | 'aionui';

/**
 * MCP操作结果接口
 */
export interface McpOperationResult {
  success: boolean;
  error?: string;
}

/**
 * MCP连接测试结果接口
 */
export interface McpConnectionTestResult {
  success: boolean;
  tools?: Array<{ name: string; description?: string }>;
  error?: string;
  needsAuth?: boolean; // 是否需要 OAuth 认证
  authMethod?: 'oauth' | 'basic'; // 认证方法
  wwwAuthenticate?: string; // WWW-Authenticate 头内容
}

/**
 * MCP检测结果接口
 */
export interface DetectedMcpServer {
  source: McpSource;
  servers: IMcpServer[];
}

/**
 * MCP同步结果接口
 */
export interface McpSyncResult {
  success: boolean;
  results: Array<{
    agent: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * MCP协议接口 - 定义MCP操作的标准协议
 */
export interface IMcpProtocol {
  /**
   * 检测MCP配置
   * @param cliPath 可选的CLI路径
   * @returns MCP服务器列表
   */
  detectMcpServers(cliPath?: string): Promise<IMcpServer[]>;

  /**
   * 安装MCP服务器到agent
   * @param mcpServers 要安装的MCP服务器列表
   * @returns 操作结果
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult>;

  /**
   * 从agent删除MCP服务器
   * @param mcpServerName 要删除的MCP服务器名称
   * @returns 操作结果
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult>;

  /**
   * 测试MCP服务器连接
   * @param server MCP服务器配置
   * @returns 连接测试结果
   */
  testMcpConnection(server: IMcpServer): Promise<McpConnectionTestResult>;

  /**
   * 获取支持的传输类型
   * @returns 支持的传输类型列表
   */
  getSupportedTransports(): string[];

  /**
   * 获取agent后端类型
   * @returns agent后端类型
   */
  getBackendType(): McpSource;
}

/**
 * MCP协议抽象基类
 */
export abstract class AbstractMcpAgent implements IMcpProtocol {
  protected readonly backend: McpSource;
  protected readonly timeout: number;
  private operationQueue: Promise<any> = Promise.resolve();

  constructor(backend: McpSource, timeout: number = 30000) {
    this.backend = backend;
    this.timeout = timeout;
  }

  /**
   * 确保操作串行执行的互斥锁
   */
  protected withLock<T>(operation: () => Promise<T>): Promise<T> {
    const currentQueue = this.operationQueue;
    const operationName = operation.name || 'anonymous operation';

    // 创建一个新的 Promise，它会等待前一个操作完成
    const newOperation = currentQueue
      .then(() => operation())
      .catch((error) => {
        console.warn(`[${this.backend} MCP] ${operationName} failed:`, error);
        // 即使操作失败，也要继续执行队列中的下一个操作
        throw error;
      });

    // 更新队列（忽略错误，确保队列继续）
    this.operationQueue = newOperation.catch(() => {
      // Empty catch to prevent unhandled rejection
    });

    return newOperation;
  }

  abstract detectMcpServers(cliPath?: string): Promise<IMcpServer[]>;

  abstract installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult>;

  abstract removeMcpServer(mcpServerName: string): Promise<McpOperationResult>;

  abstract getSupportedTransports(): string[];

  getBackendType(): McpSource {
    return this.backend;
  }

  /**
   * 测试MCP服务器连接的通用实现
   * @param serverOrTransport 完整的服务器配置或仅传输配置
   */
  testMcpConnection(serverOrTransport: IMcpServer | IMcpServer['transport']): Promise<McpConnectionTestResult> {
    try {
      // 判断是完整的 IMcpServer 还是仅 transport
      const transport = 'transport' in serverOrTransport ? serverOrTransport.transport : serverOrTransport;

      switch (transport.type) {
        case 'stdio':
          return this.testStdioConnection(transport);
        case 'sse':
          return this.testSseConnection(transport);
        case 'http':
          return this.testHttpConnection(transport);
        case 'streamable_http':
          return this.testStreamableHttpConnection(transport);
        default:
          return Promise.resolve({ success: false, error: 'Unsupported transport type' });
      }
    } catch (error) {
      return Promise.resolve({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * 测试Stdio连接的通用实现
   * 使用 MCP SDK 进行正确的协议通信
   */
  protected async testStdioConnection(
    transport: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    },
    retryCount: number = 0
  ): Promise<McpConnectionTestResult> {
    let mcpClient: Client | null = null;

    try {
      // app imported statically

      // 创建 Stdio 传输层
      const stdioTransport = new StdioClientTransport({
        command: transport.command,
        args: transport.args || [],
        env: { ...process.env, ...transport.env },
      });

      // 创建 MCP 客户端
      mcpClient = new Client(
        {
          name: app.getName(),
          version: app.getVersion(),
        },
        {
          capabilities: {
            sampling: {},
          },
        }
      );

      // 连接到服务器并获取工具列表
      await mcpClient.connect(stdioTransport);
      const result = await mcpClient.listTools();

      const tools = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));

      return { success: true, tools };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 检测 npm 缓存问题并自动修复
      if (errorMessage.includes('ENOTEMPTY') && retryCount < 1) {
        try {
          // exec imported statically
          // promisify imported statically
          const execAsync = promisify(exec);

          // 清理 npm 缓存并重试
          await Promise.race([execAsync('npm cache clean --force && rm -rf ~/.npm/_npx'), new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 10000))]);

          return await this.testStdioConnection(transport, retryCount + 1);
        } catch (cleanupError) {
          return {
            success: false,
            error: `npm cache corruption detected. Auto-cleanup failed, please manually run: npm cache clean --force`,
          };
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      // 清理连接
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch (closeError) {
          console.error('[Stdio] Error closing connection:', closeError);
        }
      }
    }
  }

  /**
   * 测试SSE连接的通用实现
   * 使用 MCP SDK 进行正确的协议通信
   */
  protected async testSseConnection(transport: { url: string; headers?: Record<string, string> }): Promise<McpConnectionTestResult> {
    let mcpClient: Client | null = null;

    try {
      // app imported statically

      // 先尝试简单的 HTTP 请求检测认证需求
      const authCheckResponse = await fetch(transport.url, {
        method: 'GET',
        headers: transport.headers || {},
      });

      // 检查是否需要认证
      if (authCheckResponse.status === 401) {
        const wwwAuthenticate = authCheckResponse.headers.get('WWW-Authenticate');
        if (wwwAuthenticate) {
          return {
            success: false,
            needsAuth: true,
            authMethod: wwwAuthenticate.toLowerCase().includes('bearer') ? 'oauth' : 'basic',
            wwwAuthenticate: wwwAuthenticate,
            error: 'Authentication required',
          };
        }
      }

      // 创建 SSE 传输层
      const sseTransport = new SSEClientTransport(new URL(transport.url));

      // 创建 MCP 客户端
      mcpClient = new Client(
        {
          name: app.getName(),
          version: app.getVersion(),
        },
        {
          capabilities: {
            sampling: {},
          },
        }
      );

      // 连接到服务器并获取工具列表
      await mcpClient.connect(sseTransport);
      const result = await mcpClient.listTools();

      const tools = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));

      return { success: true, tools };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 检查错误消息中是否包含认证相关信息
      if (errorMessage.toLowerCase().includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
        return {
          success: false,
          needsAuth: true,
          error: 'Authentication required',
        };
      }

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      // 清理连接
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch (closeError) {
          console.error('[SSE] Error closing connection:', closeError);
        }
      }
    }
  }

  /**
   * 测试HTTP连接的通用实现
   */
  protected async testHttpConnection(transport: { url: string; headers?: Record<string, string> }): Promise<McpConnectionTestResult> {
    try {
      // app imported statically

      const initResponse = await fetch(transport.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...transport.headers,
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            clientInfo: {
              name: app.getName(),
              version: app.getVersion(),
            },
          },
        }),
      });

      // 检查是否需要认证
      if (initResponse.status === 401) {
        const wwwAuthenticate = initResponse.headers.get('WWW-Authenticate');
        if (wwwAuthenticate) {
          return {
            success: false,
            needsAuth: true,
            authMethod: wwwAuthenticate.toLowerCase().includes('bearer') ? 'oauth' : 'basic',
            wwwAuthenticate: wwwAuthenticate,
            error: 'Authentication required',
          };
        }
      }

      if (!initResponse.ok) {
        return { success: false, error: `HTTP ${initResponse.status}: ${initResponse.statusText}` };
      }

      const initResult = await initResponse.json();
      if (initResult.error) {
        return { success: false, error: initResult.error.message || 'Initialize failed' };
      }

      const toolsResponse = await fetch(transport.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...transport.headers,
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          method: 'tools/list',
          id: 2,
          params: {},
        }),
      });

      if (!toolsResponse.ok) {
        return { success: true, tools: [], error: `Could not fetch tools: HTTP ${toolsResponse.status}` };
      }

      const toolsResult = await toolsResponse.json();
      if (toolsResult.error) {
        return { success: true, tools: [], error: toolsResult.error.message || 'Tools list failed' };
      }

      const tools = toolsResult.result?.tools || [];
      return {
        success: true,
        tools: tools.map((tool: { name: string; description?: string }) => ({
          name: tool.name,
          description: tool.description,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 测试Streamable HTTP连接的通用实现
   * 使用 MCP SDK 进行正确的协议通信
   */
  protected async testStreamableHttpConnection(transport: { url: string; headers?: Record<string, string> }): Promise<McpConnectionTestResult> {
    let mcpClient: Client | null = null;

    try {
      // app imported statically

      // 创建 Streamable HTTP 传输层
      const streamableHttpTransport = new StreamableHTTPClientTransport(new URL(transport.url));

      // 创建 MCP 客户端
      mcpClient = new Client(
        {
          name: app.getName(),
          version: app.getVersion(),
        },
        {
          capabilities: {
            sampling: {},
          },
        }
      );

      // 连接到服务器并获取工具列表
      await mcpClient.connect(streamableHttpTransport);
      const result = await mcpClient.listTools();

      const tools = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));

      return { success: true, tools };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // 清理连接
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch (closeError) {
          console.error('[StreamableHTTP] Error closing connection:', closeError);
        }
      }
    }
  }
}
