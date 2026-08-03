/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getAcpArtifactPathAliases,
  getAcpImageFileName,
  getAcpImagePath,
  sanitizeAcpToolCallContent,
} from '@/common/chat/acpToolCallOutput';
import { composeMessage, mergeAcpToolCallContent } from '@/common/chat/chatLib';
import type { IMessageAcpToolCall, TMessage } from '@/common/chat/chatLib';
import { describe, expect, it, vi } from 'vitest';

const createAcpToolCall = (
  rawOutput: IMessageAcpToolCall['content']['update']['rawOutput'],
  id = 'ig_test_image'
): IMessageAcpToolCall => ({
  id,
  msg_id: id,
  conversation_id: 'conv-1',
  type: 'acp_tool_call',
  content: {
    sessionId: 'sess-1',
    update: {
      sessionUpdate: 'tool_call_update',
      tool_call_id: id,
      status: 'completed',
      title: 'Image generation',
      kind: 'execute',
      rawOutput,
    },
  },
});

describe('ACP tool call image output', () => {
  it('omits oversized inline image results and keeps a local image reference', () => {
    const content = createAcpToolCall({
      saved_path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
      result: `iVBORw0KGgo${'A'.repeat(128 * 1024)}`,
    }).content;

    const sanitized = sanitizeAcpToolCallContent(content);

    expect(sanitized.update.rawOutput?.result).toBeUndefined();
    expect(sanitized.update.rawOutput?.result_omitted).toBe(true);
    expect(sanitized.update.rawOutput?.result_omitted_reason).toBe('image_base64');
    expect(sanitized.update.rawOutput?.image).toEqual({
      path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
      mime_type: 'image/png',
      source: 'codex_image_generation',
    });
  });

  it('preserves small raw outputs that are safe to render inline', () => {
    const content = createAcpToolCall({
      saved_path: '/tmp/result.txt',
      result: 'short result',
    }).content;

    const sanitized = sanitizeAcpToolCallContent(content);

    expect(sanitized.update.rawOutput?.result).toBe('short result');
    expect(sanitized.update.rawOutput?.image).toBeUndefined();
  });

  it('truncates oversized non-image results and marks them for on-demand loading', () => {
    const content = createAcpToolCall({
      saved_path: '/tmp/result.txt',
      result: `long text output ${'A'.repeat(128 * 1024)}`,
    }).content;

    const sanitized = sanitizeAcpToolCallContent(content);

    const result = sanitized.update.rawOutput?.result;
    expect(result).toContain('long text output');
    expect(typeof result).toBe('string');
    if (typeof result !== 'string') throw new Error('Expected compacted result to remain a string');
    expect(result.length).toBeLessThanOrEqual(8 * 1024);
    expect((sanitized as typeof sanitized & { _compact?: { truncated?: boolean } })._compact?.truncated).toBe(true);
  });

  it('omits oversized arrays of individually small tool values', () => {
    const content = createAcpToolCall({
      entries: Array.from({ length: 200 }, (_, index) => ({
        path: `/repo/file-${index}.ts`,
        output: 'x'.repeat(2048),
      })),
    }).content;

    const sanitized = sanitizeAcpToolCallContent(content);

    expect(sanitized.update.rawOutput?._omitted).toBe(true);
    expect(sanitized.update.rawOutput?._reason).toBe('payload_too_large');
    expect((sanitized as typeof sanitized & { _compact?: { truncated?: boolean } })._compact?.truncated).toBe(true);
  });

  it('bounds large ACP content output and keeps it available through the compact marker', () => {
    const content = createAcpToolCall(undefined).content;
    content.update.content = Array.from({ length: 40 }, () => ({
      type: 'content',
      content: { type: 'text', text: 'result line '.repeat(1000) },
    }));

    const sanitized = sanitizeAcpToolCallContent(content);

    expect(JSON.stringify(sanitized.update.content ?? []).length).toBeLessThanOrEqual(64 * 1024);
    expect((sanitized as typeof sanitized & { _compact?: { truncated?: boolean } })._compact?.truncated).toBe(true);
  });

  it('omits oversized inline image results even without saved_path', () => {
    const content = createAcpToolCall({
      result: `iVBORw0KGgo${'A'.repeat(128 * 1024)}`,
    }).content;

    const sanitized = sanitizeAcpToolCallContent(content);

    expect(sanitized.update.rawOutput?.result).toBeUndefined();
    expect(sanitized.update.rawOutput?.result_omitted).toBe(true);
    expect(sanitized.update.rawOutput?.image).toBeUndefined();
  });

  it('preserves missing and non-string raw outputs', () => {
    const withoutRawOutput = sanitizeAcpToolCallContent(createAcpToolCall(undefined).content);
    expect(withoutRawOutput.update.rawOutput).toBeUndefined();

    const nonStringResult = sanitizeAcpToolCallContent(
      createAcpToolCall({
        saved_path: '/tmp/result.png',
        result: { value: 'not a base64 string' },
      }).content
    );
    expect(nonStringResult.update.rawOutput?.result).toEqual({ value: 'not a base64 string' });
    expect(nonStringResult.update.rawOutput?.image).toBeUndefined();
  });

  it('omits Grok ReadFile nested image data before live message composition', () => {
    const content = createAcpToolCall({
      type: 'ReadFile',
      image_content: {
        data: `/9j/${'A'.repeat(128 * 1024)}`,
        mime_type: 'image/jpeg',
      },
    }).content;

    const sanitized = sanitizeAcpToolCallContent(content);
    const imageContent = sanitized.update.rawOutput?.image_content as Record<string, unknown>;

    expect(imageContent.data).toBeUndefined();
    expect(imageContent.data_omitted).toBe(true);
    expect(imageContent.data_bytes).toBe(128 * 1024 + 4);
    expect(imageContent.mime_type).toBe('image/jpeg');
  });

  it('sanitizes snake_case raw_output and preserves existing image metadata', () => {
    const content = createAcpToolCall(undefined).content;
    content.update.raw_output = {
      saved_path: '/Users/test/.codex/generated_images/session/ig_test_image.gif',
      image: {
        path: '/custom/preview.gif',
        mime_type: 'image/custom',
        source: 'existing',
      },
      result: `data:image/gif;base64,${'A'.repeat(128 * 1024)}`,
      result_omitted_reason: 'existing_reason',
      result_bytes: 42,
    };

    const sanitized = sanitizeAcpToolCallContent(content);

    expect(sanitized.update.raw_output?.result).toBeUndefined();
    expect(sanitized.update.raw_output?.image).toEqual({
      path: '/custom/preview.gif',
      mime_type: 'image/custom',
      source: 'existing',
    });
    expect(sanitized.update.raw_output?.result_omitted_reason).toBe('existing_reason');
    expect(sanitized.update.raw_output?.result_bytes).toBe(42);
  });

  it('detects jpeg and gif mime types for sanitized image outputs', () => {
    const jpeg = sanitizeAcpToolCallContent(
      createAcpToolCall({
        saved_path: '/Users/test/.codex/generated_images/session/ig_test_image.jpeg',
        result: `/9j/${'A'.repeat(128 * 1024)}`,
      }).content
    );
    const gif = sanitizeAcpToolCallContent(
      createAcpToolCall({
        saved_path: '/Users/test/.codex/generated_images/session/ig_test_image.gif',
        result: `data:image/gif;base64,${'A'.repeat(128 * 1024)}`,
      }).content
    );

    expect(jpeg.update.rawOutput?.image?.mime_type).toBe('image/jpeg');
    expect(gif.update.rawOutput?.image?.mime_type).toBe('image/gif');
  });

  it('sanitizes incoming updates when merging an existing ACP tool call', () => {
    const existing = createAcpToolCall(undefined).content;
    const incoming = createAcpToolCall({
      saved_path: '/Users/test/.codex/generated_images/session/ig_test_image.webp',
      result: `UklGR${'A'.repeat(128 * 1024)}`,
    }).content;

    const merged = mergeAcpToolCallContent(existing, incoming);

    expect(merged.update.rawOutput?.result).toBeUndefined();
    expect(merged.update.rawOutput?.image?.mime_type).toBe('image/webp');
    expect((merged as typeof merged & { _compact?: { truncated?: boolean } })._compact?.truncated).toBe(true);
  });

  it('sanitizes newly inserted ACP tool call messages', () => {
    const message = createAcpToolCall({
      saved_path: '/Users/test/.codex/generated_images/session/ig_test_image.jpg',
      result: `/9j/${'A'.repeat(128 * 1024)}`,
    });

    const list = composeMessage(message, []);

    expect(list).toHaveLength(1);
    const inserted = list[0] as IMessageAcpToolCall;
    expect(inserted.content.update.rawOutput?.result).toBeUndefined();
    expect(inserted.content.update.rawOutput?.image?.mime_type).toBe('image/jpeg');
  });

  it('sanitizes ACP tool call messages appended to a non-empty compose list', () => {
    const textMessage: TMessage = {
      id: 'text-1',
      msg_id: 'text-1',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'left',
      content: {
        content: 'hello',
      },
    };
    const message = createAcpToolCall({
      saved_path: '/Users/test/.codex/generated_images/session/ig_appended.webp',
      result: `UklGR${'A'.repeat(128 * 1024)}`,
    });

    const list = composeMessage(message, [textMessage]);

    expect(list).toHaveLength(2);
    const inserted = list[1] as IMessageAcpToolCall;
    expect(inserted.content.update.rawOutput?.result).toBeUndefined();
    expect(inserted.content.update.rawOutput?.image?.mime_type).toBe('image/webp');
  });

  it('leaves non-ACP compose messages unchanged', () => {
    const message: TMessage = {
      id: 'text-1',
      msg_id: 'text-1',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'left',
      content: {
        content: 'hello',
      },
    };
    const messageHandler = vi.fn();

    const list = composeMessage(message, [], messageHandler);

    expect(list).toEqual([message]);
    expect(messageHandler).toHaveBeenCalledWith('insert', message);
  });

  it('resolves image preview paths with image.path preferred over saved_path', () => {
    expect(
      getAcpImagePath({
        ...createAcpToolCall(undefined).content.update,
        rawOutput: {
          saved_path: '/fallback.png',
          image: {
            path: '/preview.png',
          },
        },
      })
    ).toBe('/preview.png');

    expect(
      getAcpImagePath({
        ...createAcpToolCall(undefined).content.update,
        raw_output: {
          saved_path: '/persisted.png',
        },
      })
    ).toBe('/persisted.png');

    expect(getAcpImagePath(createAcpToolCall(undefined).content.update)).toBeUndefined();
  });

  it('does not resolve non-image saved_path as an image preview path', () => {
    expect(
      getAcpImagePath({
        ...createAcpToolCall(undefined).content.update,
        rawOutput: {
          saved_path: '/tmp/result.txt',
        },
      })
    ).toBeUndefined();

    expect(
      getAcpImagePath({
        ...createAcpToolCall(undefined).content.update,
        rawOutput: {
          saved_path: '/tmp/result.txt',
          result_omitted_reason: 'image_base64',
        },
      })
    ).toBe('/tmp/result.txt');
  });

  it('resolves Grok ImageGen paths from persisted raw output', () => {
    expect(
      getAcpImagePath({
        ...createAcpToolCall(undefined).content.update,
        rawOutput: {
          type: 'ImageGen',
          path: 'C:\\Users\\test\\.grok\\sessions\\session-1\\images\\1.jpg',
        },
      })
    ).toBe('C:\\Users\\test\\.grok\\sessions\\session-1\\images\\1.jpg');

    expect(
      getAcpImagePath({
        ...createAcpToolCall(undefined).content.update,
        rawOutput: {
          type: 'ReadFile',
          path: 'C:\\tmp\\screenshot.png',
        },
      })
    ).toBeUndefined();
  });

  it('maps Grok relative artifact links to the absolute ImageGen output path', () => {
    const absolutePath = 'C:\\Users\\test\\.grok\\sessions\\session-1\\images\\1.jpg';
    const aliases = getAcpArtifactPathAliases({
      ...createAcpToolCall(undefined).content.update,
      rawOutput: {
        type: 'ImageGen',
        path: absolutePath,
        filename: '1.jpg',
        session_folder: 'images',
      },
    });

    expect(aliases['images/1.jpg']).toBe(absolutePath);
    expect(aliases['1.jpg']).toBe(absolutePath);
  });

  it('maps generic local artifacts but ignores relative paths and remote URLs', () => {
    const absolutePath = 'C:\\Users\\test\\workspace\\video\\clip.mp4';
    expect(
      getAcpArtifactPathAliases({
        ...createAcpToolCall(undefined).content.update,
        rawOutput: { path: absolutePath },
      })
    ).toMatchObject({
      'clip.mp4': absolutePath,
      'video/clip.mp4': absolutePath,
    });

    expect(
      getAcpArtifactPathAliases({
        ...createAcpToolCall(undefined).content.update,
        rawOutput: { path: 'images/1.jpg', saved_path: 'https://example.com/1.jpg' },
      })
    ).toEqual({});
  });

  it('resolves Grok ReadFile image paths without retaining nested base64', () => {
    const update = {
      ...createAcpToolCall(undefined).content.update,
      raw_input: {
        target_file: 'C:\\Users\\test\\workspace\\images\\grok-self.jpg',
      },
      rawOutput: {
        type: 'ReadFile',
        image_content: {
          data_omitted: true,
          data_bytes: 399040,
          mime_type: 'image/jpeg',
        },
      },
    };

    expect(getAcpImagePath(update)).toBe('C:\\Users\\test\\workspace\\images\\grok-self.jpg');
  });

  it('falls back to a generated image file name when the path has no file name', () => {
    expect(getAcpImageFileName('/')).toBe('generated-image.png');
  });
});
