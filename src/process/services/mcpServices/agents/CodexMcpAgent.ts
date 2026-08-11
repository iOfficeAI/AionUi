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

/** Env options for exec calls — ensures CLI is found from Finder/launchd launches */
const getExecEnv = () => ({
  env: { ...getEnhancedEnv(), NODE_OPTIONS: '', TERM: 'dumb', NO_COLOR: '1' } as NodeJS.ProcessEnv,
});

interface CodexMcpListEntry {
  name: string;
  enabled?: boolean;
  transport?: {
    type?: string;
    command?: string;
    args?: string[] | null;
    env?: Record<string, string> | null;
    env_vars?: Array<{ name?: string; value?: string }> | null;
    url?: string;
  };
}

function normalizeCodexEnv(entry: CodexMcpListEntry['transport']): Record<string, string> {
  const envFromObject = entry?.env;
  if (envFromObject && typeof envFromObject === 'object' && !Array.isArray(envFromObject)) {
    return Object.fromEntries(
      Object.entries(envFromObject).filter(
        (pair): pair is [string, string] => typeof pair[0] === 'string' && typeof pair[1] === 'string'
      )
    );
  }

  const envVars = entry?.env_vars;
  if (Array.isArray(envVars)) {
    return Object.fromEntries(
      envVars
        .filter(
          (item): item is { name: string; value: string } =>
            typeof item?.name === 'string' && typeof item?.value === 'string'
        )
        .map((item) => [item.name, item.value])
    );
  }

  return {};
}

export function parseCodexMcpListOutput(result: string): IMcpServer[] {
  const parsed = JSON.parse(result) as CodexMcpListEntry[];
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((entry) => {
    if (!entry?.name || !entry.transport?.type) {
      return [];
    }

    const displayName =
      isBuiltinImageGenName(entry.name) || isBuiltinImageGenTransport(entry.transport)
        ? BUILTIN_IMAGE_GEN_NAME
        : entry.name;
    const env = normalizeCodexEnv(entry.transport);
    const transportType = entry.transport.type;
    let transport: IMcpServer['transport'] | null = null;

    if (transportType === 'stdio' && entry.transport.command) {
      transport = {
        type: 'stdio',
        command: entry.transport.command,
        args: entry.transport.args || [],
        env,
      };
    } else if ((transportType === 'http' || transportType === 'streamable_http') && entry.transport.url) {
      transport = {
        type: 'http',
        url: entry.transport.url,
      };
    } else if (transportType === 'sse' && entry.transport.url) {
      transport = {
        type: 'sse',
        url: entry.transport.url,
      };
    }

    if (!transport) {
      return [];
    }

    return [
      {
        id: `codex_${entry.name}`,
        name: displayName,
        transport,
        tools: [] as Array<{ name: string; description?: string }>,
        enabled: entry.enabled ?? true,
        status: 'connected' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        description: '',
        originalJson: JSON.stringify({ mcpServers: { [displayName]: transport } }, null, 2),
      },
    ];
  });
}

export function buildCodexAddArgs(server: IMcpServer): string[] | null {
  if (server.transport.type === 'stdio') {
    const args = ['mcp', 'add', server.name];

    for (const [key, value] of Object.entries(server.transport.env || {})) {
      args.push('--env', `${key}=${value}`);
    }

    args.push('--', server.transport.command, ...(server.transport.args || []));
    return args;
  }

  if (server.transport.type === 'http' || server.transport.type === 'streamable_http') {
    const url = 'url' in server.transport ? server.transport.url : '';
    return ['mcp', 'add', server.name, '--url', url];
  }

  return null;
}

/**
 * Codex CLI MCP代理实现
 *
 * 使用 Codex CLI 的 mcp 子命令管理 MCP 服务器配置
 * Codex CLI 支持 stdio 和 streamable HTTP (via --url) 传输类型
 */
export class CodexMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('codex');
  }

  getSupportedTransports(): string[] {
    // Codex CLI supports stdio and streamable HTTP (via --url flag)
    return ['stdio', 'http', 'streamable_http'];
  }

  /**
   * 检测 Codex CLI 的 MCP 配置
   */
  detectMcpServers(cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        const { stdout: result } = await this.execCli(cliPath, 'codex', ['mcp', 'list', '--json'], {
          timeout: this.timeout,
          ...getExecEnv(),
        });

        if (!result.trim()) {
          return [];
        }

        const mcpServers = parseCodexMcpListOutput(result);

        for (const server of mcpServers) {
          try {
            const testResult = await this.testMcpConnection(server.transport);
            server.tools = testResult.tools || [];
            server.status = testResult.success ? 'connected' : 'disconnected';
          } catch (error) {
            console.warn(`[CodexMcpAgent] Failed to get tools for ${server.name}:`, error);
            server.status = 'disconnected';
          }
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
  installMcpServers(mcpServers: IMcpServer[], cliPath?: string): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          const args = buildCodexAddArgs(server);
          if (!args) {
            console.warn(`Skipping ${server.name}: Codex CLI does not support ${server.transport.type} transport type`);
            continue;
          }

          if (
            (server.transport.type === 'http' || server.transport.type === 'streamable_http') &&
            'headers' in server.transport &&
            server.transport.headers
          ) {
            const authHeader = Object.entries(server.transport.headers).find(
              ([key]) => key.toLowerCase() === 'authorization'
            );
            if (authHeader) {
              console.warn(
                `[CodexMcpAgent] ${server.name}: Codex CLI uses --bearer-token-env-var for auth, manual header not supported`
              );
            }
          }

          try {
            await this.execCli(cliPath, 'codex', args, { timeout: 5000, ...getExecEnv() });
            console.log(`[CodexMcpAgent] Added MCP server: ${server.name}`);
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Codex:`, error);
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
  removeMcpServer(mcpServerName: string, cliPath?: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        const candidateNames = Array.from(
          new Set(
            isBuiltinImageGenName(mcpServerName)
              ? [mcpServerName, BUILTIN_IMAGE_GEN_NAME, ...BUILTIN_IMAGE_GEN_LEGACY_NAMES]
              : [mcpServerName]
          )
        );

        for (const candidateName of candidateNames) {
          try {
            const result = await this.execCli(cliPath, 'codex', ['mcp', 'remove', candidateName], {
              timeout: 5000,
              ...getExecEnv(),
            });

            // 检查输出确认删除成功
            if (result.stdout && (result.stdout.includes('removed') || result.stdout.includes('Removed'))) {
              console.log(`[CodexMcpAgent] Removed MCP server: ${candidateName}`);
              return { success: true };
            }

            if (result.stdout && (result.stdout.includes('not found') || result.stdout.includes('No such server'))) {
              continue;
            }

            // 其他情况认为成功（向后兼容）
            return { success: true };
          } catch (cmdError) {
            const errorText = [
              cmdError instanceof Error ? cmdError.message : String(cmdError),
              (cmdError as { stdout?: string }).stdout || '',
              (cmdError as { stderr?: string }).stderr || '',
            ].join('\n');

            if (
              errorText.includes('not found') ||
              errorText.includes('does not exist') ||
              errorText.includes('No MCP server named')
            ) {
              continue;
            }

            return { success: false, error: cmdError instanceof Error ? cmdError.message : String(cmdError) };
          }
        }

        console.log(`[CodexMcpAgent] MCP server '${mcpServerName}' not found, nothing to remove`);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
