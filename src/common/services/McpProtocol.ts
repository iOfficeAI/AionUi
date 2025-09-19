/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from '../acpTypes';
import type { IMcpServer } from '../storage';

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
}

/**
 * MCP检测结果接口
 */
export interface DetectedMcpServer {
  source: AcpBackend;
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
  getBackendType(): AcpBackend;
}

/**
 * MCP协议抽象基类
 */
export abstract class AbstractMcpAgent implements IMcpProtocol {
  protected readonly backend: AcpBackend;
  protected readonly timeout: number;

  constructor(backend: AcpBackend, timeout: number = 15000) {
    this.backend = backend;
    this.timeout = timeout;
  }

  abstract detectMcpServers(cliPath?: string): Promise<IMcpServer[]>;

  abstract installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult>;

  abstract removeMcpServer(mcpServerName: string): Promise<McpOperationResult>;

  abstract getSupportedTransports(): string[];

  getBackendType(): AcpBackend {
    return this.backend;
  }

  /**
   * 测试MCP服务器连接的通用实现
   */
  async testMcpConnection(server: IMcpServer): Promise<McpConnectionTestResult> {
    try {
      switch (server.transport.type) {
        case 'stdio':
          return this.testStdioConnection(server.transport);
        case 'sse':
          return this.testSseConnection(server.transport);
        case 'http':
          return this.testHttpConnection(server.transport);
        case 'streamable_http':
          return this.testStreamableHttpConnection(server.transport);
        default:
          return { success: false, error: 'Unsupported transport type' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 测试Stdio连接的通用实现
   */
  protected async testStdioConnection(transport: { command: string; args?: string[]; env?: Record<string, string> }): Promise<McpConnectionTestResult> {
    try {
      const { spawn } = await import('child_process');

      return new Promise((resolve) => {
        const child = spawn(transport.command, transport.args || [], {
          env: { ...process.env, ...transport.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let responseData = '';
        let errorData = '';
        let requestId = 1;

        const timeout = setTimeout(() => {
          child.kill();
          resolve({ success: false, error: 'Connection timeout' });
        }, 10000);

        const cleanup = () => {
          clearTimeout(timeout);
          if (!child.killed) {
            child.kill();
          }
        };

        child.stderr?.on('data', (data) => {
          errorData += data.toString();
        });

        child.stdout?.on('data', (data) => {
          responseData += data.toString();

          const lines = responseData.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const response = JSON.parse(line.trim());

                if (response.id === 1 && response.result) {
                  const toolsRequest = {
                    jsonrpc: '2.0',
                    method: 'tools/list',
                    id: 2,
                    params: {},
                  };
                  child.stdin?.write(JSON.stringify(toolsRequest) + '\n');
                }

                if (response.id === 2 && response.result) {
                  cleanup();
                  const tools = response.result.tools || [];
                  resolve({
                    success: true,
                    tools: tools.map((tool: any) => ({
                      name: tool.name,
                      description: tool.description,
                    })),
                  });
                  return;
                }

                if (response.error) {
                  cleanup();
                  resolve({ success: false, error: response.error.message || 'MCP protocol error' });
                  return;
                }
              } catch (parseError) {
                // 忽略解析错误，继续等待更多数据
              }
            }
          }
        });

        child.on('error', (error) => {
          cleanup();
          resolve({ success: false, error: error.message });
        });

        child.on('exit', (code) => {
          cleanup();
          if (code !== 0) {
            resolve({ success: false, error: `Process exited with code ${code}. Error: ${errorData}` });
          } else {
            resolve({ success: false, error: 'Process exited without providing tools list' });
          }
        });

        child.on('spawn', () => {
          const initRequest = {
            jsonrpc: '2.0',
            method: 'initialize',
            id: requestId++,
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
              },
              clientInfo: {
                name: 'AionUi',
                version: '1.0.0',
              },
            },
          };
          child.stdin?.write(JSON.stringify(initRequest) + '\n');
        });
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 测试SSE连接的通用实现
   */
  protected async testSseConnection(transport: { url: string; headers?: Record<string, string> }): Promise<McpConnectionTestResult> {
    try {
      const response = await fetch(transport.url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...transport.headers,
        },
      });

      if (response.ok) {
        return { success: true, tools: [] };
      } else {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 测试HTTP连接的通用实现
   */
  protected async testHttpConnection(transport: { url: string; headers?: Record<string, string> }): Promise<McpConnectionTestResult> {
    try {
      const initResponse = await fetch(transport.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...transport.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            clientInfo: {
              name: 'AionUi',
              version: '1.0.0',
            },
          },
        }),
      });

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
          jsonrpc: '2.0',
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
        tools: tools.map((tool: any) => ({
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
   */
  protected async testStreamableHttpConnection(transport: { url: string; headers?: Record<string, string> }): Promise<McpConnectionTestResult> {
    try {
      const initResponse = await fetch(transport.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...transport.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            clientInfo: {
              name: 'AionUi',
              version: '1.0.0',
            },
          },
        }),
      });

      if (!initResponse.ok) {
        return { success: false, error: `HTTP ${initResponse.status}: ${initResponse.statusText}` };
      }

      const initResult = await initResponse.json();
      if (initResult.error) {
        return { success: false, error: initResult.error.message || 'Initialize failed' };
      }

      const sessionId = initResponse.headers.get('mcp-session-id');

      const toolsResponse = await fetch(transport.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(sessionId && { 'mcp-session-id': sessionId }),
          ...transport.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
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
        tools: tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 解析MCP服务器配置的通用方法
   */
  protected parseMcpServersConfig(mcpServers: Record<string, any>, source: AcpBackend): IMcpServer[] {
    const servers: IMcpServer[] = [];
    const now = Date.now();

    for (const [name, config] of Object.entries(mcpServers)) {
      try {
        const transport = config.command
          ? {
              type: 'stdio' as const,
              command: config.command,
              args: config.args || [],
              env: config.env || {},
            }
          : config.url?.includes('/sse')
            ? {
                type: 'sse' as const,
                url: config.url,
                headers: config.headers,
              }
            : {
                type: 'http' as const,
                url: config.url,
                headers: config.headers,
              };

        servers.push({
          id: `${source}_${name}_${now}`,
          name: `${name} (${source})`,
          description: config.description || `Imported from ${source}`,
          enabled: true,
          transport,
          status: 'disconnected',
          createdAt: now,
          updatedAt: now,
          originalJson: JSON.stringify({ mcpServers: { [name]: config } }, null, 2),
        });
      } catch (error) {
        // Silently ignore parse errors
      }
    }

    return servers;
  }
}
