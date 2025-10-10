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
 * Qwen Code MCP代理实现
 * 注意：Qwen CLI 目前只支持 stdio 传输类型，不支持 SSE/HTTP/streamable_http
 */
export class QwenMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('qwen');
  }

  getSupportedTransports(): string[] {
    return ['stdio'];
  }

  /**
   * 检测Qwen Code的MCP配置
   */
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        // 尝试通过Qwen CLI命令获取MCP配置
        const { stdout: result } = await execAsync('qwen mcp list', { timeout: this.timeout });

        // 如果没有配置任何MCP服务器，返回空数组
        if (result.trim() === 'No MCP servers configured.' || !result.trim()) {
          console.log('[QwenMcpAgent] No MCP servers configured');
          return [];
        }

        // 解析文本输出
        const mcpServers: IMcpServer[] = [];
        const lines = result.split('\n');

        for (const line of lines) {
          // 清除 ANSI 颜色代码
          // eslint-disable-next-line no-control-regex
          const cleanLine = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
          // 查找格式如: "✓ filesystem: npx @modelcontextprotocol/server-filesystem /path (stdio) - Connected"
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

            // 尝试获取tools信息（对所有已连接的服务器）
            let tools: Array<{ name: string; description?: string }> = [];
            if (status === 'Connected') {
              try {
                const testResult = await this.testMcpConnection(transportObj);
                tools = testResult.tools || [];
              } catch (error) {
                console.warn(`[QwenMcpAgent] Failed to get tools for ${name.trim()}:`, error);
                // 如果获取tools失败，继续使用空数组
              }
            }

            mcpServers.push({
              id: `qwen_${name.trim()}`,
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
                            description: `Detected from Qwen CLI`,
                          }
                        : {
                            url: commandStr.trim(),
                            type: transportType,
                            description: `Detected from Qwen CLI`,
                          },
                  },
                },
                null,
                2
              ),
            });
          }
        }

        console.log(`[QwenMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);
        return mcpServers;
      } catch (error) {
        console.warn('[QwenMcpAgent] Failed to get Qwen Code MCP config:', error);
        return [];
      }
    };

    // 使用命名函数以便在日志中显示
    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  /**
   * 安装MCP服务器到Qwen Code agent
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          if (server.transport.type === 'stdio') {
            // 使用Qwen CLI添加MCP服务器
            // 格式: qwen mcp add <name> <command> [args...]
            const args = server.transport.args?.join(' ') || '';
            const envArgs = Object.entries(server.transport.env || {})
              .map(([key, value]) => `--env ${key}=${value}`)
              .join(' ');

            let command = `qwen mcp add "${server.name}" "${server.transport.command}"`;
            if (args) {
              command += ` ${args}`;
            }
            if (envArgs) {
              command += ` ${envArgs}`;
            }

            // 添加作用域参数，优先使用user作用域
            command += ' -s user';

            try {
              await execAsync(command, { timeout: 5000 });
            } catch (error) {
              console.warn(`Failed to add MCP ${server.name} to Qwen Code:`, error);
            }
          } else {
            console.warn(`Skipping ${server.name}: Qwen CLI only supports stdio transport type`);
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
   * 从Qwen Code agent删除MCP服务器
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        // 使用Qwen CLI命令删除MCP服务器（尝试不同作用域）
        // 首先尝试user作用域（与安装时保持一致），然后尝试project作用域
        try {
          const removeCommand = `qwen mcp remove "${mcpServerName}" -s user`;
          const result = await execAsync(removeCommand, { timeout: 5000 });

          // 检查输出是否表示真正的成功删除
          if (result.stdout && result.stdout.includes('removed from user settings')) {
            return { success: true };
          } else if (result.stdout && result.stdout.includes('not found in user')) {
            // 服务器不在user作用域中，尝试project作用域
            throw new Error('Server not found in user settings');
          } else {
            // 其他情况认为成功（向后兼容）
            return { success: true };
          }
        } catch (userError) {
          // user作用域失败，尝试project作用域
          try {
            const removeCommand = `qwen mcp remove "${mcpServerName}" -s project`;
            const result = await execAsync(removeCommand, { timeout: 5000 });

            // 检查输出是否表示真正的成功删除
            if (result.stdout && result.stdout.includes('removed from project settings')) {
              return { success: true };
            } else if (result.stdout && result.stdout.includes('not found in project')) {
              // 服务器不在project作用域中，尝试配置文件
              throw new Error('Server not found in project settings');
            } else {
              // 其他情况认为成功（向后兼容）
              return { success: true };
            }
          } catch (projectError) {
            // CLI命令都失败，尝试直接操作配置文件作为后备
            const configPath = join(homedir(), '.qwen', 'client_config.json');

            if (!existsSync(configPath)) {
              return { success: true }; // 配置文件不存在，认为已经删除
            }

            try {
              const config = JSON.parse(readFileSync(configPath, 'utf-8'));
              if (config.mcpServers && config.mcpServers[mcpServerName]) {
                delete config.mcpServers[mcpServerName];
                writeFileSync(configPath, JSON.stringify(config, null, 2));
              }
              return { success: true };
            } catch (fileError) {
              console.warn(`Failed to update config file ${configPath}:`, fileError);
              return { success: true }; // 如果配置文件操作失败，也认为成功
            }
          }
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
