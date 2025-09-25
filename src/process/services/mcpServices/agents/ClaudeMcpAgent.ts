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
 * Claude Code MCP代理实现
 * 注意：Claude CLI 目前只支持 stdio 传输类型，不支持 SSE/HTTP/streamable_http
 */
export class ClaudeMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('claude');
  }

  getSupportedTransports(): string[] {
    return ['stdio'];
  }

  /**
   * 检测Claude Code的MCP配置
   */
  async detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    try {
      // 使用Claude Code CLI命令获取MCP配置
      const { stdout: result } = await execAsync('claude mcp list', { timeout: this.timeout });

      // 如果没有配置任何MCP服务器，返回空数组
      if (result.includes('No MCP servers configured') || !result.trim()) {
        return [];
      }

      // 解析文本输出
      const mcpServers: IMcpServer[] = [];
      const lines = result.split('\n');

      for (const line of lines) {
        // 清除 ANSI 颜色代码
        const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
        // 查找格式如: "Bazi: npx bazi-mcp - ✓ Connected"
        const match = cleanLine.match(/^([^:]+):\s+(.+?)\s*-\s*[✓✗]\s*(Connected|Disconnected)/);
        if (match) {
          const [, name, commandStr, status] = match;
          const commandParts = commandStr.trim().split(/\s+/);
          const command = commandParts[0];
          const args = commandParts.slice(1);

          // 构建transport对象
          const transportObj = {
            type: 'stdio' as const,
            command: command,
            args: args,
            env: {},
          };

          // 尝试获取tools信息（仅对已连接的stdio服务器）
          let tools: Array<{ name: string; description?: string }> = [];
          if (status === 'Connected') {
            try {
              const testResult = await this.testStdioConnection(transportObj);
              tools = testResult.tools || [];
            } catch (error) {
              console.warn(`Failed to get tools for ${name.trim()}:`, error);
              // 如果获取tools失败，继续使用空数组
            }
          }

          mcpServers.push({
            id: `claude_${name.trim()}`,
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
                  [name.trim()]: {
                    command: command,
                    args: args,
                    description: `Detected from Claude CLI`,
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
      console.warn('Failed to get Claude Code MCP config:', error);
    }

    return [];
  }

  /**
   * 安装MCP服务器到Claude Code agent
   */
  async installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    try {
      for (const server of mcpServers) {
        if (server.transport.type === 'stdio') {
          // 使用Claude Code CLI添加MCP服务器
          // 格式: claude mcp add -s user <name> <command> -- [args...] [env_options]
          const envArgs = Object.entries(server.transport.env || {})
            .map(([key, value]) => `-e ${key}=${value}`)
            .join(' ');

          let command = `claude mcp add -s user "${server.name}" "${server.transport.command}"`;

          // 如果有参数或环境变量，使用 -- 分隔符
          if (server.transport.args?.length || Object.keys(server.transport.env || {}).length) {
            command += ' --';
            if (server.transport.args?.length) {
              // 对每个参数进行适当的引用，防止包含特殊字符的参数被误解析
              const quotedArgs = server.transport.args.map((arg: string) => `"${arg}"`).join(' ');
              command += ` ${quotedArgs}`;
            }
          }

          // 环境变量在 -- 之后添加
          if (envArgs) {
            command += ` ${envArgs}`;
          }

          try {
            await execAsync(command, { timeout: 5000 });
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Claude Code:`, error);
            // 继续处理其他服务器，不要因为一个失败就停止
          }
        } else {
          console.warn(`Skipping ${server.name}: Claude CLI only supports stdio transport type`);
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 从Claude Code agent删除MCP服务器
   */
  async removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    try {
      // 使用Claude CLI命令删除MCP服务器（尝试不同作用域）
      // 首先尝试user作用域（与安装时保持一致），然后尝试project作用域
      try {
        const removeCommand = `claude mcp remove -s user "${mcpServerName}"`;
        await execAsync(removeCommand, { timeout: 5000 });
        return { success: true };
      } catch (userError) {
        // user作用域失败，尝试project作用域
        try {
          const removeCommand = `claude mcp remove -s project "${mcpServerName}"`;
          await execAsync(removeCommand, { timeout: 5000 });
          return { success: true };
        } catch (projectError) {
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
