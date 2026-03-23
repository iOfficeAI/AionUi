/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IMcpServer } from '../../src/common/config/storage';
import {
  buildCodexAddArgs,
  parseCodexMcpListOutput,
} from '../../src/process/services/mcpServices/agents/CodexMcpAgent';

describe('CodexMcpAgent helpers', () => {
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
});
