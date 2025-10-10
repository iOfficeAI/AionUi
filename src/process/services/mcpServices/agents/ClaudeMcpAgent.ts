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
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        // 使用Claude Code CLI命令获取MCP配置
        const { stdout: result } = await execAsync('claude mcp list', {
          timeout: this.timeout,
          env: { ...process.env, NODE_OPTIONS: '' }, // 清除调试选项，避免调试器附加
        });

        // 如果没有配置任何MCP服务器，返回空数组
        if (result.includes('No MCP servers configured') || !result.trim()) {
          return [];
        }

        // 解析文本输出
        const mcpServers: IMcpServer[] = [];
        const lines = result.split('\n');

        for (const line of lines) {
          // 清除 ANSI 颜色代码 (支持多种格式)
          /* eslint-disable no-control-regex */
          const cleanLine = line
            .replace(/\u001b\[[0-9;]*m/g, '')
            .replace(/\[[0-9;]*m/g, '')
            .trim();
          /* eslint-enable no-control-regex */

          // 查找格式如: "12306-mcp: npx -y 12306-mcp - ✓ Connected" 或 "12306-mcp: npx -y 12306-mcp - ✗ Failed to connect"
          // 支持多种状态文本
          const match = cleanLine.match(/^([^:]+):\s+(.+?)\s*-\s*[✓✗]\s*(.+)$/);
          if (match) {
            const [, name, commandStr, statusText] = match;
            const commandParts = commandStr.trim().split(/\s+/);
            const command = commandParts[0];
            const args = commandParts.slice(1);

            // 解析状态：Connected, Disconnected, Failed to connect, 等
            const isConnected = statusText.toLowerCase().includes('connected') && !statusText.toLowerCase().includes('disconnect');
            const status = isConnected ? 'connected' : 'disconnected';

            // 构建transport对象
            const transportObj = {
              type: 'stdio' as const,
              command: command,
              args: args,
              env: {},
            };

            // 尝试获取tools信息（对所有已连接的服务器）
            let tools: Array<{ name: string; description?: string }> = [];
            if (isConnected) {
              try {
                const testResult = await this.testMcpConnection(transportObj);
                tools = testResult.tools || [];
              } catch (error) {
                console.warn(`[ClaudeMcpAgent] Failed to get tools for ${name.trim()}:`, error);
                // 如果获取tools失败，继续使用空数组
              }
            }

            mcpServers.push({
              id: `claude_${name.trim()}`,
              name: name.trim(),
              transport: transportObj,
              tools: tools,
              enabled: true,
              status: status,
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

        console.log(`[ClaudeMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);
        return mcpServers;
      } catch (error) {
        console.warn('[ClaudeMcpAgent] Failed to detect MCP servers:', error);
        return [];
      }
    };

    // 使用命名函数以便在日志中显示
    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  /**
   * 安装MCP服务器到Claude Code agent
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          if (server.transport.type === 'stdio') {
            // 使用Claude Code CLI添加MCP服务器到user scope（全局配置）
            // AionUi是全局工具，MCP配置应该对所有项目可用
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
              await execAsync(command, {
                timeout: 5000,
                env: { ...process.env, NODE_OPTIONS: '' }, // 清除调试选项，避免调试器附加
              });
              console.log(`[ClaudeMcpAgent] Added MCP server: ${server.name}`);
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
    };

    Object.defineProperty(installOperation, 'name', { value: 'installMcpServers' });
    return this.withLock(installOperation);
  }

  /**
   * 从Claude Code agent删除MCP服务器
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        // 使用Claude CLI命令删除MCP服务器（尝试不同作用域）
        // 按顺序尝试: user (AionUi默认) -> local -> project
        // user scope优先，因为AionUi安装时使用user scope
        const scopes = ['user', 'local', 'project'] as const;

        for (const scope of scopes) {
          try {
            const removeCommand = `claude mcp remove -s ${scope} "${mcpServerName}"`;
            const result = await execAsync(removeCommand, {
              timeout: 5000,
              env: { ...process.env, NODE_OPTIONS: '' }, // 清除调试选项，避免调试器附加
            });

            // 检查是否成功删除
            if (result.stdout && result.stdout.includes('removed')) {
              console.log(`[ClaudeMcpAgent] Removed MCP server from ${scope} scope: ${mcpServerName}`);
              return { success: true };
            }

            // 如果没有"removed"消息但也没有错误，可能服务器不存在于该作用域
            // 继续尝试下一个作用域
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // 如果是"未找到"错误，继续尝试下一个作用域
            if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
              continue;
            }

            // 其他错误，记录但继续尝试
            console.warn(`[ClaudeMcpAgent] Failed to remove from ${scope} scope:`, errorMessage);
          }
        }

        // 如果所有作用域都尝试完了，认为删除成功（服务器可能本来就不存在）
        console.log(`[ClaudeMcpAgent] MCP server ${mcpServerName} not found in any scope (may already be removed)`);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
