/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall, IMessageToolCall } from '@/common/chat/chatLib';
import { normalizeAcpToolCall, normalizeToolMessages } from '@/common/chat/normalizeToolCall';
import { describe, expect, it } from 'vitest';

describe('normalizeAcpToolCall', () => {
  it('preserves generated image paths for grouped tool summaries', () => {
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
            },
          },
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: 'Revised prompt: 一张小猫照片',
              },
            },
          ],
        },
      },
    };

    const normalized = normalizeAcpToolCall(message);

    expect((normalized as { imagePath?: string } | undefined)?.imagePath).toBe(
      '/Users/test/.codex/generated_images/session/ig_test_image.png'
    );
  });

  it('keeps one turn tool previews within the 256 KiB aggregate budget', () => {
    const messages: IMessageToolCall[] = Array.from({ length: 40 }, (_, index) => ({
      id: `tool-${index}`,
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: `tool-${index}`,
        name: 'Read',
        args: {},
        status: 'completed',
        output: 'x'.repeat(8 * 1024),
      },
    }));

    const normalized = normalizeToolMessages(messages);
    const previewBytes = normalized.reduce(
      (total, item) => total + (item.description?.length ?? 0) + (item.input?.length ?? 0) + (item.output?.length ?? 0),
      0
    );

    expect(previewBytes).toBeLessThanOrEqual(256 * 1024);
    expect(normalized.some((item) => item.truncated)).toBe(true);
    expect(normalized.at(-1)?.output).toBeUndefined();
  });

  it('limits a single generic tool preview field to 8 KiB', () => {
    const normalized = normalizeToolMessages([
      {
        id: 'tool-large',
        conversation_id: 'conv-1',
        type: 'tool_call',
        content: {
          call_id: 'tool-large',
          name: 'Shell',
          args: {},
          status: 'completed',
          output: '界'.repeat(16 * 1024),
        },
      },
    ]);

    expect(normalized[0].output?.length).toBeLessThanOrEqual(8 * 1024);
    expect(normalized[0].output).toContain('...[truncated]');
    expect(normalized[0].truncated).toBe(true);
  });

  it('preserves Codex image generation paths for grouped tool summaries', () => {
    const imagePath = String.raw`C:\Users\test\.codex\generated_images\session\image.png`;
    const normalized = normalizeToolMessages([
      {
        id: 'image-call',
        conversation_id: 'conv-1',
        type: 'tool_call',
        content: {
          call_id: 'image-call',
          name: 'imageGeneration',
          args: {},
          status: 'completed',
          output: imagePath,
        },
      },
    ]);

    expect(normalized[0].imagePath).toBe(imagePath);
  });

  it('does not treat non-image tool output as a local image', () => {
    const normalized = normalizeToolMessages([
      {
        id: 'shell-call',
        conversation_id: 'conv-1',
        type: 'tool_call',
        content: {
          call_id: 'shell-call',
          name: 'Shell',
          args: {},
          status: 'completed',
          output: String.raw`C:\Users\test\notes.png`,
        },
      },
    ]);

    expect(normalized[0].imagePath).toBeUndefined();
  });
});
