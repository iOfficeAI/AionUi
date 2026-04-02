/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AcpAdapter } from '../../src/process/agent/acp/AcpAdapter';
import type { AvailableCommandsUpdate, ToolCallUpdate, ToolCallUpdateStatus } from '../../src/common/types/acpTypes';

describe('AcpAdapter - rawInput merging (#1113)', () => {
  let adapter: AcpAdapter;
  const conversationId = 'test-conversation-id';

  beforeEach(() => {
    adapter = new AcpAdapter(conversationId, 'claude');
  });

  it('should create tool call message with initial empty rawInput', () => {
    const toolCallUpdate: ToolCallUpdate = {
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-123',
        status: 'pending',
        title: 'Test Tool',
        kind: 'execute',
        rawInput: {}, // Initial empty input during streaming
      },
    };

    const messages = adapter.convertSessionUpdate(toolCallUpdate);

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('acp_tool_call');
    expect((messages[0] as any).content.update.rawInput).toEqual({});
  });

  it('should merge rawInput from tool_call_update into existing tool call', () => {
    // First, create the initial tool call with empty rawInput
    const initialToolCall: ToolCallUpdate = {
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-123',
        status: 'pending',
        title: 'Test Tool',
        kind: 'execute',
        rawInput: {}, // Empty during initial streaming
      },
    };

    adapter.convertSessionUpdate(initialToolCall);

    // Then, send tool_call_update with complete rawInput
    const toolCallUpdateStatus: ToolCallUpdateStatus = {
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-123',
        status: 'completed',
        rawInput: {
          include_dms: true,
          include_groups: true,
          include_spaces: false,
        },
        content: [
          {
            type: 'content',
            content: {
              type: 'text',
              text: 'Tool result',
            },
          },
        ],
      },
    };

    const messages = adapter.convertSessionUpdate(toolCallUpdateStatus);

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('acp_tool_call');
    // Verify rawInput is merged from the update
    const rawInput = (messages[0] as any).content.update.rawInput;
    expect(rawInput).toEqual({
      include_dms: true,
      include_groups: true,
      include_spaces: false,
    });
  });

  it('should preserve existing rawInput if update has no rawInput', () => {
    // Create tool call with initial rawInput
    const initialToolCall: ToolCallUpdate = {
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-456',
        status: 'in_progress',
        title: 'Another Tool',
        kind: 'read',
        rawInput: { path: '/some/file.txt' },
      },
    };

    adapter.convertSessionUpdate(initialToolCall);

    // Send update without rawInput
    const toolCallUpdateStatus: ToolCallUpdateStatus = {
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-456',
        status: 'completed',
        // No rawInput in this update
      },
    };

    const messages = adapter.convertSessionUpdate(toolCallUpdateStatus);

    expect(messages).toHaveLength(1);
    // Should preserve the original rawInput
    const rawInput = (messages[0] as any).content.update.rawInput;
    expect(rawInput).toEqual({ path: '/some/file.txt' });
  });

  it('should return null for tool_call_update without existing tool call', () => {
    const toolCallUpdateStatus: ToolCallUpdateStatus = {
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'non-existent-tool',
        status: 'completed',
        rawInput: { some: 'data' },
      },
    };

    const messages = adapter.convertSessionUpdate(toolCallUpdateStatus);

    // Should return empty array since no existing tool call found
    expect(messages).toHaveLength(0);
  });
});

describe('AcpAdapter - ToolCallUpdateStatus type (#1113)', () => {
  it('should accept rawInput field in ToolCallUpdateStatus', () => {
    // This test verifies the TypeScript type includes rawInput
    const update: ToolCallUpdateStatus = {
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-789',
        status: 'completed',
        rawInput: {
          command: 'ls -la',
          description: 'List directory contents',
        },
        content: [],
      },
    };

    // Type check passes if this compiles
    expect(update.update.rawInput).toBeDefined();
    expect(update.update.rawInput?.command).toBe('ls -la');
  });
});

describe('AcpAdapter - streaming message grouping', () => {
  let adapter: AcpAdapter;

  beforeEach(() => {
    adapter = new AcpAdapter('test-conversation-id', 'codex');
  });

  it('keeps one msg_id when tool updates are interleaved into a streamed reply', () => {
    const firstChunk = adapter.convertSessionUpdate({
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: '- `bunx tsc --no' },
      },
    } as any);

    const initialToolCall = adapter.convertSessionUpdate({
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-123',
        status: 'pending',
        title: 'Run bunx tsc --noEmit',
        kind: 'execute',
        rawInput: {},
      },
    } as ToolCallUpdate);

    const updatedToolCall = adapter.convertSessionUpdate({
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-123',
        status: 'completed',
      },
    } as ToolCallUpdateStatus);

    const secondChunk = adapter.convertSessionUpdate({
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Emit`：通过' },
      },
    } as any);

    expect(firstChunk).toHaveLength(1);
    expect(initialToolCall).toHaveLength(1);
    expect(updatedToolCall).toHaveLength(1);
    expect(secondChunk).toHaveLength(1);
    expect(firstChunk[0].type).toBe('text');
    expect(secondChunk[0].type).toBe('text');
    expect(firstChunk[0].msg_id).toBe(secondChunk[0].msg_id);
  });

  it('keeps one msg_id when available command updates arrive mid-stream', () => {
    const firstChunk = adapter.convertSessionUpdate({
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'First paragraph.\n\n' },
      },
    } as any);

    const availableCommands = adapter.convertSessionUpdate({
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'available_commands_update',
        availableCommands: [{ name: 'resume', description: 'Resume the session' }],
      },
    } as AvailableCommandsUpdate);

    const secondChunk = adapter.convertSessionUpdate({
      sessionId: 'test-session',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: '- Second paragraph item' },
      },
    } as any);

    expect(firstChunk).toHaveLength(1);
    expect(availableCommands).toHaveLength(0);
    expect(secondChunk).toHaveLength(1);
    expect(firstChunk[0].type).toBe('text');
    expect(secondChunk[0].type).toBe('text');
    expect(firstChunk[0].msg_id).toBe(secondChunk[0].msg_id);
  });
});
