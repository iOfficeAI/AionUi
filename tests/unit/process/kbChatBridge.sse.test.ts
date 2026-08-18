/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { createSseParser } from '@/process/bridge/kbChatBridge.sse';

describe('createSseParser', () => {
  it('parses a single delta event', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: {"type":"delta","content":"hello"}\n\n');
    expect(events).toEqual([{ type: 'delta', content: 'hello' }]);
  });

  it('parses done event', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: {"type":"done","messageId":"m1"}\n\n');
    expect(events).toEqual([{ type: 'done', messageId: 'm1' }]);
  });

  it('parses error event', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: {"type":"error","message":"oops"}\n\n');
    expect(events).toEqual([{ type: 'error', message: 'oops' }]);
  });

  it('joins multi-line data fields with \\n', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: {"type":"delta",\ndata: "content":"x"}\n\n');
    expect(events).toEqual([{ type: 'delta', content: 'x' }]);
  });

  it('handles \\r\\n separators', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: {"type":"delta","content":"hi"}\r\n\r\n');
    expect(events).toEqual([{ type: 'delta', content: 'hi' }]);
  });

  it('ignores comment lines starting with :', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed(': this is a comment\ndata: {"type":"delta","content":"x"}\n\n');
    expect(events).toEqual([{ type: 'delta', content: 'x' }]);
  });

  it('emits a parse error event on malformed JSON and continues', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: {not json}\n\ndata: {"type":"delta","content":"ok"}\n\n');
    expect(events).toEqual([
      { type: 'error', code: 'parse', message: 'Invalid SSE JSON' },
      { type: 'delta', content: 'ok' },
    ]);
  });

  it('handles chunks split across feeds (event boundary)', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: {"type":"del');
    parser.feed('ta","content":"split"}\n\n');
    expect(events).toEqual([{ type: 'delta', content: 'split' }]);
  });

  it('emits multiple events from one feed', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: {"type":"delta","content":"a"}\n\ndata: {"type":"delta","content":"b"}\n\n');
    expect(events).toEqual([
      { type: 'delta', content: 'a' },
      { type: 'delta', content: 'b' },
    ]);
  });

  it('handles chunk split in the middle of the trailing separator', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: {"type":"delta","content":"a"}\n');
    parser.feed('\n');
    expect(events).toEqual([{ type: 'delta', content: 'a' }]);
  });

  it('handles multiple events split across many tiny feeds', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    const src = 'data: {"type":"delta","content":"a"}\n\ndata: {"type":"done"}\n\n';
    for (const ch of src) parser.feed(ch);
    expect(events).toEqual([
      { type: 'delta', content: 'a' },
      { type: 'done' },
    ]);
  });
});