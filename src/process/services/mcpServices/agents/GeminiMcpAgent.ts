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
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (attempt === 1) {
            console.log('[GeminiMcpAgent] Starting MCP detection...');
          } else {
            console.log(`[GeminiMcpAgent] Retrying detection (attempt ${attempt}/${maxRetries})...`);
            // 如果不是第一次尝试，添加短暂延迟避免与其他操作冲突
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          // 使用 Gemini CLI 命令获取 MCP 配置
          const { stdout: result } = await execAsync('gemini mcp list', { timeout: this.timeout });

          // 如果没有配置任何MCP服务器，返回空数组
          if (result.includes('No MCP servers configured') || !result.trim()) {
            console.log('[GeminiMcpAgent] No MCP servers configured');
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

              // 尝试获取tools信息（对所有已连接的服务器）
              let tools: Array<{ name: string; description?: string }> = [];
              if (status === 'Connected') {
                try {
                  const testResult = await this.testMcpConnection(transportObj);
                  tools = testResult.tools || [];
                } catch (error) {
                  console.warn(`[GeminiMcpAgent] Failed to get tools for ${name.trim()}:`, error);
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

          console.log(`[GeminiMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);

          // 验证结果：如果输出包含"Configured MCP servers:"但没检测到任何服务器，可能被截断
          const hasConfigHeader = result.includes('Configured MCP servers:');
          const hasServerLines = lines.some((line) => line.match(/[✓✗]\s+[^:]+:/));

          if (hasConfigHeader && hasServerLines && mcpServers.length === 0) {
            throw new Error('Output appears truncated: found server markers but parsed 0 servers');
          }

          // 成功，返回结果
          return mcpServers;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`[GeminiMcpAgent] Detection attempt ${attempt} failed:`, lastError.message);

          // 如果还有重试机会，继续下一次尝试
          if (attempt < maxRetries) {
            continue;
          }
        }
      }

      // 所有重试都失败了
      console.warn('[GeminiMcpAgent] All detection attempts failed. Last error:', lastError);
      return [];
    };

    // 使用命名函数以便在日志中显示
    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  /**
   * 安装 MCP 服务器到 Google Gemini CLI
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
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
    };

    Object.defineProperty(installOperation, 'name', { value: 'installMcpServers' });
    return this.withLock(installOperation);
  }

  /**
   * 从 Google Gemini CLI 删除 MCP 服务器
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
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
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
