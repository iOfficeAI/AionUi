/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';
import type { IMcpServer } from '@/common/storage';

const execAsync = promisify(exec);

/**
 * Codex CLI MCP代理实现
 *
 * 使用 Codex CLI 的 mcp 子命令管理 MCP 服务器配置
 * 注意：Codex CLI 目前只支持 stdio 传输类型
 */
export class CodexMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('codex');
  }

  getSupportedTransports(): string[] {
    // Codex CLI 目前只支持 stdio 传输类型
    return ['stdio'];
  }

  /**
   * 检测 Codex CLI 的 MCP 配置
   */
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        // 使用 Codex CLI 命令获取 MCP 配置
        const { stdout: result } = await execAsync('codex mcp list', { timeout: this.timeout });

        // 如果没有配置任何MCP服务器，返回空数组
        if (result.includes('No MCP servers configured') || !result.trim()) {
          return [];
        }

        // 解析表格格式输出
        // 格式示例:
        // Name  Command  Args      Env
        // Bazi  npx      bazi-mcp  -
        const mcpServers: IMcpServer[] = [];
        const lines = result.split('\n');

        // 跳过表头行（第一行）
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          // 清除 ANSI 颜色代码
          // eslint-disable-next-line no-control-regex
          const cleanLine = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();

          if (!cleanLine) continue;

          // 使用正则表达式解析表格列（以多个空格分隔）
          const parts = cleanLine.split(/\s{2,}/);
          if (parts.length < 2) continue;

          const name = parts[0].trim();
          const command = parts[1].trim();
          const argsStr = parts[2]?.trim() || '';
          const envStr = parts[3]?.trim() || '';

          // 解析 args（如果是 "-" 则表示没有参数）
          const args = argsStr === '-' ? [] : argsStr.split(/\s+/);

          // 解析 env（如果是 "-" 则表示没有环境变量）
          const env: Record<string, string> = {};
          if (envStr && envStr !== '-') {
            // 环境变量格式可能是 KEY=VALUE 形式
            const envPairs = envStr.split(/\s+/);
            for (const pair of envPairs) {
              const [key, value] = pair.split('=');
              if (key && value) {
                env[key] = value;
              }
            }
          }

          // 尝试获取tools信息（对所有服务器类型）
          let tools: Array<{ name: string; description?: string }> = [];
          try {
            const testResult = await this.testMcpConnection({
              type: 'stdio',
              command: command,
              args: args,
              env: env,
            });
            tools = testResult.tools || [];
          } catch (error) {
            console.warn(`[CodexMcpAgent] Failed to get tools for ${name}:`, error);
          }

          mcpServers.push({
            id: `codex_${name}`,
            name: name,
            transport: {
              type: 'stdio',
              command: command,
              args: args,
              env: env,
            },
            tools: tools,
            enabled: true,
            status: tools.length > 0 ? 'connected' : 'disconnected',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            description: '',
            originalJson: JSON.stringify(
              {
                mcpServers: {
                  [name]: {
                    command: command,
                    args: args,
                    description: `Detected from Codex CLI`,
                  },
                },
              },
              null,
              2
            ),
          });
        }

        console.log(`[CodexMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);
        return mcpServers;
      } catch (error) {
        console.warn('[CodexMcpAgent] Failed to get Codex MCP config:', error);
        return [];
      }
    };

    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  /**
   * 安装 MCP 服务器到 Codex CLI
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          if (server.transport.type === 'stdio') {
            // 使用 Codex CLI 添加 MCP 服务器
            // 格式: codex mcp add <NAME> <COMMAND> [ARGS]... [--env KEY=VALUE]
            const args = server.transport.args || [];
            const envArgs = Object.entries(server.transport.env || {}).map(([key, value]) => `--env ${key}=${value}`);

            // 构建命令数组
            const commandParts = ['codex', 'mcp', 'add', server.name, server.transport.command, ...args, ...envArgs];

            // 将命令数组转换为 shell 命令字符串
            const command = commandParts.map((part) => `"${part}"`).join(' ');

            try {
              await execAsync(command, { timeout: 5000 });
              console.log(`[CodexMcpAgent] Added MCP server: ${server.name}`);
            } catch (error) {
              console.warn(`Failed to add MCP ${server.name} to Codex:`, error);
              // 继续处理其他服务器，不要因为一个失败就停止
            }
          } else {
            console.warn(`Skipping ${server.name}: Codex CLI only supports stdio transport type`);
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
   * 从 Codex CLI 删除 MCP 服务器
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        // 使用 Codex CLI 命令删除 MCP 服务器
        const removeCommand = `codex mcp remove "${mcpServerName}"`;

        try {
          const result = await execAsync(removeCommand, { timeout: 5000 });

          // 检查输出确认删除成功
          if (result.stdout && (result.stdout.includes('removed') || result.stdout.includes('Removed'))) {
            console.log(`[CodexMcpAgent] Removed MCP server: ${mcpServerName}`);
            return { success: true };
          } else if (result.stdout && (result.stdout.includes('not found') || result.stdout.includes('No such server'))) {
            // 服务器不存在，也认为成功
            console.log(`[CodexMcpAgent] MCP server '${mcpServerName}' not found, nothing to remove`);
            return { success: true };
          } else {
            // 其他情况认为成功（向后兼容）
            return { success: true };
          }
        } catch (cmdError) {
          // 如果命令执行失败，检查是否是因为服务器不存在
          if (cmdError instanceof Error && (cmdError.message.includes('not found') || cmdError.message.includes('does not exist'))) {
            return { success: true };
          }
          return { success: false, error: cmdError instanceof Error ? cmdError.message : String(cmdError) };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
