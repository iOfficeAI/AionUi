/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { IMcpServer } from '@/common/config/storage';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import { safeExec } from '@process/utils/safeExec';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';

const getExecEnv = () => ({
  env: { ...getEnhancedEnv(), NODE_OPTIONS: '', TERM: 'dumb', NO_COLOR: '1' } as NodeJS.ProcessEnv,
});

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  return value;
}

function getQwenConfigPaths(): string[] {
  return [join(homedir(), '.qwen', 'settings.json'), join(homedir(), '.qwen', 'client_config.json')];
}

export function buildQwenAddArgs(server: IMcpServer): string[] | null {
  const args = ['mcp', 'add', '-s', 'user'];

  if (server.description) {
    args.push('--description', server.description);
  }

  if (server.transport.type === 'stdio') {
    args.push('--transport', 'stdio');

    for (const [key, value] of Object.entries(server.transport.env || {})) {
      args.push(`--env=${key}=${value}`);
    }

    args.push(server.name, server.transport.command, ...(server.transport.args || []));
    return args;
  }

  if (
    server.transport.type === 'sse' ||
    server.transport.type === 'http' ||
    server.transport.type === 'streamable_http'
  ) {
    const transportFlag = server.transport.type === 'streamable_http' ? 'http' : server.transport.type;
    args.push('--transport', transportFlag);

    for (const [key, value] of Object.entries(server.transport.headers || {})) {
      args.push('-H', `${key}: ${value}`);
    }

    args.push(server.name, server.transport.url);
    return args;
  }

  return null;
}

function removeServerFromQwenConfigFiles(candidateNames: string[]): void {
  for (const configPath of getQwenConfigPaths()) {
    if (!existsSync(configPath)) {
      continue;
    }

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
        mcpServers?: Record<string, unknown>;
      };

      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        continue;
      }

      let changed = false;
      for (const candidateName of candidateNames) {
        if (candidateName in config.mcpServers) {
          delete config.mcpServers[candidateName];
          changed = true;
        }
      }

      if (changed) {
        writeFileSync(configPath, JSON.stringify(config, null, 2));
      }
    } catch (error) {
      console.warn(`[QwenMcpAgent] Failed to update config file ${configPath}:`, error);
    }
  }
}

export class QwenMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('qwen');
  }

  getSupportedTransports(): string[] {
    return ['stdio', 'sse', 'http'];
  }

  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        const { stdout: result } = await safeExec('qwen mcp list', { timeout: this.timeout, ...getExecEnv() });

        if (result.trim() === 'No MCP servers configured.' || !result.trim()) {
          console.log('[QwenMcpAgent] No MCP servers configured');
          return [];
        }

        const mcpServers: IMcpServer[] = [];
        const lines = result.split('\n');

        for (const line of lines) {
          // eslint-disable-next-line no-control-regex
          const cleanLine = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
          const match = cleanLine.match(/[✓✗]\s+([^:]+):\s+(.+?)\s+\(([^)]+)\)\s*-\s*(Connected|Disconnected)/);
          if (!match) {
            continue;
          }

          const [, name, commandStr, transport, status] = match;
          const normalizedName = stripWrappingQuotes(name.trim());
          const commandParts = commandStr.trim().split(/\s+/);
          const command = stripWrappingQuotes(commandParts[0]);
          const args = commandParts.slice(1).map(stripWrappingQuotes);
          const transportType = transport as 'stdio' | 'sse' | 'http';

          const transportObj: IMcpServer['transport'] =
            transportType === 'stdio'
              ? {
                  type: 'stdio',
                  command,
                  args,
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

          let tools: Array<{ name: string; description?: string }> = [];
          if (status === 'Connected') {
            try {
              const testResult = await this.testMcpConnection(transportObj);
              tools = testResult.tools || [];
            } catch (error) {
              console.warn(`[QwenMcpAgent] Failed to get tools for ${normalizedName}:`, error);
            }
          }

          mcpServers.push({
            id: `qwen_${normalizedName}`,
            name: normalizedName,
            transport: transportObj,
            tools,
            enabled: true,
            status: status === 'Connected' ? 'connected' : 'disconnected',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            description: '',
            originalJson: JSON.stringify(
              {
                mcpServers: {
                  [normalizedName]:
                    transportType === 'stdio'
                      ? {
                          command,
                          args,
                          description: 'Detected from Qwen CLI',
                        }
                      : {
                          url: commandStr.trim(),
                          type: transportType,
                          description: 'Detected from Qwen CLI',
                        },
                },
              },
              null,
              2
            ),
          });
        }

        console.log(`[QwenMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);
        return mcpServers;
      } catch (error) {
        console.warn('[QwenMcpAgent] Failed to get Qwen Code MCP config:', error);
        return [];
      }
    };

    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  installMcpServers(mcpServers: IMcpServer[], cliPath?: string): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          const args = buildQwenAddArgs(server);
          if (!args) {
            continue;
          }

          try {
            await this.execCli(cliPath, 'qwen', args, { timeout: 5000, ...getExecEnv() });
            console.log(`[QwenMcpAgent] Added MCP server: ${server.name}`);
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to Qwen Code:`, error);
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

  removeMcpServer(mcpServerName: string, _cliPath?: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        const candidateNames = Array.from(new Set([mcpServerName, JSON.stringify(mcpServerName)]));
        const scopes = ['user', 'project'] as const;

        for (const scope of scopes) {
          for (const candidateName of candidateNames) {
            try {
              const result = await this.execCli(undefined, 'qwen', ['mcp', 'remove', '-s', scope, candidateName], {
                timeout: 5000,
                ...getExecEnv(),
              });

              if (result.stdout.includes('removed from')) {
                return { success: true };
              }

              if (!result.stdout.includes('not found')) {
                return { success: true };
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              if (errorMessage.includes('not found')) {
                continue;
              }
            }
          }
        }

        removeServerFromQwenConfigFiles(candidateNames);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
