import { describe, expect, it } from 'vitest';
import { CodexEventTranslator } from '@/process/agent/codex/appserver/CodexEventTranslator';

describe('CodexEventTranslator native tool events', () => {
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

  it('keeps unknown event fallback as a native unknown codex tool call', () => {
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
            subtype: 'native_unknown_event',
            description: 'unknown/nativeEvent',
            data: { method: 'unknown/nativeEvent', params: { ok: true } },
          }),
        }),
      }),
    ]);
  });
});
