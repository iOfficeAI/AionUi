/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';
import type { IMcpServer } from '../../storage';

const execAsync = promisify(exec);

/**
 * iFlow CLI MCP代理实现
 * 注意：iFlow CLI 支持 stdio、SSE、HTTP 传输类型，支持 headers，不支持 streamable_http
 */
export class IflowMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('iflow');
  }

  getSupportedTransports(): string[] {
    return ['stdio', 'sse', 'http'];
  }

  /**
   * 检测iFlow CLI的MCP配置
   */
  async detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    try {
      // 使用iFlow CLI list命令获取MCP配置
      const { stdout: result } = await execAsync('iflow mcp list', { timeout: this.timeout });

      // 如果没有配置任何MCP服务器，返回空数组
      if (result.trim() === 'No MCP servers configured.' || !result.trim()) {
        return [];
      }

      // 解析文本输出
      const mcpServers: IMcpServer[] = [];
      const lines = result.split('\n');

      for (const line of lines) {
        // 清除 ANSI 颜色代码
        const cleanLine = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
        // 查找格式如: "✓ server-name: npx -y 12306-mcp (stdio) - Connected"
        const match = cleanLine.match(/✓\s+([^:]+):\s+([^(]+)\s+\(([^)]+)\)/);
        if (match) {
          const [, name, commandStr, transport] = match;
          const commandParts = commandStr.trim().split(/\s+/);
          const command = commandParts[0];
          const args = commandParts.slice(1);

          const transportType = transport as 'stdio' | 'sse' | 'http';

          mcpServers.push({
            id: `iflow_${name.trim()}`,
            name: name.trim(),
            transport:
              transportType === 'stdio'
                ? {
                    type: 'stdio',
                    command: command,
                    args: args,
                    env: {},
                  }
                : transportType === 'sse'
                  ? {
                      type: 'sse',
                      url: commandStr.trim(),
                    }
                  : {
                      type: 'http',
                      url: commandStr.trim(),
                    },
            tools: [],
            enabled: true,
            status: 'connected' as const,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            description: '',
            originalJson: JSON.stringify(
              {
                mcpServers: {
                  [name.trim()]:
                    transportType === 'stdio'
                      ? {
                          command: command,
                          args: args,
                          description: `Detected from iFlow CLI`,
                        }
                      : {
                          url: commandStr.trim(),
                          type: transportType,
                          description: `Detected from iFlow CLI`,
                        },
                },
              },
              null,
              2
            ),
          });
        }
      }

      return mcpServers;
    } catch (error) {
      console.warn('Failed to get iFlow CLI MCP config:', error);
    }
    return [];
  }

  /**
   * 安装MCP服务器到iFlow agent
   */
  async installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    try {
      // 获取当前已配置的iFlow MCP服务器列表
      const existingServers = await this.detectMcpServers();
      const existingServerNames = new Set(existingServers.map((s) => s.name));

      // 为每个启用的MCP服务器添加到iFlow配置中
      for (const server of mcpServers.filter((s) => s.enabled)) {
        // 跳过已经存在的服务器
        if (existingServerNames.has(server.name)) {
          continue;
        }

        if (server.transport.type === 'streamable_http') {
          console.warn(`Skipping ${server.name}: iFlow CLI does not support streamable_http transport type`);
          continue;
        }

        try {
          let addCommand = `iflow mcp add "${server.name}"`;

          // 根据传输类型构建命令
          if (server.transport.type === 'stdio' && 'command' in server.transport) {
            addCommand += ` "${server.transport.command}"`;
            if (server.transport.args && server.transport.args.length > 0) {
              addCommand += ` ${server.transport.args.map((arg) => `"${arg}"`).join(' ')}`;
            }
            addCommand += ' --transport stdio';

            // 添加环境变量 (仅stdio支持)
            if (server.transport.env) {
              for (const [key, value] of Object.entries(server.transport.env)) {
                addCommand += ` --env ${key}="${value}"`;
              }
            }
          } else if ((server.transport.type === 'sse' || server.transport.type === 'http') && 'url' in server.transport) {
            addCommand += ` "${server.transport.url}"`;
            addCommand += ` --transport ${server.transport.type}`;

            // 添加headers支持
            if (server.transport.headers) {
              for (const [key, value] of Object.entries(server.transport.headers)) {
                addCommand += ` -H "${key}: ${value}"`;
              }
            }
          }

          // 添加描述
          if (server.description) {
            addCommand += ` --description "${server.description}"`;
          }

          // 添加作用域参数，使用user作用域
          addCommand += ' -s user';

          // 执行添加命令
          await execAsync(addCommand, { timeout: 10000 });
        } catch (error) {
          console.warn(`Failed to add MCP server ${server.name} to iFlow:`, error);
          // 继续处理其他服务器，不要因为一个失败就停止整个过程
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 从iFlow agent删除MCP服务器
   */
  async removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    try {
      // 使用iFlow CLI remove命令删除MCP服务器（尝试不同作用域）
      // 首先尝试project作用域，然后尝试user作用域
      try {
        const removeCommand = `iflow mcp remove "${mcpServerName}" -s project`;
        const { stdout } = await execAsync(removeCommand, { timeout: 5000 });

        // 检查输出是否包含"not found"，如果是则继续尝试user作用域
        if (stdout && stdout.includes('not found')) {
          throw new Error('Server not found in project settings');
        }

        return { success: true };
      } catch (projectError) {
        // project作用域失败，尝试user作用域
        try {
          const removeCommand = `iflow mcp remove "${mcpServerName}" -s user`;
          await execAsync(removeCommand, { timeout: 5000 });
          return { success: true };
        } catch (userError) {
          // 如果服务器不存在，也认为是成功的
          if (userError instanceof Error && (userError.message.includes('not found') || userError.message.includes('does not exist'))) {
            return { success: true };
          }
          return { success: false, error: userError instanceof Error ? userError.message : String(userError) };
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
