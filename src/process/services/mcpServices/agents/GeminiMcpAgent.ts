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
 * Gemini CLI MCP代理实现
 * 注意：Gemini CLI 支持 stdio、SSE、HTTP 传输类型，支持 headers，不支持 streamable_http
 */
export class GeminiMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('gemini');
  }

  getSupportedTransports(): string[] {
    return ['stdio', 'sse', 'http'];
  }

  /**
   * 检测Gemini CLI的MCP配置
   */
  async detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    try {
      // 尝试通过Gemini CLI命令获取MCP配置
      const { stdout: result } = await execAsync('gemini mcp list', { timeout: this.timeout });

      // 如果没有配置任何MCP服务器，返回空数组
      if (result.trim() === 'No MCP servers configured.' || !result.trim()) {
        return [];
      }

      // 解析文本输出（假设格式与iFlow类似）
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
            id: `gemini_${name.trim()}`,
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
                          description: `Detected from Gemini CLI`,
                        }
                      : {
                          url: commandStr.trim(),
                          type: transportType,
                          description: `Detected from Gemini CLI`,
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
      console.warn('Failed to get Gemini MCP config:', error);
    }

    return [];
  }

  /**
   * 安装MCP服务器到Gemini agent
   */
  async installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    try {
      for (const server of mcpServers) {
        if (server.transport.type === 'stdio') {
          // 使用Gemini CLI添加MCP服务器
          // 格式: gemini mcp add -s user <name> <command> [args...] [options]
          const envArgs = Object.entries(server.transport.env || {})
            .map(([key, value]) => `-e ${key}=${value}`)
            .join(' ');

          let command = `gemini mcp add -s user "${server.name}" "${server.transport.command}"`;

          // 添加参数
          if (server.transport.args?.length) {
            const quotedArgs = server.transport.args.map((arg: string) => `"${arg}"`).join(' ');
            command += ` ${quotedArgs}`;
          }

          // 添加环境变量
          if (envArgs) {
            command += ` ${envArgs}`;
          }

          // 添加描述（如果有）
          if (server.description) {
            command += ` --description "${server.description}"`;
          }

          try {
            await execAsync(command, { timeout: 5000 });
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Gemini:`, error);
            // 继续处理其他服务器，不要因为一个失败就停止
          }
        } else if (server.transport.type === 'sse' || server.transport.type === 'http') {
          // 处理 SSE/HTTP 传输类型
          let command = `gemini mcp add -s user "${server.name}" "${server.transport.url}" --transport ${server.transport.type}`;

          // 添加headers支持
          if (server.transport.headers) {
            for (const [key, value] of Object.entries(server.transport.headers)) {
              command += ` -H "${key}: ${value}"`;
            }
          }

          // 添加描述（如果有）
          if (server.description) {
            command += ` --description "${server.description}"`;
          }

          try {
            await execAsync(command, { timeout: 5000 });
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Gemini:`, error);
            // 继续处理其他服务器，不要因为一个失败就停止
          }
        } else if (server.transport.type === 'streamable_http') {
          console.warn(`Skipping ${server.name}: Gemini CLI does not support streamable_http transport type`);
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 从Gemini agent删除MCP服务器
   */
  async removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    try {
      // 使用Gemini CLI命令删除MCP服务器（尝试不同作用域）
      // 首先尝试project作用域，然后尝试user作用域
      try {
        const removeCommand = `gemini mcp remove "${mcpServerName}" -s project`;
        const result = await execAsync(removeCommand, { timeout: 5000 });

        // 检查输出是否表示真正的成功删除
        if (result.stdout && result.stdout.includes('removed from project settings')) {
          return { success: true };
        } else if (result.stdout && result.stdout.includes('not found in project')) {
          // 服务器不在project作用域中，尝试user作用域
          throw new Error('Server not found in project settings');
        } else {
          // 其他情况认为成功（向后兼容）
          return { success: true };
        }
      } catch (projectError) {
        // project作用域失败，尝试user作用域
        try {
          const removeCommand = `gemini mcp remove "${mcpServerName}" -s user`;
          const result = await execAsync(removeCommand, { timeout: 5000 });

          // 检查输出是否表示真正的成功删除
          if (result.stdout && result.stdout.includes('removed from user settings')) {
            return { success: true };
          } else if (result.stdout && result.stdout.includes('not found in user')) {
            // 服务器不在user作用域中，但这也是成功的（服务器本来就不存在）
            return { success: true };
          } else {
            // 其他情况认为成功（向后兼容）
            return { success: true };
          }
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
