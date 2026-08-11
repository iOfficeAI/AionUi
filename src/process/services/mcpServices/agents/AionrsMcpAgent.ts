/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { parse, stringify } from 'smol-toml';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';
import type { IMcpServer, IMcpServerTransport } from '@/common/config/storage';

/**
 * aionrs config.toml transport type (kebab-case)
 * Maps to AionUi transport types (snake_case)
 */
type AionrsTransportType = 'stdio' | 'sse' | 'streamable-http';

type AionrsServerConfig = {
  transport: AionrsTransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

type AionrsConfigFile = {
  mcp?: {
    servers?: Record<string, AionrsServerConfig>;
  };
  [key: string]: unknown;
};

/** Cached config path resolved from `aionrs --config-path` */
let cachedConfigPath: string | null = null;

/**
 * Get the aionrs global config path via `aionrs --config-path`.
 * The result is cached because the path does not change at runtime.
 */
function getAionrsConfigPath(cliPath?: string): string {
  if (cachedConfigPath) return cachedConfigPath;

  const cmd = cliPath || 'aionrs';
  const result = execSync(`${cmd} --config-path`, {
    encoding: 'utf-8',
    timeout: 3000,
    env: getEnhancedEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

  cachedConfigPath = result;
  return result;
}

/**
 * Map aionrs transport type (kebab-case) to AionUi transport type
 */
function toAionUiTransportType(aionrsType: AionrsTransportType): IMcpServerTransport['type'] {
  if (aionrsType === 'streamable-http') return 'streamable_http';
  return aionrsType;
}

/**
 * Map AionUi transport type to aionrs transport type (kebab-case)
 */
function toAionrsTransportType(type: IMcpServerTransport['type']): AionrsTransportType {
  if (type === 'streamable_http') return 'streamable-http';
  if (type === 'http') return 'streamable-http';
  return type as AionrsTransportType;
}

/**
 * Convert an aionrs server config entry to an AionUi IMcpServer
 */
function toMcpServer(name: string, config: AionrsServerConfig): IMcpServer {
  const transportType = toAionUiTransportType(config.transport);
  const now = Date.now();

  const transport: IMcpServerTransport =
    transportType === 'stdio'
      ? {
          type: 'stdio',
          command: config.command || '',
          args: config.args || [],
          env: config.env || {},
        }
      : {
          type: transportType,
          url: config.url || '',
          headers: config.headers || {},
        };

  return {
    id: `aionrs_${name}`,
    name,
    transport,
    tools: [],
    enabled: true,
    status: 'disconnected',
    createdAt: now,
    updatedAt: now,
    description: '',
    originalJson: JSON.stringify({ mcpServers: { [name]: config } }, null, 2),
  };
}

/**
 * Convert an AionUi IMcpServer to an aionrs server config entry
 */
function toAionrsConfig(server: IMcpServer): AionrsServerConfig {
  const aionrsType = toAionrsTransportType(server.transport.type);

  if (server.transport.type === 'stdio') {
    const config: AionrsServerConfig = {
      transport: aionrsType,
      command: server.transport.command,
      args: server.transport.args?.length ? server.transport.args : undefined,
    };
    if (server.transport.env && Object.keys(server.transport.env).length > 0) {
      config.env = server.transport.env;
    }
    return config;
  }

  const config: AionrsServerConfig = {
    transport: aionrsType,
    url: server.transport.url,
  };
  if (server.transport.headers && Object.keys(server.transport.headers).length > 0) {
    config.headers = server.transport.headers;
  }
  return config;
}

/**
 * Aion CLI (aionrs) MCP agent implementation
 *
 * Manages MCP server configuration in the platform config directory (see getAionrsConfigPath())
 * aionrs uses TOML format with [mcp.servers.*] sections
 */
export class AionrsMcpAgent extends AbstractMcpAgent {
  /** Remembered cliPath from the most recent detectMcpServers call */
  private resolvedCliPath?: string;

  constructor() {
    super('aionrs');
  }

  getSupportedTransports(): string[] {
    // aionrs supports stdio, sse, streamable-http (mapped to streamable_http in AionUi)
    return ['stdio', 'sse', 'streamable_http'];
  }

  /**
   * Read and parse the aionrs config file
   */
  private async readConfig(cliPath?: string): Promise<AionrsConfigFile> {
    try {
      const content = await fs.readFile(getAionrsConfigPath(cliPath), 'utf-8');
      return parse(content) as AionrsConfigFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  /**
   * Write the aionrs config file (preserving non-MCP sections)
   */
  private async writeConfig(config: AionrsConfigFile): Promise<void> {
    // Ensure directory exists
    const configPath = getAionrsConfigPath(this.resolvedCliPath);
    await fs.mkdir(dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, stringify(config), 'utf-8');
  }

  /**
   * Detect MCP servers configured in aionrs config.toml
   */
  detectMcpServers(cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      try {
        this.resolvedCliPath = cliPath;
        const config = await this.readConfig(cliPath);
        const servers = config.mcp?.servers;

        if (!servers || Object.keys(servers).length === 0) {
          return [];
        }

        const mcpServers = Object.entries(servers).map(([name, serverConfig]) =>
          toMcpServer(name, serverConfig as AionrsServerConfig)
        );

        console.log(`[AionrsMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);
        return mcpServers;
      } catch (error) {
        console.warn('[AionrsMcpAgent] Failed to detect MCP servers:', error);
        return [];
      }
    };

    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  /**
   * Install MCP servers into aionrs config.toml
   */
  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        const config = await this.readConfig();

        // Ensure mcp.servers section exists
        if (!config.mcp) {
          config.mcp = { servers: {} };
        }
        if (!config.mcp.servers) {
          config.mcp.servers = {};
        }

        for (const server of mcpServers) {
          const supportedTypes = this.getSupportedTransports();
          if (!supportedTypes.includes(server.transport.type)) {
            console.warn(`[AionrsMcpAgent] Skipping ${server.name}: unsupported transport ${server.transport.type}`);
            continue;
          }
          config.mcp.servers[server.name] = toAionrsConfig(server);
          console.log(`[AionrsMcpAgent] Added MCP server: ${server.name}`);
        }

        await this.writeConfig(config);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(installOperation, 'name', { value: 'installMcpServers' });
    return this.withLock(installOperation);
  }

  /**
   * Remove an MCP server from aionrs config.toml
   */
  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        const config = await this.readConfig();
        const servers = config.mcp?.servers;

        if (!servers || !(mcpServerName in servers)) {
          console.log(`[AionrsMcpAgent] MCP server ${mcpServerName} not found (may already be removed)`);
          return { success: true };
        }

        delete servers[mcpServerName];
        await this.writeConfig(config);
        console.log(`[AionrsMcpAgent] Removed MCP server: ${mcpServerName}`);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
