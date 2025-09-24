/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
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
      // 方法1: 尝试使用Claude Code CLI命令获取MCP配置
      // 使用较短的超时时间，避免因MCP服务器健康检查而卡住
      try {
        const { stdout: result } = await execAsync('claude mcp list', { timeout: 5000 });

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
          // 查找格式如: "12306-mcp: npx -y 12306-mcp - ✓ Connected"
          // 更宽松的匹配模式
          const match = cleanLine.match(/^([^:]+):\s+(.+?)\s*-\s*[✓✗]\s*(Connected|Disconnected)/);
          if (match) {
            const [, name, commandStr, status] = match;
            const commandParts = commandStr.trim().split(/\s+/);
            const command = commandParts[0];
            const args = commandParts.slice(1);

            mcpServers.push({
              id: `claude_${name.trim()}`,
              name: name.trim(),
              transport: {
                type: 'stdio',
                command: command,
                args: args,
                env: {},
              },
              tools: [],
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

        if (mcpServers.length > 0) {
          return mcpServers;
        }
      } catch (cliError) {
        // 如果CLI命令超时或失败，记录详细错误信息
        if (cliError instanceof Error) {
          if (cliError.message.includes('timeout') || (cliError as any).code === 143) {
            console.warn('Claude Code CLI command timed out (likely due to MCP server health check hanging)');
          } else {
            console.warn('Claude Code CLI not available or failed:', cliError.message);
          }
        } else {
          console.warn('Claude Code CLI not available or failed:', cliError);
        }
      }

      // 方法2: 回退到读取Claude Desktop配置文件
      const home = homedir();
      const configPaths = [
        join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), // macOS
        join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'), // Windows
        join(home, '.config', 'claude', 'claude_desktop_config.json'), // Linux
      ];

      for (const configPath of configPaths) {
        if (existsSync(configPath)) {
          const configContent = readFileSync(configPath, 'utf-8');
          const config = JSON.parse(configContent);

          if (config.mcpServers) {
            return this.parseMcpServersConfig(config.mcpServers, 'claude');
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get Claude MCP config:', error);
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
      // 使用Claude CLI命令删除MCP服务器
      const removeCommand = `claude mcp remove -s user "${mcpServerName}"`;

      try {
        await execAsync(removeCommand, { timeout: 5000 });
        return { success: true };
      } catch (cliError) {
        // CLI命令失败，尝试直接操作配置文件作为后备方案
        const home = homedir();
        const configPaths = [
          join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), // macOS
          join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'), // Windows
          join(home, '.config', 'claude', 'claude_desktop_config.json'), // Linux
        ];

        for (const configPath of configPaths) {
          if (existsSync(configPath)) {
            try {
              const config = JSON.parse(readFileSync(configPath, 'utf-8'));
              if (config.mcpServers && config.mcpServers[mcpServerName]) {
                delete config.mcpServers[mcpServerName];
                writeFileSync(configPath, JSON.stringify(config, null, 2));
              }
              return { success: true };
            } catch (fileError) {
              console.warn(`Failed to update config file ${configPath}:`, fileError);
            }
          }
        }

        return { success: true }; // 如果配置文件都不存在，认为已经删除
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
