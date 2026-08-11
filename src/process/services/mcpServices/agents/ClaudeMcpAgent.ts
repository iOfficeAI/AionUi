/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';
import type { IMcpServer } from '@/common/config/storage';
import {
  BUILTIN_IMAGE_GEN_LEGACY_NAMES,
  BUILTIN_IMAGE_GEN_NAME,
  isBuiltinImageGenName,
  isBuiltinImageGenTransport,
} from '@process/resources/builtinMcp/constants';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import { safeExec } from '@process/utils/safeExec';

/** Env options for exec calls — ensures CLI is found from Finder/launchd launches */
const getExecEnv = () => ({
  env: { ...getEnhancedEnv(), NODE_OPTIONS: '', TERM: 'dumb', NO_COLOR: '1' } as NodeJS.ProcessEnv,
});

export function buildClaudeStdioAddArgs(server: IMcpServer): string[] {
  if (server.transport.type !== 'stdio') {
    throw new Error('Claude stdio args require a stdio transport');
  }

  const args = ['mcp', 'add', '-s', 'user'];

  for (const [key, value] of Object.entries(server.transport.env || {})) {
    args.push(`--env=${key}=${value}`);
  }

  args.push(server.name, '--', server.transport.command, ...(server.transport.args || []));
  return args;
}

/**
 * Claude Code MCP代理实现
 * Claude CLI 支持 stdio, sse, http 传输类型
 */
export class ClaudeMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('claude');
  }

  getSupportedTransports(): string[] {
    // Claude CLI 支持 stdio, sse, http 传输类型 (streamable_http maps to http)
    return ['stdio', 'sse', 'http', 'streamable_http'];
  }

  /**
   * 检测Claude Code的MCP配置
   */
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        // 使用Claude Code CLI命令获取MCP配置
        const { stdout: result } = await safeExec('claude mcp list', {
          timeout: this.timeout,
          ...getExecEnv(),
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
            const displayName =
              isBuiltinImageGenName(name.trim()) || isBuiltinImageGenTransport({ command, args })
                ? BUILTIN_IMAGE_GEN_NAME
                : name.trim();

            // 解析状态：Connected, Disconnected, Failed to connect, 等
            const isConnected =
              statusText.toLowerCase().includes('connected') && !statusText.toLowerCase().includes('disconnect');
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
              name: displayName,
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
                    [displayName]: {
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
  installMcpServers(mcpServers: IMcpServer[], cliPath?: string): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          if (server.transport.type === 'stdio') {
            try {
              await this.execCli(cliPath, 'claude', buildClaudeStdioAddArgs(server), {
                timeout: 5000,
                ...getExecEnv(),
              });
              console.log(`[ClaudeMcpAgent] Added MCP server: ${server.name}`);
            } catch (error) {
              console.warn(`Failed to add MCP ${server.name} to Claude Code:`, error);
              // 继续处理其他服务器，不要因为一个失败就停止
            }
          } else if (
            server.transport.type === 'sse' ||
            server.transport.type === 'http' ||
            server.transport.type === 'streamable_http'
          ) {
            // 处理 SSE/HTTP/Streamable HTTP 传输类型
            // Claude CLI 使用 --transport http 处理 HTTP 和 Streamable HTTP
            // 格式: claude mcp add -s user --transport <type> <name> <url> [--header ...]
            const transportFlag = server.transport.type === 'streamable_http' ? 'http' : server.transport.type;
            const args = ['mcp', 'add', '-s', 'user', '--transport', transportFlag, server.name, server.transport.url];

            // 添加 headers
            if (server.transport.headers) {
              for (const [key, value] of Object.entries(server.transport.headers)) {
                args.push('--header', `${key}: ${value}`);
              }
            }

            try {
              await this.execCli(cliPath, 'claude', args, {
                timeout: 5000,
                ...getExecEnv(),
              });
              console.log(`[ClaudeMcpAgent] Added MCP server: ${server.name}`);
            } catch (error) {
              console.warn(`Failed to add MCP ${server.name} to Claude Code:`, error);
            }
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
  removeMcpServer(mcpServerName: string, _cliPath?: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        // 使用Claude CLI命令删除MCP服务器（尝试不同作用域）
        // 按顺序尝试: user (AionUi默认) -> local -> project
        // user scope优先，因为AionUi安装时使用user scope
        const scopes = ['user', 'local', 'project'] as const;
        const candidateNames = Array.from(
          new Set(
            isBuiltinImageGenName(mcpServerName)
              ? [mcpServerName, BUILTIN_IMAGE_GEN_NAME, ...BUILTIN_IMAGE_GEN_LEGACY_NAMES]
              : [mcpServerName]
          )
        );

        for (const scope of scopes) {
          for (const candidateName of candidateNames) {
            try {
              const removeCommand = `claude mcp remove -s ${scope} "${candidateName}"`;
              const result = await safeExec(removeCommand, {
                timeout: 5000,
                ...getExecEnv(),
              });

              if (result.stdout && result.stdout.includes('removed')) {
                console.log(`[ClaudeMcpAgent] Removed MCP server from ${scope} scope: ${candidateName}`);
                return { success: true };
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);

              if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
                continue;
              }

              console.warn(`[ClaudeMcpAgent] Failed to remove from ${scope} scope:`, errorMessage);
            }
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
