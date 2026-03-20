/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMcpServer } from '@/common/config/storage';
import type { AcpResponse } from '@/common/types/acpTypes';

export interface AcpSessionMcpNameValue {
  name: string;
  value: string;
}

export interface AcpSessionMcpServerStdio {
  type: 'stdio';
  name: string;
  command: string;
  args?: string[];
  env?: AcpSessionMcpNameValue[];
}

export interface AcpSessionMcpServerHttpLike {
  type: 'http' | 'sse';
  name: string;
  url: string;
  headers?: AcpSessionMcpNameValue[];
}

export type AcpSessionMcpServer = AcpSessionMcpServerStdio | AcpSessionMcpServerHttpLike;

export interface AcpMcpCapabilities {
  stdio: boolean;
  http: boolean;
  sse: boolean;
}

const DEFAULT_ACP_MCP_CAPABILITIES: AcpMcpCapabilities = {
  stdio: true,
  http: true,
  sse: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toNameValueEntries(source?: Record<string, string>): AcpSessionMcpNameValue[] | undefined {
  if (!source) return undefined;
  const entries = Object.entries(source)
    .filter(([name, value]) => typeof name === 'string' && typeof value === 'string')
    .map(([name, value]) => ({ name, value }));
  return entries.length > 0 ? entries : undefined;
}

export function parseAcpMcpCapabilities(response: AcpResponse | null): AcpMcpCapabilities {
  const result = isRecord(response?.result) ? response.result : null;
  const agentCapabilities = result && isRecord(result.agentCapabilities) ? result.agentCapabilities : null;
  const mcpCapabilities =
    agentCapabilities && isRecord(agentCapabilities.mcpCapabilities) ? agentCapabilities.mcpCapabilities : null;

  return {
    stdio: typeof mcpCapabilities?.stdio === 'boolean' ? mcpCapabilities.stdio : DEFAULT_ACP_MCP_CAPABILITIES.stdio,
    http: typeof mcpCapabilities?.http === 'boolean' ? mcpCapabilities.http : DEFAULT_ACP_MCP_CAPABILITIES.http,
    sse: typeof mcpCapabilities?.sse === 'boolean' ? mcpCapabilities.sse : DEFAULT_ACP_MCP_CAPABILITIES.sse,
  };
}

function shouldInjectBuiltinServer(server: IMcpServer): boolean {
  if (server.builtin !== true || !server.enabled) {
    return false;
  }

  return server.status === undefined || server.status === 'connected';
}

export function buildBuiltinAcpSessionMcpServers(
  mcpServers: IMcpServer[] | undefined | null,
  capabilities: Partial<AcpMcpCapabilities> = DEFAULT_ACP_MCP_CAPABILITIES
): AcpSessionMcpServer[] {
  if (!Array.isArray(mcpServers) || mcpServers.length === 0) {
    return [];
  }

  const effectiveCapabilities: AcpMcpCapabilities = {
    ...DEFAULT_ACP_MCP_CAPABILITIES,
    ...capabilities,
  };

  return mcpServers
    .filter(shouldInjectBuiltinServer)
    .map((server): AcpSessionMcpServer | null => {
      switch (server.transport.type) {
        case 'stdio':
          if (!effectiveCapabilities.stdio) return null;
          return {
            type: 'stdio',
            name: server.name,
            command: server.transport.command,
            args: server.transport.args || [],
            env: toNameValueEntries(server.transport.env),
          };
        case 'http':
        case 'streamable_http':
          if (!effectiveCapabilities.http) return null;
          return {
            type: 'http',
            name: server.name,
            url: server.transport.url,
            headers: toNameValueEntries(server.transport.headers),
          };
        case 'sse':
          if (!effectiveCapabilities.sse) return null;
          return {
            type: 'sse',
            name: server.name,
            url: server.transport.url,
            headers: toNameValueEntries(server.transport.headers),
          };
        default:
          return null;
      }
    })
    .filter((server): server is AcpSessionMcpServer => server !== null);
}
