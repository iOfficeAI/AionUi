/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IMcpServer } from '../../src/common/config/storage';
import {
  buildBuiltinAcpSessionMcpServers,
  parseAcpMcpCapabilities,
} from '../../src/process/agent/acp/mcpSessionConfig';

describe('ACP built-in MCP session config', () => {
  it('injects only enabled built-in MCP servers and converts transport shape for session/new', () => {
    const servers: IMcpServer[] = [
      {
        id: 'builtin-image-gen',
        name: 'aionui-image-generation',
        enabled: true,
        builtin: true,
        status: 'connected',
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['/abs/builtin-mcp-image-gen.js'],
          env: {
            AIONUI_IMG_PLATFORM: 'openai',
            AIONUI_IMG_MODEL: 'gpt-image-1',
          },
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
      {
        id: 'builtin-http',
        name: 'Builtin HTTP',
        enabled: true,
        builtin: true,
        transport: {
          type: 'streamable_http',
          url: 'https://example.com/mcp',
          headers: {
            Authorization: 'Bearer test-token',
          },
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
      {
        id: 'disabled-builtin',
        name: 'Disabled Builtin',
        enabled: false,
        builtin: true,
        transport: {
          type: 'stdio',
          command: 'node',
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
      {
        id: 'external-server',
        name: 'chrome-devtools',
        enabled: true,
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'chrome-devtools-mcp@latest'],
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
      {
        id: 'builtin-error',
        name: 'Broken Builtin',
        enabled: true,
        builtin: true,
        status: 'error',
        transport: {
          type: 'stdio',
          command: 'node',
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
    ];

    const result = buildBuiltinAcpSessionMcpServers(servers, { stdio: true, http: true, sse: false });

    expect(result).toEqual([
      {
        type: 'stdio',
        name: 'aionui-image-generation',
        command: 'node',
        args: ['/abs/builtin-mcp-image-gen.js'],
        env: [
          { name: 'AIONUI_IMG_PLATFORM', value: 'openai' },
          { name: 'AIONUI_IMG_MODEL', value: 'gpt-image-1' },
        ],
      },
      {
        type: 'http',
        name: 'Builtin HTTP',
        url: 'https://example.com/mcp',
        headers: [{ name: 'Authorization', value: 'Bearer test-token' }],
      },
    ]);
  });

  it('parses MCP capabilities from initialize response and defaults missing fields to true', () => {
    expect(
      parseAcpMcpCapabilities({
        jsonrpc: '2.0',
        id: 1,
        result: {
          agentCapabilities: {
            mcpCapabilities: {
              stdio: true,
              http: false,
            },
          },
        },
      })
    ).toEqual({
      stdio: true,
      http: false,
      sse: true,
    });

    expect(parseAcpMcpCapabilities(null)).toEqual({
      stdio: true,
      http: true,
      sse: true,
    });
  });
});
