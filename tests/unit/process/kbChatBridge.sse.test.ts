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
    parser.feed('data: eyJ0eXBlIjoiZGVsdGEiLCJjb250ZW50IjoiaGVsbG8ifQ==\n\n');
    expect(events).toEqual([{ type: 'delta', content: 'hello' }]);
  });

  it('parses done event', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: eyJ0eXBlIjoiZG9uZSIsIm1lc3NhZ2VJZCI6Im0xIn0=\n\n');
    expect(events).toEqual([{ type: 'done', messageId: 'm1' }]);
  });

  it('parses error event', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: eyJ0eXBlIjoiZXJyb3IiLCJtZXNzYWdlIjoib29wcyJ9\n\n');
    expect(events).toEqual([{ type: 'error', message: 'oops' }]);
  });

  it('joins multi-line data fields with \\n', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    // Plain JSON split across two data: lines (the SSE protocol allows this
    // regardless of whether the payload is base64-encoded; it is the parser's
    // job to reassemble the lines with \n between them).
    parser.feed('data: {"type":"delta",\ndata: "content":"x"}\n\n');
    expect(events).toEqual([{ type: 'delta', content: 'x' }]);
  });

  it('handles \\r\\n separators', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: eyJ0eXBlIjoiZGVsdGEiLCJjb250ZW50IjoiaGkifQ==\r\n\r\n');
    expect(events).toEqual([{ type: 'delta', content: 'hi' }]);
  });

  it('ignores comment lines starting with :', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed(': this is a comment\ndata: eyJ0eXBlIjoiZGVsdGEiLCJjb250ZW50IjoieCJ9\n\n');
    expect(events).toEqual([{ type: 'delta', content: 'x' }]);
  });

  it('emits a parse error event on malformed JSON and continues', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: e25vdCBqc29ufQ==\n\ndata: eyJ0eXBlIjoiZGVsdGEiLCJjb250ZW50Ijoib2sifQ==\n\n');
    const errorEvent = events[0] as { type: string; code?: string; message?: string };
    expect(errorEvent.type).toBe('error');
    expect(errorEvent.code).toBe('parse');
    expect(events[1]).toEqual({ type: 'delta', content: 'ok' });
  });

  it('handles chunks split across feeds (event boundary)', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: eyJ0eXBlIjoiZGVs');
    parser.feed('dGEiLCJjb250ZW50Ijoic3BsaXQifQ==\n\n');
    expect(events).toEqual([{ type: 'delta', content: 'split' }]);
  });

  it('emits multiple events from one feed', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: eyJ0eXBlIjoiZGVsdGEiLCJjb250ZW50IjoiYSJ9\n\ndata: eyJ0eXBlIjoiZGVsdGEiLCJjb250ZW50IjoiYiJ9\n\n');
    expect(events).toEqual([
      { type: 'delta', content: 'a' },
      { type: 'delta', content: 'b' },
    ]);
  });

  it('handles chunk split in the middle of the trailing separator', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    parser.feed('data: eyJ0eXBlIjoiZGVsdGEiLCJjb250ZW50IjoiYSJ9\n');
    parser.feed('\n');
    expect(events).toEqual([{ type: 'delta', content: 'a' }]);
  });

  it('handles multiple events split across many tiny feeds', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    const src = 'data: eyJ0eXBlIjoiZGVsdGEiLCJjb250ZW50IjoiYSJ9\n\ndata: eyJ0eXBlIjoiZG9uZSJ9\n\n';
    for (const ch of src) parser.feed(ch);
    expect(events).toEqual([{ type: 'delta', content: 'a' }, { type: 'done' }]);
  });

  it('normalizes the non-streaming backend shape {done, message.content}', () => {
    const events: unknown[] = [];
    const parser = createSseParser((e) => events.push(e));
    // base64 of {"done":true,"message":{"content":"根据现有知识库，暂未找到相关答案","isHistory":0,"role":"assistant"}}
    parser.feed(
      'data: eyJkb25lIjp0cnVlLCJtZXNzYWdlIjp7ImNvbnRlbnQiOiLmoLnmja7njrDmnInnn6Xor4blupPvvIzmmoLmnKrmib7liLDnm7jlhbPnrZTmoYgiLCJpc0hpc3RvcnkiOjAsInJvbGUiOiJhc3Npc3RhbnQifX0=\n\n'
    );
    expect(events).toEqual([{ type: 'delta', content: '根据现有知识库，暂未找到相关答案' }, { type: 'done' }]);
  });
});
