/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';
import type { IMcpServer } from '@/common/config/storage';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import { safeExec } from '@process/utils/safeExec';

/** Env options for exec calls — ensures CLI is found from Finder/launchd launches */
const getExecEnv = () => ({
  env: { ...getEnhancedEnv(), NODE_OPTIONS: '', TERM: 'dumb', NO_COLOR: '1' } as NodeJS.ProcessEnv,
});

/**
 * iFlow CLI MCP代理实现
 * iFlow CLI 支持 stdio、SSE、HTTP 传输类型，支持 headers
 */
export class IflowMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('iflow');
  }

  getSupportedTransports(): string[] {
    // iFlow CLI 支持 stdio, sse, http 传输类型 (streamable_http maps to http)
    return ['stdio', 'sse', 'http', 'streamable_http'];
  }

  /**
   * 检测iFlow CLI的MCP配置（内部实现，不使用锁）
   */
  private async detectMcpServersInternal(_cliPath?: string): Promise<IMcpServer[]> {
    try {
      // 使用iFlow CLI list命令获取MCP配置
      const { stdout: result } = await safeExec('iflow mcp list', { timeout: this.timeout, ...getExecEnv() });

      // 如果没有配置任何MCP服务器，返回空数组
      if (result.trim() === 'No MCP servers configured.' || !result.trim()) {
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
        // 查找格式如: "✓ Bazi: npx bazi-mcp (stdio) - Connected" 或 "✓ Bazi: npx bazi-mcp (stdio) - 已连接"
        const match = cleanLine.match(
          /[✓✗]\s+([^:]+):\s+(.+?)\s+\(([^)]+)\)\s*-\s*(Connected|Disconnected|已连接|已断开)/
        );
        if (match) {
          const [, name, commandStr, transport, statusRaw] = match;
          const commandParts = commandStr.trim().split(/\s+/);
          const command = commandParts[0];
          const args = commandParts.slice(1);

          // 将中文状态映射为英文
          const status = statusRaw === '已连接' ? 'Connected' : statusRaw === '已断开' ? 'Disconnected' : statusRaw;

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
              console.warn(`[IflowMcpAgent] Failed to get tools for ${name.trim()}:`, error);
              // 如果获取tools失败，继续使用空数组
            }
          }

          mcpServers.push({
            id: `iflow_${name.trim()}`,
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

      console.log(`[IflowMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);
      return mcpServers;
    } catch (error) {
      console.warn('[IflowMcpAgent] Failed to get iFlow CLI MCP config:', error);
      return [];
    }
  }

  /**
   * 检测iFlow CLI的MCP配置（公共接口，使用锁）
   */
  detectMcpServers(cliPath?: string): Promise<IMcpServer[]> {
    return this.withLock(() => this.detectMcpServersInternal(cliPath));
  }

  /**
   * 安装MCP服务器到iFlow agent
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        // 获取当前已配置的iFlow MCP服务器列表（使用内部方法避免死锁）
        const existingServers = await this.detectMcpServersInternal();
        const existingServerNames = new Set(existingServers.map((s) => s.name));

        // 为每个启用的MCP服务器添加到iFlow配置中
        for (const server of mcpServers.filter((s) => s.enabled)) {
          // 跳过已经存在的服务器
          if (existingServerNames.has(server.name)) {
            continue;
          }

          try {
            let addCommand = `iflow mcp add "${server.name}"`;

            // 根据传输类型构建命令
            if (server.transport.type === 'stdio' && 'command' in server.transport) {
              addCommand += ` "${server.transport.command}"`;
              if (server.transport.args && server.transport.args.length > 0) {
                addCommand += ` ${server.transport.args.map((arg: string) => `"${arg}"`).join(' ')}`;
              }
              addCommand += ' --transport stdio';

              // 添加环境变量 (仅stdio支持)
              if (server.transport.env) {
                for (const [key, value] of Object.entries(server.transport.env)) {
                  // Quote env values to protect special characters
                  addCommand += ` --env "${key}=${value}"`;
                }
              }
            } else if (
              (server.transport.type === 'sse' ||
                server.transport.type === 'http' ||
                server.transport.type === 'streamable_http') &&
              'url' in server.transport
            ) {
              // iFlow CLI 使用 --transport http 处理 HTTP 和 Streamable HTTP
              const transportFlag = server.transport.type === 'streamable_http' ? 'http' : server.transport.type;
              addCommand += ` "${server.transport.url}"`;
              addCommand += ` --transport ${transportFlag}`;

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
            await safeExec(addCommand, { timeout: 10000, ...getExecEnv() });
          } catch (error) {
            console.warn(`Failed to add MCP server ${server.name} to iFlow:`, error);
            // 继续处理其他服务器，不要因为一个失败就停止整个过程
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
   * 从iFlow agent删除MCP服务器
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        // 使用iFlow CLI remove命令删除MCP服务器（尝试不同作用域）
        // 首先尝试user作用域（与安装时保持一致），然后尝试project作用域
        try {
          const removeCommand = `iflow mcp remove "${mcpServerName}" -s user`;
          await safeExec(removeCommand, { timeout: 5000, ...getExecEnv() });
          return { success: true };
        } catch (userError) {
          // user作用域失败，尝试project作用域
          try {
            const removeCommand = `iflow mcp remove "${mcpServerName}" -s project`;
            const { stdout } = await safeExec(removeCommand, { timeout: 5000, ...getExecEnv() });

            // 检查输出是否包含"not found"，如果是则继续尝试user作用域
            if (stdout && stdout.includes('not found')) {
              throw new Error('Server not found in project settings', { cause: userError });
            }

            return { success: true };
          } catch (projectError) {
            // 如果服务器不存在，也认为是成功的
            if (
              userError instanceof Error &&
              (userError.message.includes('not found') || userError.message.includes('does not exist'))
            ) {
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
