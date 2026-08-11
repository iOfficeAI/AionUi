/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMcpServer } from '../../src/common/config/storage';
import {
  CodexMcpAgent,
  buildCodexAddArgs,
  parseCodexMcpListOutput,
} from '../../src/process/services/mcpServices/agents/CodexMcpAgent';

describe('CodexMcpAgent helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds stdio add args with env flags before -- separator', () => {
    const server: IMcpServer = {
      id: 'builtin-image-gen',
      name: 'aionui-image-generation',
      enabled: true,
      builtin: true,
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
    };

    expect(buildCodexAddArgs(server)).toEqual([
      'mcp',
      'add',
      'aionui-image-generation',
      '--env',
      'AIONUI_IMG_PLATFORM=openai',
      '--env',
      'AIONUI_IMG_MODEL=gpt-image-1',
      '--',
      'node',
      '/abs/builtin-mcp-image-gen.js',
    ]);
  });

  it('parses codex json output including env vars', () => {
    const result = parseCodexMcpListOutput(
      JSON.stringify([
        {
          name: 'builtin-image-gen',
          enabled: true,
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['/abs/builtin-mcp-image-gen.js'],
            env: null,
            env_vars: [
              { name: 'AIONUI_IMG_PLATFORM', value: 'openai' },
              { name: 'AIONUI_IMG_MODEL', value: 'gpt-image-1' },
            ],
          },
        },
      ])
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'aionui-image-generation',
      enabled: true,
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
    });
  });

  it('uses cliPath for codex MCP detection', async () => {
    const agent = new CodexMcpAgent();
    const cliPath = 'C:\\Program Files\\OpenAI\\codex.cmd';
    const execCliSpy = vi.spyOn(agent as CodexMcpAgent & { execCli: (typeof agent)['execCli'] }, 'execCli');
    const testConnectionSpy = vi.spyOn(agent, 'testMcpConnection').mockResolvedValue({
      success: true,
      tools: [{ name: 'aionui_image_generation' }],
    });

    execCliSpy.mockResolvedValue({
      stdout: JSON.stringify([
        {
          name: 'aionui-image-generation',
          enabled: true,
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['/abs/builtin-mcp-image-gen.js'],
            env: {
              AIONUI_IMG_PLATFORM: 'openai',
              AIONUI_IMG_MODEL: 'gpt-image-1',
            },
          },
        },
      ]),
      stderr: '',
    });

    const result = await agent.detectMcpServers(cliPath);

    expect(execCliSpy).toHaveBeenCalledWith(cliPath, 'codex', ['mcp', 'list', '--json'], expect.any(Object));
    expect(testConnectionSpy).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'aionui-image-generation',
      status: 'connected',
      tools: [{ name: 'aionui_image_generation' }],
    });
  });

  it('uses cliPath for codex MCP removal', async () => {
    const agent = new CodexMcpAgent();
    const cliPath = 'C:\\Program Files\\OpenAI\\codex.cmd';
    const execCliSpy = vi.spyOn(agent as CodexMcpAgent & { execCli: (typeof agent)['execCli'] }, 'execCli');

    execCliSpy.mockResolvedValue({
      stdout: 'Removed MCP server aionui-image-generation',
      stderr: '',
    });

    const result = await agent.removeMcpServer('aionui-image-generation', cliPath);

    expect(result).toEqual({ success: true });
    expect(execCliSpy).toHaveBeenCalledWith(
      cliPath,
      'codex',
      ['mcp', 'remove', 'aionui-image-generation'],
      expect.any(Object)
    );
  });
});
