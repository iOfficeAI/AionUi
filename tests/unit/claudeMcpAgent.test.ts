/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IMcpServer } from '../../src/common/config/storage';
import { buildClaudeStdioJsonConfig } from '../../src/process/services/mcpServices/agents/ClaudeMcpAgent';

describe('ClaudeMcpAgent helpers', () => {
  it('builds stdio MCP JSON config including env vars', () => {
    const server: IMcpServer = {
      id: 'builtin-image-gen',
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
      createdAt: 1,
      updatedAt: 1,
      originalJson: '{}',
    };

    expect(JSON.parse(buildClaudeStdioJsonConfig(server))).toEqual({
      command: 'node',
      args: ['/abs/builtin-mcp-image-gen.js'],
      env: {
        AIONUI_IMG_PLATFORM: 'openai',
        AIONUI_IMG_MODEL: 'gpt-image-1',
      },
    });
  });
});
