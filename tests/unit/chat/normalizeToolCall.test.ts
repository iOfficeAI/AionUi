/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IMessageAcpToolCall, IMessageText, IMessageToolGroup, TMessage } from '@/common/chat/chatLib';
import { extractAgentEditedPaths } from '@/common/chat/normalizeToolCall';

// Minimal typed fixture helpers. The full IMessage<T,C> shape carries fields
// (id, conversation_id, position, ...) that the extractor never reads; we use
// `as unknown as TMessage` to build fixtures without re-typing the union
// surface for every test. The real ToolCallUpdate shape nests the
// `kind | rawInput | content | locations` fields one level deeper, under
// `content.update.*`, so the fixture mirrors that.

const acpToolCall = (
  overrides: Partial<IMessageAcpToolCall['content']['update']> & {
    parentSessionId?: string;
    inputStreaming?: IMessageAcpToolCall['content']['inputStreaming'];
    progress?: IMessageAcpToolCall['content']['progress'];
  }
): IMessageAcpToolCall => {
  const { parentSessionId, inputStreaming, progress, ...updateOverrides } = overrides;
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    conversation_id: 'conv-1',
    type: 'acp_tool_call',
    content: {
      session_id: 's-1',
      update: {
        sessionUpdate: 'tool_call',
        tool_call_id: 'tc-1',
        status: 'completed',
        title: 'edit_file',
        kind: 'edit',
        ...updateOverrides,
      },
      ...(parentSessionId ? { parentSessionId } : {}),
      ...(inputStreaming ? { inputStreaming } : {}),
      ...(progress ? { progress } : {}),
    },
  } as unknown as IMessageAcpToolCall;
};

const toolGroup = (entries: IMessageToolGroup['content']): IMessageToolGroup =>
  ({
    id: `g-${Math.random().toString(36).slice(2)}`,
    conversation_id: 'conv-1',
    type: 'tool_group',
    content: entries,
  }) as unknown as IMessageToolGroup;

const textMessage = (): IMessageText =>
  ({
    id: 't-1',
    conversation_id: 'conv-1',
    type: 'text',
    content: { content: 'hello' },
  }) as unknown as IMessageText;

describe('extractAgentEditedPaths', () => {
  it('extracts file_path from acp_tool_call edit rawInput', () => {
    const messages: TMessage[] = [
      acpToolCall({
        kind: 'edit',
        rawInput: { file_path: 'src/a.ts', content: 'x' },
      }),
    ];
    expect(extractAgentEditedPaths(messages)).toEqual(['src/a.ts']);
  });

  it('extracts path / file_name fallbacks from acp_tool_call edit rawInput', () => {
    const messagesByPath: TMessage[] = [acpToolCall({ kind: 'edit', rawInput: { path: 'src/b.ts' } })];
    expect(extractAgentEditedPaths(messagesByPath)).toEqual(['src/b.ts']);

    const messagesByName: TMessage[] = [acpToolCall({ kind: 'edit', rawInput: { file_name: 'src/c.ts' } })];
    expect(extractAgentEditedPaths(messagesByName)).toEqual(['src/c.ts']);
  });

  it('extracts paths from acp_tool_call update.locations', () => {
    const messages: TMessage[] = [
      acpToolCall({
        kind: 'edit',
        rawInput: { file_path: 'src/a.ts' },
        locations: [{ path: 'src/a.ts' }, { path: 'src/d.ts' }],
      }),
    ];
    expect(extractAgentEditedPaths(messages)).toEqual(['src/a.ts', 'src/d.ts']);
  });

  it('extracts paths from acp_tool_call diff content items', () => {
    const messages: TMessage[] = [
      acpToolCall({
        kind: 'edit',
        rawInput: { file_path: 'src/a.ts' },
        content: [
          { type: 'content', content: { type: 'text', text: 'meta' } },
          { type: 'diff', path: 'src/a.ts', old_text: 'a', new_text: 'b' },
          { type: 'diff', path: 'src/e.ts' },
        ],
      }),
    ];
    expect(extractAgentEditedPaths(messages)).toEqual(['src/a.ts', 'src/e.ts']);
  });

  it('handles acp_tool_call kind=write (forward-compat)', () => {
    const messages: TMessage[] = [
      acpToolCall({
        kind: 'write' as unknown as 'edit',
        rawInput: { file_path: 'src/wrote.ts' },
      }),
    ];
    expect(extractAgentEditedPaths(messages)).toEqual(['src/wrote.ts']);
  });

  it('ignores acp_tool_call with non-edit kinds (read, execute)', () => {
    const messages: TMessage[] = [
      acpToolCall({ kind: 'read', rawInput: { file_path: 'src/read.ts' } }),
      acpToolCall({ kind: 'execute', rawInput: { command: 'ls' } }),
    ];
    expect(extractAgentEditedPaths(messages)).toEqual([]);
  });

  it('extracts file_name from tool_group edit confirmationDetails', () => {
    const messages: TMessage[] = [
      toolGroup([
        {
          call_id: 'tg-1',
          name: 'Edit',
          description: 'edit file',
          render_output_as_markdown: false,
          status: 'Success',
          confirmationDetails: {
            type: 'edit',
            title: 'Edit src/g.ts',
            file_name: 'src/g.ts',
            file_diff: '',
          },
        },
        {
          call_id: 'tg-2',
          name: 'Bash',
          description: 'run',
          render_output_as_markdown: false,
          status: 'Success',
          confirmationDetails: {
            type: 'exec',
            title: 'Run',
            rootCommand: 'bash',
            command: 'ls',
          },
        },
      ]),
    ];
    expect(extractAgentEditedPaths(messages)).toEqual(['src/g.ts']);
  });

  it('dedupes paths that appear across multiple messages and locations', () => {
    const messages: TMessage[] = [
      acpToolCall({ kind: 'edit', rawInput: { file_path: 'src/a.ts' } }),
      acpToolCall({ kind: 'edit', rawInput: { path: 'src/a.ts' } }),
      acpToolCall({
        kind: 'edit',
        rawInput: { file_path: 'src/b.ts' },
        locations: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }],
        content: [
          { type: 'diff', path: 'src/a.ts' },
          { type: 'diff', path: 'src/b.ts' },
        ],
      }),
      toolGroup([
        {
          call_id: 'tg-1',
          name: 'Edit',
          description: '',
          render_output_as_markdown: false,
          status: 'Success',
          confirmationDetails: { type: 'edit', title: '', file_name: 'src/a.ts', file_diff: '' },
        },
      ]),
    ];
    expect(extractAgentEditedPaths(messages)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('ignores non-tool message types', () => {
    const messages: TMessage[] = [textMessage()];
    expect(extractAgentEditedPaths(messages)).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(extractAgentEditedPaths([])).toEqual([]);
  });

  it('does not crash on messages with missing update / malformed content', () => {
    const messages: TMessage[] = [
      {
        id: 'm1',
        conversation_id: 'conv-1',
        type: 'acp_tool_call',
        // `content` is `undefined`-shaped: extractor should treat as no-op
        content: undefined as unknown as IMessageAcpToolCall['content'],
      } as unknown as IMessageAcpToolCall,
      acpToolCall({
        kind: 'edit',
        // rawInput present but no file/path/file_name keys
        rawInput: { unrelated: 'value' },
        locations: undefined,
        content: undefined,
      }),
    ];
    expect(extractAgentEditedPaths(messages)).toEqual([]);
  });
});
