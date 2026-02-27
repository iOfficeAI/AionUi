/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { IMcpServer } from '../../../../common/storage';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';
import { safeExecFile } from '@process/utils/safeExec';

/**
 * CodeBuddy MCP server entry in ~/.codebuddy/mcp.json
 */
type CodebuddyMcpEntry = {
  // stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string; // "stdio"

  // streamable-http / sse transport
  url?: string;
  transportType?: string; // "streamable-http" | "sse"
  headers?: Record<string, string>;
  timeout?: number;

  // nested transport object (alternative format)
  transport?: {
    type: string;
    headers?: Record<string, string>;
  };

  disabled?: boolean;
};

/**
 * CodeBuddy Code MCP Agent
 * Reads MCP config directly from ~/.codebuddy/mcp.json
 * Supports stdio, streamable-http, and sse transport types
 * Uses `codebuddy mcp` CLI for install/remove operations
 */
export class CodebuddyMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('codebuddy');
  }

  getSupportedTransports(): string[] {
    return ['stdio', 'streamable_http', 'sse'];
  }

  /**
   * Get CodeBuddy mcp.json path
   */
  private getMcpConfigPath(): string {
    return path.join(os.homedir(), '.codebuddy', 'mcp.json');
  }

  /**
   * Read and parse ~/.codebuddy/mcp.json
   */
  private readMcpConfig(): Record<string, CodebuddyMcpEntry> | null {
    try {
      const configPath = this.getMcpConfigPath();
      if (!fs.existsSync(configPath)) {
        return null;
      }
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      return parsed?.mcpServers ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Detect MCP servers from ~/.codebuddy/mcp.json
   */
  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        const mcpServersConfig = this.readMcpConfig();
        if (!mcpServersConfig) {
          return [];
        }

        const mcpServers: IMcpServer[] = [];

        for (const [name, entry] of Object.entries(mcpServersConfig)) {
          const isDisabled = entry.disabled === true;
          const transportType = this.resolveTransportType(entry);

          let transportObj: IMcpServer['transport'];

          if (transportType === 'stdio') {
            transportObj = {
              type: 'stdio' as const,
              command: entry.command || '',
              args: entry.args || [],
              env: entry.env || {},
            };
          } else {
            // streamable-http, sse, or http
            transportObj = {
              type: transportType as 'sse' | 'streamable_http' | 'http',
              url: entry.url || '',
              headers: entry.headers || entry.transport?.headers || {},
            };
          }

          let tools: Array<{ name: string; description?: string }> = [];
          if (!isDisabled) {
            try {
              const testResult = await this.testMcpConnection(transportObj);
              tools = testResult.tools || [];
            } catch (error) {
              console.warn(`[CodebuddyMcpAgent] Failed to get tools for ${name}:`, error);
            }
          }

          mcpServers.push({
            id: `codebuddy_${name}`,
            name: name,
            transport: transportObj,
            tools: tools,
            enabled: !isDisabled,
            status: isDisabled ? 'disconnected' : 'connected',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            description: '',
            originalJson: JSON.stringify({ mcpServers: { [name]: entry } }, null, 2),
          });
        }

        console.log(`[CodebuddyMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);
        return mcpServers;
      } catch (error) {
        console.warn('[CodebuddyMcpAgent] Failed to detect MCP servers:', error);
        return [];
      }
    };

    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  /**
   * Resolve the effective transport type from a CodeBuddy MCP entry.
   * Maps external format (e.g. "streamable-http") to internal type (e.g. "streamable_http").
   */
  private resolveTransportType(entry: CodebuddyMcpEntry): string {
    const raw = entry.transportType || entry.transport?.type || entry.type;
    if (raw) {
      return this.normalizeTransportType(raw);
    }
    // If url is present without command, it's an HTTP-based transport
    if (entry.url && !entry.command) {
      return 'streamable_http';
    }
    // Default to stdio
    return 'stdio';
  }

  /**
   * Normalize external transport type names to internal IMcpServerTransport type values.
   * CodeBuddy config may use "streamable-http" (with dash), but IMcpServerTransport uses "streamable_http" (with underscore).
   */
  private normalizeTransportType(type: string): string {
    if (type === 'streamable-http') return 'streamable_http';
    return type;
  }

  /**
   * Install MCP servers via `codebuddy mcp add` CLI
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        for (const server of mcpServers) {
          try {
            if (server.transport.type === 'stdio') {
              // Format: codebuddy mcp add -s user <name> <command> -- [args...] [-e KEY=VALUE...]
              const args = ['mcp', 'add', '-s', 'user', server.name, server.transport.command];

              if (server.transport.args?.length || Object.keys(server.transport.env || {}).length) {
                args.push('--');
                if (server.transport.args?.length) {
                  args.push(...server.transport.args);
                }
              }

              for (const [key, value] of Object.entries(server.transport.env || {})) {
                args.push('-e', `${key}=${value}`);
              }

              await safeExecFile('codebuddy', args, {
                timeout: 5000,
                env: { ...process.env, NODE_OPTIONS: '', TERM: 'dumb', NO_COLOR: '1' },
              });
            } else if ('url' in server.transport && server.transport.url) {
              // For HTTP-based transports, use add-json to preserve full config
              const config: Record<string, unknown> = {
                url: server.transport.url,
                transportType: server.transport.type === 'sse' ? 'sse' : 'streamable-http',
              };
              if (server.transport.headers && Object.keys(server.transport.headers).length > 0) {
                config.headers = server.transport.headers;
              }

              const jsonStr = JSON.stringify(config);
              await safeExecFile('codebuddy', ['mcp', 'add-json', '-s', 'user', server.name, jsonStr], {
                timeout: 5000,
                env: { ...process.env, NODE_OPTIONS: '', TERM: 'dumb', NO_COLOR: '1' },
              });
            }
            console.log(`[CodebuddyMcpAgent] Added MCP server: ${server.name}`);
          } catch (error) {
            console.warn(`Failed to add MCP ${server.name} to CodeBuddy:`, error);
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
   * Remove MCP server via `codebuddy mcp remove` CLI
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        const scopes = ['user', 'local', 'project'] as const;

        for (const scope of scopes) {
          try {
            const result = await safeExecFile('codebuddy', ['mcp', 'remove', '-s', scope, mcpServerName], {
              timeout: 5000,
              env: { ...process.env, NODE_OPTIONS: '', TERM: 'dumb', NO_COLOR: '1' },
            });

            if (result.stdout && result.stdout.includes('removed')) {
              console.log(`[CodebuddyMcpAgent] Removed MCP server from ${scope} scope: ${mcpServerName}`);
              return { success: true };
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
              continue;
            }
            console.warn(`[CodebuddyMcpAgent] Failed to remove from ${scope} scope:`, errorMessage);
          }
        }

        console.log(`[CodebuddyMcpAgent] MCP server ${mcpServerName} not found in any scope (may already be removed)`);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
