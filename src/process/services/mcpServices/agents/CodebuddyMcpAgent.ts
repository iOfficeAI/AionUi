/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import type { IMcpServer } from '../../../../common/storage';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';

const execAsync = promisify(exec);

/**
 * CodeBuddy MCP server entry in ~/.codebuddy/mcp.json
 */
interface CodebuddyMcpEntry {
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
}

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
    return ['stdio', 'streamable-http', 'sse'];
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
              type: transportType as 'sse',
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
   * Resolve the effective transport type from a CodeBuddy MCP entry
   */
  private resolveTransportType(entry: CodebuddyMcpEntry): string {
    // Explicit transportType field (e.g. "streamable-http", "sse")
    if (entry.transportType) {
      return entry.transportType;
    }
    // Nested transport object (e.g. { transport: { type: "http" } })
    if (entry.transport?.type) {
      return entry.transport.type;
    }
    // Explicit type field (e.g. "stdio")
    if (entry.type) {
      return entry.type;
    }
    // If url is present without command, it's an HTTP-based transport
    if (entry.url && !entry.command) {
      return 'streamable-http';
    }
    // Default to stdio
    return 'stdio';
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
              const envArgs = Object.entries(server.transport.env || {})
                .map(([key, value]) => `-e ${key}=${value}`)
                .join(' ');

              let command = `codebuddy mcp add -s user "${server.name}" "${server.transport.command}"`;

              if (server.transport.args?.length || Object.keys(server.transport.env || {}).length) {
                command += ' --';
                if (server.transport.args?.length) {
                  const quotedArgs = server.transport.args.map((arg: string) => `"${arg}"`).join(' ');
                  command += ` ${quotedArgs}`;
                }
              }

              if (envArgs) {
                command += ` ${envArgs}`;
              }

              await execAsync(command, {
                timeout: 5000,
                env: { ...process.env, NODE_OPTIONS: '' },
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

              const jsonStr = JSON.stringify(config).replace(/"/g, '\\"');
              const command = `codebuddy mcp add-json -s user "${server.name}" "${jsonStr}"`;

              await execAsync(command, {
                timeout: 5000,
                env: { ...process.env, NODE_OPTIONS: '' },
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
            const removeCommand = `codebuddy mcp remove -s ${scope} "${mcpServerName}"`;
            const result = await execAsync(removeCommand, {
              timeout: 5000,
              env: { ...process.env, NODE_OPTIONS: '' },
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
