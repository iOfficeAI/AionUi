/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import {
  collectConversationResources,
  parseMessageFileMarker,
} from '@/renderer/pages/conversation/components/ConversationResources/model';
import { describe, expect, it } from 'vitest';

const message = (value: Partial<TMessage> & Pick<TMessage, 'type' | 'content'>): TMessage =>
  ({
    id: crypto.randomUUID(),
    conversation_id: 'conversation-1',
    ...value,
  }) as TMessage;

describe('conversation resources', () => {
  it('parses only a valid local-file marker from a user message', () => {
    expect(parseMessageFileMarker('请查看\n[[AION_FILES]]\n./brief.png\n/docs/spec.md', true)).toEqual({
      text: '请查看',
      files: ['./brief.png', '/docs/spec.md'],
    });
    expect(parseMessageFileMarker('链接\n[[AION_FILES]]\nhttps://example.com/a.png', true)).toEqual({
      text: '链接\n[[AION_FILES]]\nhttps://example.com/a.png',
      files: [],
    });
    expect(parseMessageFileMarker('引用\n[[AION_FILES]]\n[spec](docs/spec.md)', true)).toEqual({
      text: '引用\n[[AION_FILES]]\n[spec](docs/spec.md)',
      files: [],
    });
    expect(parseMessageFileMarker('引用\n[[AION_FILES]]\n`docs/spec.md`', true)).toEqual({
      text: '引用\n[[AION_FILES]]\n`docs/spec.md`',
      files: [],
    });
  });

  it('collects attached sources and completed file outputs with workspace resolution', () => {
    const messages: TMessage[] = [
      message({
        type: 'text',
        position: 'right',
        content: { content: '实现页面\n[[AION_FILES]]\nreferences/mock.png' },
      }),
      message({
        type: 'acp_tool_call',
        content: {
          session_id: 'session-1',
          update: {
            sessionUpdate: 'tool_call_update',
            tool_call_id: 'tool-1',
            status: 'completed',
            title: 'Edit file',
            kind: 'edit',
            content: [{ type: 'diff', path: 'src/App.tsx', old_text: '', new_text: 'export {}' }],
          },
        },
      }),
      message({
        type: 'acp_tool_call',
        content: {
          session_id: 'session-1',
          update: {
            sessionUpdate: 'tool_call_update',
            tool_call_id: 'tool-2',
            status: 'failed',
            title: 'Edit failed',
            kind: 'edit',
            rawInput: { path: 'src/failed.ts' },
          },
        },
      }),
    ];

    expect(collectConversationResources(messages, '/workspace')).toEqual({
      sources: [{ kind: 'file', path: '/workspace/references/mock.png', name: 'mock.png' }],
      outputs: [{ kind: 'file', path: '/workspace/src/App.tsx', name: 'App.tsx' }],
    });
  });

  it('deduplicates output paths and keeps the latest output first', () => {
    const messages: TMessage[] = [
      message({
        type: 'tool_call',
        content: { call_id: '1', name: 'write', args: { file_path: 'a.md' }, status: 'completed' },
      }),
      message({
        type: 'tool_call',
        content: { call_id: '2', name: 'edit', args: { file_path: 'b.md' }, status: 'completed' },
      }),
      message({
        type: 'tool_call',
        content: { call_id: '3', name: 'edit', args: { file_path: 'a.md' }, status: 'completed' },
      }),
    ];

    expect(collectConversationResources(messages, '/workspace').outputs.map((item) => item.name)).toEqual([
      'a.md',
      'b.md',
    ]);
  });

  it('excludes unfinished tool calls from outputs', () => {
    const messages: TMessage[] = [
      message({
        type: 'tool_call',
        content: { call_id: '1', name: 'write_file', args: { file_path: 'running.md' }, status: 'running' },
      }),
      message({
        type: 'tool_call',
        content: { call_id: '2', name: 'write_file', args: { file_path: 'pending.md' } },
      }),
      message({
        type: 'tool_call',
        content: { call_id: '3', name: 'write_file', args: { file_path: 'done.md' }, status: 'completed' },
      }),
      message({
        type: 'tool_call',
        content: {
          call_id: '4',
          name: 'write_file',
          args: { file_path: 'completed-with-error.md' },
          status: 'completed',
          error: 'write failed',
        },
      }),
    ];

    expect(collectConversationResources(messages, '/workspace').outputs).toEqual([
      { kind: 'file', path: '/workspace/done.md', name: 'done.md' },
    ]);
  });

  it('collects web links from assistant text and structured tool sources', () => {
    const messages: TMessage[] = [
      message({
        type: 'text',
        position: 'left',
        content: { content: '参考 [MDN](https://developer.mozilla.org/en-US/docs/Web/API)' },
      }),
      message({
        type: 'tool_group',
        content: [
          {
            call_id: 'tool-1',
            description: 'Browse sources',
            name: 'WebSearch',
            render_output_as_markdown: false,
            status: 'Success',
            confirmationDetails: {
              type: 'info',
              title: 'Sources',
              prompt: 'Browse sources',
              urls: ['https://github.com/openai/codex'],
            },
          },
        ],
      }),
    ];

    expect(collectConversationResources(messages, '/workspace').sources).toEqual([
      {
        kind: 'url',
        url: 'https://developer.mozilla.org/en-US/docs/Web/API',
        name: 'developer.mozilla.org',
      },
      { kind: 'url', url: 'https://github.com/openai/codex', name: 'github.com' },
    ]);
  });

  it('does not treat markdown file paths or failed web tools as sources', () => {
    const messages: TMessage[] = [
      message({
        type: 'text',
        position: 'left',
        content: { content: 'Read [the local spec](docs/spec.md) or /workspace/notes.md.' },
      }),
      message({
        type: 'tool_call',
        content: {
          call_id: 'failed-web',
          name: 'web_fetch',
          args: { url: 'https://example.com/private' },
          status: 'error',
        },
      }),
    ];

    expect(collectConversationResources(messages, '/workspace').sources).toEqual([]);
  });

  it('accepts only successful write-producing tool group results as outputs', () => {
    const messages: TMessage[] = [
      message({
        type: 'tool_group',
        content: [
          {
            call_id: 'read-file',
            description: 'Read a file',
            name: 'ReadFile',
            render_output_as_markdown: false,
            status: 'Success',
            result_display: { file_diff: '', file_name: 'read-only.md' },
          },
          {
            call_id: 'write-file',
            description: 'Write a file',
            name: 'WriteFile',
            render_output_as_markdown: false,
            status: 'Success',
            result_display: { file_diff: '+done', file_name: 'written.md' },
          },
          {
            call_id: 'failed-image',
            description: 'Generate an image',
            name: 'ImageGeneration',
            render_output_as_markdown: false,
            status: 'Error',
            result_display: { img_url: 'data:image/png;base64,abc', relative_path: 'failed.png' },
          },
        ],
      }),
      message({
        type: 'acp_tool_call',
        content: {
          session_id: 'session-1',
          update: {
            sessionUpdate: 'tool_call_update',
            tool_call_id: 'read-output',
            status: 'completed',
            title: 'Read output',
            kind: 'read',
            rawOutput: { saved_path: 'read-result.txt' },
          },
        },
      }),
    ];

    expect(collectConversationResources(messages, '/workspace').outputs).toEqual([
      { kind: 'file', path: '/workspace/written.md', name: 'written.md' },
    ]);
  });

  it('handles a large compact history without changing resource ordering', () => {
    const messages = Array.from({ length: 10_000 }, (_, index) =>
      message({
        type: 'text',
        position: index % 2 === 0 ? 'right' : 'left',
        content: { content: `message ${index}` },
      })
    );
    messages.push(
      message({
        type: 'tool_call',
        content: { call_id: 'large-1', name: 'write_file', args: { file_path: 'first.md' }, status: 'completed' },
      }),
      message({
        type: 'tool_call',
        content: { call_id: 'large-2', name: 'write_file', args: { file_path: 'latest.md' }, status: 'completed' },
      })
    );

    expect(collectConversationResources(messages, '/workspace').outputs.map((item) => item.name)).toEqual([
      'latest.md',
      'first.md',
    ]);
  });
});
