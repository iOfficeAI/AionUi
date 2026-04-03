/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import stripJsonComments from 'strip-json-comments';
import type { IMcpServer, IMcpServerTransport } from '@/common/config/storage';
import type { McpOperationResult } from '../McpProtocol';
import { AbstractMcpAgent } from '../McpProtocol';

type OpencodeToolConfig = Record<string, boolean | undefined>;

type OpencodeLocalMcpEntry = {
  type: 'local';
  command?: string[] | string;
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
};

type OpencodeRemoteMcpEntry = {
  type: 'remote';
  url?: string;
  enabled?: boolean;
  headers?: Record<string, string>;
  oauth?: Record<string, unknown>;
  timeout?: number;
};

type OpencodeMcpEntry = OpencodeLocalMcpEntry | OpencodeRemoteMcpEntry;

type OpencodeConfig = {
  $schema?: string;
  mcp?: Record<string, OpencodeMcpEntry>;
  tools?: OpencodeToolConfig;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === 'string');
}

function sanitizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (pair): pair is [string, string] => typeof pair[0] === 'string' && typeof pair[1] === 'string'
    )
  );
}

function toOpencodeTransport(entry: OpencodeMcpEntry): IMcpServerTransport | null {
  if (entry.type === 'local') {
    if (Array.isArray(entry.command) && entry.command.length > 0) {
      return {
        type: 'stdio',
        command: entry.command[0],
        args: entry.command.slice(1),
        env: sanitizeStringRecord(entry.environment),
      };
    }

    if (typeof entry.command === 'string' && entry.command.trim()) {
      return {
        type: 'stdio',
        command: entry.command,
        args: [],
        env: sanitizeStringRecord(entry.environment),
      };
    }

    return null;
  }

  if (!entry.url || typeof entry.url !== 'string') {
    return null;
  }

  const headers = sanitizeStringRecord(entry.headers);
  // OpenCode's 'remote' type maps back to 'streamable_http' by default (lossy conversion:
  // both 'http' and 'streamable_http' are written as 'remote', so 'streamable_http' is the
  // safe default on read-back). SSE entries are identified by URL path heuristic.
  const remoteType = entry.url.includes('/sse') ? 'sse' : 'streamable_http';
  return {
    type: remoteType,
    url: entry.url,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
}

function toOpencodeEntry(transport: IMcpServerTransport): OpencodeMcpEntry | null {
  if (transport.type === 'stdio') {
    return {
      type: 'local',
      command: [transport.command, ...(transport.args || [])],
      ...(transport.env && Object.keys(transport.env).length > 0 ? { environment: transport.env } : {}),
      enabled: true,
    };
  }

  if (transport.type === 'http' || transport.type === 'streamable_http' || transport.type === 'sse') {
    return {
      type: 'remote',
      url: transport.url,
      ...(transport.headers && Object.keys(transport.headers).length > 0 ? { headers: transport.headers } : {}),
      enabled: true,
    };
  }

  return null;
}

function getOriginalJson(name: string, entry: OpencodeMcpEntry): string {
  return JSON.stringify(
    {
      mcp: {
        [name]: entry,
      },
    },
    null,
    2
  );
}

function resolveToolDisabled(name: string, tools: OpencodeToolConfig | undefined): boolean {
  if (!tools) return false;

  if (tools[name] === false) {
    return true;
  }

  const prefixedName = `${name}_*`;
  return tools[prefixedName] === false;
}

function getDefaultConfigPath(): string {
  const configRoot = path.join(os.homedir(), '.config', 'opencode');
  return path.join(configRoot, 'opencode.json');
}

export function resolveOpencodeConfigPath(): string {
  const customPath = process.env.OPENCODE_CONFIG;
  if (customPath && customPath.trim()) {
    return customPath;
  }

  const jsonPath = getDefaultConfigPath();
  if (fs.existsSync(jsonPath)) {
    return jsonPath;
  }

  const jsoncPath = jsonPath.replace(/\.json$/i, '.jsonc');
  if (fs.existsSync(jsoncPath)) {
    return jsoncPath;
  }

  return jsonPath;
}

export function parseOpencodeConfig(content: string): OpencodeConfig {
  const parsed = JSON.parse(stripJsonComments(content)) as unknown;
  if (!isRecord(parsed)) {
    return {};
  }

  const config: OpencodeConfig = { ...parsed };
  if (!isRecord(config.mcp)) {
    config.mcp = {};
  }
  if (!isRecord(config.tools)) {
    config.tools = undefined;
  }
  return config;
}

/**
 * OpenCode MCP agent
 *
 * Reads and writes OpenCode MCP entries from opencode.json/jsonc.
 * Official config locations:
 * - OPENCODE_CONFIG
 * - ~/.config/opencode/opencode.json
 */
export class OpencodeMcpAgent extends AbstractMcpAgent {
  constructor() {
    super('opencode');
  }

  getSupportedTransports(): string[] {
    return ['stdio', 'sse', 'http', 'streamable_http'];
  }

  private readConfig(): OpencodeConfig | null {
    try {
      const configPath = resolveOpencodeConfigPath();
      if (!fs.existsSync(configPath)) {
        return null;
      }

      const content = fs.readFileSync(configPath, 'utf-8');
      return parseOpencodeConfig(content);
    } catch (error) {
      console.warn('[OpencodeMcpAgent] Failed to read opencode config:', error);
      return null;
    }
  }

  private writeConfig(config: OpencodeConfig): void {
    const configPath = resolveOpencodeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  }

  detectMcpServers(_cliPath?: string): Promise<IMcpServer[]> {
    const detectOperation = async () => {
      const config = this.readConfig();
      if (!config?.mcp) {
        return [];
      }

      const mcpServers: IMcpServer[] = [];

      for (const [name, rawEntry] of Object.entries(config.mcp)) {
        if (!isRecord(rawEntry) || (rawEntry.type !== 'local' && rawEntry.type !== 'remote')) {
          continue;
        }

        const entry = rawEntry as OpencodeMcpEntry;
        const transport = toOpencodeTransport(entry);
        if (!transport) {
          continue;
        }

        const enabled = entry.enabled !== false && !resolveToolDisabled(name, config.tools);
        let tools: Array<{ name: string; description?: string }> = [];
        let status: IMcpServer['status'] = enabled ? 'connected' : 'disconnected';

        if (enabled) {
          try {
            const result = await this.testMcpConnection(transport);
            tools = result.tools || [];
            status = result.success ? 'connected' : 'disconnected';
          } catch (error) {
            console.warn(`[OpencodeMcpAgent] Failed to get tools for ${name}:`, error);
            status = 'disconnected';
          }
        }

        mcpServers.push({
          id: `opencode_${name}`,
          name,
          transport,
          tools,
          enabled,
          status,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          description: '',
          originalJson: getOriginalJson(name, entry),
        });
      }

      console.log(`[OpencodeMcpAgent] Detection complete: found ${mcpServers.length} server(s)`);
      return mcpServers;
    };

    Object.defineProperty(detectOperation, 'name', { value: 'detectMcpServers' });
    return this.withLock(detectOperation);
  }

  installMcpServers(mcpServers: IMcpServer[]): Promise<McpOperationResult> {
    const installOperation = async () => {
      try {
        const config = this.readConfig() || {};
        const existingMcp = isRecord(config.mcp) ? { ...config.mcp } : {};

        for (const server of mcpServers) {
          const entry = toOpencodeEntry(server.transport);
          if (!entry) {
            console.warn(`[OpencodeMcpAgent] Skipping unsupported transport for ${server.name}`);
            continue;
          }

          existingMcp[server.name] = entry;
        }

        this.writeConfig({
          ...config,
          mcp: existingMcp,
        });

        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(installOperation, 'name', { value: 'installMcpServers' });
    return this.withLock(installOperation);
  }

  removeMcpServer(mcpServerName: string): Promise<McpOperationResult> {
    const removeOperation = async () => {
      try {
        const config = this.readConfig();
        if (!config?.mcp || !isRecord(config.mcp) || !config.mcp[mcpServerName]) {
          return { success: true };
        }

        const nextMcp = { ...config.mcp };
        delete nextMcp[mcpServerName];

        this.writeConfig({
          ...config,
          mcp: nextMcp,
        });

        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.defineProperty(removeOperation, 'name', { value: 'removeMcpServer' });
    return this.withLock(removeOperation);
  }
}
