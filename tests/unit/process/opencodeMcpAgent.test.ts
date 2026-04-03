/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { IMcpServer } from '../../../src/common/config/storage';
import {
  OpencodeMcpAgent,
  resolveOpencodeConfigPath,
} from '../../../src/process/services/mcpServices/agents/OpencodeMcpAgent';

const originalOpencodeConfig = process.env.OPENCODE_CONFIG;

function createTempConfigPath(filename: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-opencode-'));
  return path.join(tempDir, filename);
}

function readJsonFile(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
}

describe('OpencodeMcpAgent', () => {
  afterEach(() => {
    if (originalOpencodeConfig === undefined) {
      delete process.env.OPENCODE_CONFIG;
    } else {
      process.env.OPENCODE_CONFIG = originalOpencodeConfig;
    }
    vi.restoreAllMocks();
  });

  it('detects local and remote MCP servers from opencode jsonc config', async () => {
    const configPath = createTempConfigPath('opencode.jsonc');
    process.env.OPENCODE_CONFIG = configPath;
    fs.writeFileSync(
      configPath,
      `{
        // OpenCode MCP config
        "tools": {
          "disabled-server": false
        },
        "mcp": {
          "local-server": {
            "type": "local",
            "command": ["npx", "-y", "@modelcontextprotocol/server-everything"],
            "environment": {
              "API_KEY": "abc"
            }
          },
          "remote-server": {
            "type": "remote",
            "url": "https://example.com/mcp",
            "headers": {
              "Authorization": "Bearer 123"
            }
          },
          "sse-server": {
            "type": "remote",
            "url": "https://example.com/sse"
          },
          "disabled-server": {
            "type": "local",
            "command": ["node", "disabled.js"]
          },
          "broken-server": {
            "type": "local",
            "command": []
          }
        }
      }`,
      'utf-8'
    );

    const agent = new OpencodeMcpAgent();
    const testMcpConnection = vi.spyOn(agent, 'testMcpConnection');
    testMcpConnection.mockResolvedValue({
      success: true,
      tools: [{ name: 'echo' }],
    });

    const servers = await agent.detectMcpServers();

    expect(servers).toHaveLength(4);
    expect(servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'local-server',
          enabled: true,
          status: 'connected',
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-everything'],
            env: { API_KEY: 'abc' },
          },
          tools: [{ name: 'echo' }],
        }),
        expect.objectContaining({
          name: 'remote-server',
          enabled: true,
          status: 'connected',
          transport: {
            type: 'streamable_http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer 123' },
          },
        }),
        expect.objectContaining({
          name: 'sse-server',
          enabled: true,
          status: 'connected',
          transport: {
            type: 'sse',
            url: 'https://example.com/sse',
          },
        }),
        expect.objectContaining({
          name: 'disabled-server',
          enabled: false,
          status: 'disconnected',
          tools: [],
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['disabled.js'],
            env: {},
          },
        }),
      ])
    );
    expect(testMcpConnection).toHaveBeenCalledTimes(3);
  });

  it('returns an empty list when the config file is missing', async () => {
    process.env.OPENCODE_CONFIG = createTempConfigPath('missing-opencode.json');

    const agent = new OpencodeMcpAgent();

    await expect(agent.detectMcpServers()).resolves.toEqual([]);
  });

  it('installs MCP servers by writing them into the OpenCode config file', async () => {
    const configPath = createTempConfigPath('opencode.json');
    process.env.OPENCODE_CONFIG = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          theme: 'opencode',
          mcp: {
            existing: {
              type: 'local',
              command: ['node', 'existing.js'],
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const servers: IMcpServer[] = [
      {
        id: 'stdio',
        name: 'filesystem',
        enabled: true,
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/workspace'],
          env: { DEBUG: '1' },
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
      {
        id: 'remote',
        name: 'jira',
        enabled: true,
        transport: {
          type: 'streamable_http',
          url: 'https://jira.example.com/mcp',
          headers: { Authorization: 'Bearer token' },
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
    ];

    const agent = new OpencodeMcpAgent();
    await expect(agent.installMcpServers(servers)).resolves.toEqual({ success: true });

    expect(readJsonFile(configPath)).toEqual({
      $schema: 'https://opencode.ai/config.json',
      theme: 'opencode',
      mcp: {
        existing: {
          type: 'local',
          command: ['node', 'existing.js'],
        },
        filesystem: {
          type: 'local',
          command: ['npx', '-y', '@modelcontextprotocol/server-filesystem', '/tmp/workspace'],
          environment: { DEBUG: '1' },
          enabled: true,
        },
        jira: {
          type: 'remote',
          url: 'https://jira.example.com/mcp',
          headers: { Authorization: 'Bearer token' },
          enabled: true,
        },
      },
    });
  });

  it('removes MCP servers from the OpenCode config file and ignores unknown names', async () => {
    const configPath = createTempConfigPath('opencode.json');
    process.env.OPENCODE_CONFIG = configPath;
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          mcp: {
            keep: {
              type: 'local',
              command: ['node', 'keep.js'],
            },
            remove: {
              type: 'remote',
              url: 'https://example.com/mcp',
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const agent = new OpencodeMcpAgent();

    await expect(agent.removeMcpServer('remove')).resolves.toEqual({ success: true });
    await expect(agent.removeMcpServer('missing')).resolves.toEqual({ success: true });

    expect(readJsonFile(configPath)).toEqual({
      mcp: {
        keep: {
          type: 'local',
          command: ['node', 'keep.js'],
        },
      },
    });
  });

  it('prefers OPENCODE_CONFIG over the default config location', () => {
    const customPath = createTempConfigPath('custom-opencode.json');
    process.env.OPENCODE_CONFIG = customPath;

    expect(resolveOpencodeConfigPath()).toBe(customPath);
  });
});
