/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { CodexToolHandlers } from '../../src/process/agent/codex/handlers/CodexToolHandlers';

describe('CodexToolHandlers', () => {
  it('matches MCP begin/end events and clears pending confirmations', () => {
    const messageEmitter = {
      emitAndPersistMessage: vi.fn(),
    } as any;
    const handlers = new CodexToolHandlers('conversation-1', messageEmitter);

    handlers.handleMcpToolCallBegin({
      type: 'mcp_tool_call_begin',
      invocation: {
        server: 'chrome-devtools',
        tool: 'navigate_page',
        arguments: {
          url: 'https://example.com',
        },
      },
    } as any);

    expect(handlers.getPendingConfirmations().size).toBe(1);

    handlers.handleMcpToolCallEnd({
      type: 'mcp_tool_call_end',
      invocation: {
        server: 'chrome-devtools',
        tool: 'navigate_page',
        arguments: {
          url: 'https://example.com',
        },
      },
      result: {
        ok: true,
      },
    } as any);

    expect(handlers.getPendingConfirmations().size).toBe(0);
  });
});
