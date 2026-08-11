/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IMcpServer } from '../../src/common/config/storage';
import { buildQwenAddArgs } from '../../src/process/services/mcpServices/agents/QwenMcpAgent';

describe('QwenMcpAgent helpers', () => {
  it('builds stdio MCP add args without embedding shell quotes', () => {
    const server: IMcpServer = {
      id: 'builtin-image-gen',
      name: 'aionui-image-generation',
      enabled: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['E:\\code\\taichuCode\\AionUi\\out\\main\\builtin-mcp-image-gen.js'],
        env: {
          AIONUI_IMG_PLATFORM: 'new-api',
          AIONUI_IMG_MODEL: 'gemini-3.1-flash-image-preview',
        },
      },
      createdAt: 1,
      updatedAt: 1,
      originalJson: '{}',
    };

    expect(buildQwenAddArgs(server)).toEqual([
      'mcp',
      'add',
      '-s',
      'user',
      '--transport',
      'stdio',
      '--env=AIONUI_IMG_PLATFORM=new-api',
      '--env=AIONUI_IMG_MODEL=gemini-3.1-flash-image-preview',
      'aionui-image-generation',
      'node',
      'E:\\code\\taichuCode\\AionUi\\out\\main\\builtin-mcp-image-gen.js',
    ]);
  });
});
