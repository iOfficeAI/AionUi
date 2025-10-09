/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';
import type { IMcpServer } from '../../../../common/storage';

const execAsync = promisify(exec);

/**
 * Google Gemini CLI MCP代理实现
 *
 * 使用 Google 官方的 Gemini CLI 的 mcp 子命令管理 MCP 服务器配置
 * 注意：这是管理真实的 Google Gemini CLI，不是 @office-ai/aioncli-core
 */
export class GeminiMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('gemini');
  }

  getSupportedTransports(): string[] {
    // Google Gemini CLI 支持 stdio, sse, http 传输类型
    return ['stdio', 'sse', 'http'];
  }

  /**
   * 检测 Google Gemini CLI 的 MCP 配置
   */
  async detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    try {
      // 使用 Gemini CLI 命令获取 MCP 配置
      const { stdout: result } = await execAsync('gemini mcp list', { timeout: this.timeout });

      // 如果没有配置任何MCP服务器，返回空数组
      if (result.includes('No MCP servers configured') || !result.trim()) {
        return [];
      }

      // 解析文本输出
      const mcpServers: IMcpServer[] = [];
      const lines = result.split('\n');

      for (const line of lines) {
        // 清除 ANSI 颜色代码
        // eslint-disable-next-line no-control-regex
        const cleanLine = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();

        // 查找格式如: "✓ 12306-mcp: npx -y 12306-mcp (stdio) - Connected"
        const match = cleanLine.match(/[✓✗]\s+([^:]+):\s+(.+?)\s+\(([^)]+)\)\s*-\s*(Connected|Disconnected)/);
        if (match) {
          const [, name, commandStr, transport, status] = match;
          const commandParts = commandStr.trim().split(/\s+/);
          const command = commandParts[0];
          const args = commandParts.slice(1);

          const transportType = transport as 'stdio' | 'sse' | 'http';

          // 构建transport对象
          const transportObj: any =
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
                  };

          // 尝试获取tools信息（仅对已连接的stdio服务器）
          let tools: Array<{ name: string; description?: string }> = [];
          if (status === 'Connected' && transportType === 'stdio') {
            try {
              const testResult = await this.testStdioConnection({
                command: command,
                args: args,
                env: {},
              });
              tools = testResult.tools || [];
            } catch (error) {
              console.warn(`Failed to get tools for ${name.trim()}:`, error);
            }
          }

          mcpServers.push({
            id: `gemini_${name.trim()}`,
            name: name.trim(),
            transport: transportObj,
            tools: tools,
            enabled: true,
            status: status === 'Connected' ? 'connected' : 'disconnected',
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
                          description: `Detected from Google Gemini CLI`,
                        }
                      : {
                          url: commandStr.trim(),
                          type: transportType,
                          description: `Detected from Google Gemini CLI`,
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
      console.warn('Failed to get Google Gemini CLI MCP config:', error);
      return [];
    }
  }

  /**
   * 安装 MCP 服务器到 Google Gemini CLI
   */
  async installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    try {
      for (const server of mcpServers) {
        if (server.transport.type === 'stdio') {
          // 使用 Gemini CLI 添加 MCP 服务器
          // 格式: gemini mcp add <name> <command> [args...]
          const args = server.transport.args?.join(' ') || '';
          let command = `gemini mcp add "${server.name}" "${server.transport.command}"`;
          if (args) {
            command += ` ${args}`;
          }

          // 添加 scope 参数（user 或 project）
          command += ' -s user';

          try {
            await execAsync(command, { timeout: 5000 });
            console.log(`[GeminiMcpAgent] Added MCP server: ${server.name}`);
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Gemini:`, error);
            // 继续处理其他服务器
          }
        } else if (server.transport.type === 'sse' || server.transport.type === 'http') {
          // 处理 SSE/HTTP 传输类型
          let command = `gemini mcp add "${server.name}" "${server.transport.url}"`;

          // 添加 transport 类型
          command += ` --transport ${server.transport.type}`;

          // 添加 scope 参数
          command += ' -s user';

          try {
            await execAsync(command, { timeout: 5000 });
            console.log(`[GeminiMcpAgent] Added MCP server: ${server.name}`);
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Gemini:`, error);
          }
        } else {
          console.warn(`Skipping ${server.name}: Gemini CLI does not support ${server.transport.type} transport type`);
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 从 Google Gemini CLI 删除 MCP 服务器
   */
  async removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    try {
      // 使用 Gemini CLI 命令删除 MCP 服务器
      // 首先尝试 user scope
      try {
        const removeCommand = `gemini mcp remove "${mcpServerName}" -s user`;
        const result = await execAsync(removeCommand, { timeout: 5000 });

        if (result.stdout && result.stdout.includes('removed')) {
          console.log(`[GeminiMcpAgent] Removed MCP server: ${mcpServerName}`);
          return { success: true };
        } else if (result.stdout && result.stdout.includes('not found')) {
          // 尝试 project scope
          throw new Error('Server not found in user scope');
        } else {
          return { success: true };
        }
      } catch (userError) {
        // 尝试 project scope
        try {
          const removeCommand = `gemini mcp remove "${mcpServerName}" -s project`;
          const result = await execAsync(removeCommand, { timeout: 5000 });

          if (result.stdout && result.stdout.includes('removed')) {
            console.log(`[GeminiMcpAgent] Removed MCP server from project: ${mcpServerName}`);
            return { success: true };
          } else {
            // 服务器不存在，也认为成功
            return { success: true };
          }
        } catch (projectError) {
          // 如果服务器不存在，也认为成功
          if (userError instanceof Error && userError.message.includes('not found')) {
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
