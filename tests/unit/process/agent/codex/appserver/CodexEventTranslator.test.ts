import { describe, expect, it } from 'vitest';
import { CodexEventTranslator } from '@/process/agent/codex/appserver/CodexEventTranslator';

describe('CodexEventTranslator native tool events', () => {
  it.each([
    ['item/reasoning/summaryTextDelta', 'reason-1', 'Inspecting files'],
    ['item/reasoning/textDelta', 'reason-2', 'Checking types'],
  ])('maps %s to persisted thinking messages', (method, itemId, delta) => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method,
      params: { itemId, delta },
    });

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'thinking',
          conversation_id: 'conversation-1',
          msg_id: itemId,
          data: { content: delta, status: 'thinking' },
        }),
      }),
    ]);
  });

  it('uses an empty thinking delta when reasoning params are missing', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'item/reasoning/summaryTextDelta',
    });

    expect(events[0]).toEqual(
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'thinking',
          data: { content: '', status: 'thinking' },
        }),
      })
    );
  });

  it('maps official turn plan updates to persisted plan messages', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'turn/plan/updated',
      params: {
        turnId: 'turn-1',
        explanation: 'Need to verify native events',
        plan: [
          { step: 'Add tests', status: 'completed' },
          { step: 'Implement translator', status: 'inProgress' },
        ],
      },
    });

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'plan',
          conversation_id: 'conversation-1',
          msg_id: 'turn-1',
          data: {
            sessionId: 'turn-1',
            entries: [
              { content: 'Add tests', status: 'completed' },
              { content: 'Implement translator', status: 'in_progress' },
            ],
          },
        }),
      }),
    ]);
  });

  it('maps plan deltas to persisted plan messages', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'item/plan/delta',
      params: { itemId: 'plan-1', delta: '1. Inspect files' },
    });

    expect(events[0]).toEqual(
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'plan',
          msg_id: 'plan-1',
          data: {
            sessionId: 'plan-1',
            entries: [{ content: '1. Inspect files', status: 'pending' }],
          },
        }),
      })
    );
  });

  it('maps turn diff updates to persisted turn diff tool calls', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'turn/diff/updated',
      params: { diff: 'diff --git a/file.ts b/file.ts\n' },
    });

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'codex_tool_call',
          msg_id: 'turn_diff',
          data: {
            toolCallId: 'turn_diff',
            subtype: 'turn_diff',
            status: 'success',
            kind: 'execute',
            description: 'Turn diff',
            data: { unified_diff: 'diff --git a/file.ts b/file.ts\n' },
          },
        }),
      }),
    ]);
  });

  it('maps official nested token usage updates to non-persisted context usage messages', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        tokenUsage: {
          total: { totalTokens: 1200 },
          last: { totalTokens: 200 },
          modelContextWindow: 128000,
        },
      },
    });

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'message',
        persist: false,
        message: expect.objectContaining({
          type: 'acp_context_usage',
          conversation_id: 'conversation-1',
          data: { used: 1200, size: 128000 },
        }),
      }),
    ]);
  });

  it('maps legacy top-level token usage updates to non-persisted context usage messages', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'thread/tokenUsage/updated',
      params: { totalTokens: 1200, contextWindow: 128000 },
    });

    expect(events[0]).toEqual(
      expect.objectContaining({
        kind: 'message',
        persist: false,
        message: expect.objectContaining({
          type: 'acp_context_usage',
          data: { used: 1200, size: 128000 },
        }),
      })
    );
  });

  it('uses zero defaults for token usage updates with missing fields', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'thread/tokenUsage/updated',
      params: {},
    });

    expect(events[0]).toEqual(
      expect.objectContaining({
        persist: false,
        message: expect.objectContaining({
          type: 'acp_context_usage',
          data: { used: 0, size: 0 },
        }),
      })
    );
  });

  it('keeps warnings as persisted error agent status messages', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'warning',
      params: { message: 'low context' },
    });

    expect(events[0]).toEqual(
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'agent_status',
          data: { status: 'error', warning: { message: 'low context' } },
        }),
      })
    );
  });

  it('maps command output deltas to codex tool call updates', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'item/commandExecution/outputDelta',
      params: {
        itemId: 'cmd-1',
        command: ['echo', 'hello'],
        stream: 'stdout',
        delta: 'hello\n',
      },
    });

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'codex_tool_call',
          conversation_id: 'conversation-1',
          msg_id: 'cmd-1',
          data: expect.objectContaining({
            toolCallId: 'cmd-1',
            subtype: 'exec_command_output_delta',
            status: 'executing',
            kind: 'execute',
            description: 'echo hello',
            content: [{ type: 'output', output: 'hello\n' }],
            data: expect.objectContaining({
              call_id: 'cmd-1',
              stream: 'stdout',
              chunk: 'hello\n',
            }),
          }),
        }),
      }),
    ]);
  });

  it('maps file patch updates to codex tool call updates', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'item/fileChange/patchUpdated',
      params: {
        itemId: 'patch-1',
        filePath: 'src/app.ts',
        patch: 'diff --git a/src/app.ts b/src/app.ts\n',
      },
    });

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'codex_tool_call',
          msg_id: 'patch-1',
          data: expect.objectContaining({
            toolCallId: 'patch-1',
            subtype: 'patch_apply_begin',
            status: 'executing',
            kind: 'patch',
            description: 'src/app.ts',
            content: [{ type: 'output', output: 'diff --git a/src/app.ts b/src/app.ts\n' }],
          }),
        }),
      }),
    ]);
  });

  it('maps collaboration spawn events to safe generic codex tool cards', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'item/collabAgentSpawn/begin',
      params: { itemId: 'agent-1', label: 'Worker 1' },
    });

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'codex_tool_call',
          msg_id: 'agent-1',
          data: expect.objectContaining({
            toolCallId: 'agent-1',
            subtype: 'generic',
            status: 'executing',
            kind: 'execute',
            title: 'Worker 1',
            description: 'Worker 1',
            data: { method: 'item/collabAgentSpawn/begin', params: { itemId: 'agent-1', label: 'Worker 1' } },
          }),
        }),
      }),
    ]);
  });

  it('maps command execution item lifecycle to existing codex command subtypes', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const started = translator.translate({
      jsonrpc: '2.0',
      method: 'item/started',
      params: {
        item: {
          type: 'commandExecution',
          id: 'cmd-2',
          command: ['bun', 'test'],
          cwd: '/workspace',
          status: 'inProgress',
        },
      },
    });
    const completed = translator.translate({
      jsonrpc: '2.0',
      method: 'item/completed',
      params: {
        item: {
          type: 'commandExecution',
          id: 'cmd-2',
          command: ['bun', 'test'],
          cwd: '/workspace',
          status: 'completed',
          aggregatedOutput: 'ok\n',
          exitCode: 0,
          durationMs: 1250,
        },
      },
    });

    expect(started[0]).toEqual(
      expect.objectContaining({
        message: expect.objectContaining({
          type: 'codex_tool_call',
          msg_id: 'cmd-2',
          data: expect.objectContaining({
            toolCallId: 'cmd-2',
            subtype: 'exec_command_begin',
            status: 'executing',
            data: expect.objectContaining({
              call_id: 'cmd-2',
              command: ['bun', 'test'],
              cwd: '/workspace',
            }),
          }),
        }),
      })
    );
    expect(completed[0]).toEqual(
      expect.objectContaining({
        message: expect.objectContaining({
          type: 'codex_tool_call',
          msg_id: 'cmd-2',
          data: expect.objectContaining({
            toolCallId: 'cmd-2',
            subtype: 'exec_command_end',
            status: 'success',
            content: [{ type: 'output', output: 'ok\n' }],
            data: expect.objectContaining({
              call_id: 'cmd-2',
              exit_code: 0,
            }),
          }),
        }),
      })
    );
  });

  it.each([
    ['mcpToolCall', 'item/started', 'mcp_tool_call_begin', 'mcp-1', 'mcp', 'read_file'],
    ['webSearch', 'item/started', 'web_search_begin', 'web-1', 'web_search', 'query docs'],
  ])(
    'maps %s lifecycle events to existing codex tool subtypes',
    (itemType, method, subtype, itemId, kind, description) => {
      const translator = new CodexEventTranslator('conversation-1');

      const events = translator.translate({
        jsonrpc: '2.0',
        method,
        params: {
          item: {
            type: itemType,
            id: itemId,
            server: 'filesystem',
            tool: description,
            query: description,
            status: 'inProgress',
          },
        },
      });

      expect(events[0]).toEqual(
        expect.objectContaining({
          message: expect.objectContaining({
            type: 'codex_tool_call',
            msg_id: itemId,
            data: expect.objectContaining({
              toolCallId: itemId,
              subtype,
              kind,
              status: 'executing',
              description: expect.stringContaining(description),
            }),
          }),
        })
      );
    }
  );

  it.each([
    ['item/mcpToolCall/started', 'mcp_tool_call_begin', 'mcp-1', 'mcp', 'mcp'],
    ['item/webSearch/started', 'web_search_begin', 'web-1', 'web_search', 'web_search'],
  ])('maps %s to a generic native tool call update', (method, subtype, itemId, description, kind) => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method,
      params: { itemId, name: description },
    });

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'codex_tool_call',
          msg_id: itemId,
          data: expect.objectContaining({
            toolCallId: itemId,
            subtype,
            status: 'executing',
            kind,
            description,
          }),
        }),
      }),
    ]);
  });

  it('keeps unknown event fallback as a safe generic codex tool call', () => {
    const translator = new CodexEventTranslator('conversation-1');

    const events = translator.translate({
      jsonrpc: '2.0',
      method: 'unknown/nativeEvent',
      params: { ok: true },
    });

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'message',
        persist: true,
        message: expect.objectContaining({
          type: 'codex_tool_call',
          data: expect.objectContaining({
            status: 'success',
            kind: 'execute',
            subtype: 'generic',
            title: 'unknown/nativeEvent',
            description: 'unknown/nativeEvent',
            data: { method: 'unknown/nativeEvent', params: { ok: true } },
          }),
        }),
      }),
    ]);
  });
});
