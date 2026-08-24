/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  parseSessionMessageBlock,
  parseSessionsBlock,
} from '@/renderer/pages/conversation/Messages/components/sessionMarkers';

describe('parseSessionsBlock', () => {
  it('strips the block from the visible text and returns the chips', () => {
    const content = [
      '问下他那边接口定完了没',
      '',
      '[[AION_SESSIONS]]',
      '重构-鉴权模块\tconv_1\tworkspace: same',
      '[[/AION_SESSIONS]]',
    ].join('\n');
    const parsed = parseSessionsBlock(content);
    expect(parsed.text).toBe('问下他那边接口定完了没');
    expect(parsed.sessions).toEqual([{ name: '重构-鉴权模块', id: 'conv_1', workspace: 'same' }]);
  });

  it('never leaves a bare marker in the rendered text', () => {
    // The backend persists the block VERBATIM into the user's own message, so
    // failing to strip it shows raw markers in the sender's own bubble.
    const content = 'hi\n\n[[AION_SESSIONS]]\nA\tconv_1\tworkspace: same\n[[/AION_SESSIONS]]';
    expect(parseSessionsBlock(content).text).not.toContain('AION_SESSIONS');
  });

  it('leaves a message without the block untouched', () => {
    expect(parseSessionsBlock('plain text')).toEqual({ text: 'plain text', sessions: [] });
  });

  it('parses several targets', () => {
    const content = [
      'hi',
      '',
      '[[AION_SESSIONS]]',
      'A\tconv_1\tworkspace: same',
      'B\tconv_2\tworkspace: /w/b（与你不同）',
      '[[/AION_SESSIONS]]',
    ].join('\n');
    const parsed = parseSessionsBlock(content);
    expect(parsed.sessions).toEqual([
      { name: 'A', id: 'conv_1', workspace: 'same' },
      { name: 'B', id: 'conv_2', workspace: '/w/b（与你不同）' },
    ]);
  });

  it('does not swallow content when the closing marker is missing', () => {
    // A truncated block must degrade to showing the text, not eat the message.
    const content = 'hi\n\n[[AION_SESSIONS]]\nA\tconv_1\tworkspace: same';
    const parsed = parseSessionsBlock(content);
    expect(parsed.sessions).toEqual([]);
    expect(parsed.text).toBe(content);
  });

  it('skips malformed lines rather than producing half-built chips', () => {
    const content = [
      'hi',
      '',
      '[[AION_SESSIONS]]',
      'no tabs here',
      'A\tconv_1\tworkspace: same',
      '[[/AION_SESSIONS]]',
    ].join('\n');
    expect(parseSessionsBlock(content).sessions).toEqual([{ name: 'A', id: 'conv_1', workspace: 'same' }]);
  });

  it('handles an empty block', () => {
    const content = 'hi\n\n[[AION_SESSIONS]]\n[[/AION_SESSIONS]]';
    const parsed = parseSessionsBlock(content);
    expect(parsed.sessions).toEqual([]);
    expect(parsed.text).toBe('hi');
  });
});

describe('parseSessionMessageBlock', () => {
  it('extracts the source and strips the block', () => {
    const content = [
      '[[AION_SESSION_MESSAGE]]',
      'from: 重构-鉴权模块\tconv_1',
      'workspace: same',
      'reply_to: conv_1\t（回信: session send-message, to=reply_to）',
      '[[/AION_SESSION_MESSAGE]]',
      '',
      '接口定完了吗？',
    ].join('\n');
    const parsed = parseSessionMessageBlock(content);
    expect(parsed.text).toBe('接口定完了吗？');
    expect(parsed.source).toEqual({
      fromName: '重构-鉴权模块',
      fromId: 'conv_1',
      workspace: 'same',
      replyTo: 'conv_1',
    });
  });

  it('returns a null source for an ordinary message', () => {
    expect(parseSessionMessageBlock('hello').source).toBeNull();
  });

  it('keeps a cross-workspace warning value intact', () => {
    const content = [
      '[[AION_SESSION_MESSAGE]]',
      'from: A\tconv_1',
      'workspace: /w/a（与你不同，勿用相对路径，勿假设可读）',
      'reply_to: conv_1\t（回信: session send-message, to=reply_to）',
      '[[/AION_SESSION_MESSAGE]]',
      '',
      'body',
    ].join('\n');
    expect(parseSessionMessageBlock(content).source?.workspace).toContain('与你不同');
  });

  it('does not swallow the body when the closing marker is missing', () => {
    const content = '[[AION_SESSION_MESSAGE]]\nfrom: A\tconv_1\nworkspace: same';
    const parsed = parseSessionMessageBlock(content);
    expect(parsed.source).toBeNull();
    expect(parsed.text).toBe(content);
  });

  it('leaves a multi-line body intact', () => {
    const content = [
      '[[AION_SESSION_MESSAGE]]',
      'from: A\tconv_1',
      'workspace: same',
      'reply_to: conv_1\t（回信）',
      '[[/AION_SESSION_MESSAGE]]',
      '',
      'line one',
      'line two',
    ].join('\n');
    expect(parseSessionMessageBlock(content).text).toBe('line one\nline two');
  });

  it('never leaves a bare marker in the rendered text', () => {
    const content = [
      '[[AION_SESSION_MESSAGE]]',
      'from: A\tconv_1',
      'workspace: same',
      'reply_to: conv_1\t（回信）',
      '[[/AION_SESSION_MESSAGE]]',
      '',
      'body',
    ].join('\n');
    expect(parseSessionMessageBlock(content).text).not.toContain('AION_SESSION_MESSAGE');
  });
});

describe('the two markers do not interfere', () => {
  it('a delivered message that itself used `@@` renders both parts', () => {
    // B receives a delivery, and A's original message carried its own
    // `[[AION_SESSIONS]]` block. Both must resolve.
    const content = [
      '[[AION_SESSION_MESSAGE]]',
      'from: A\tconv_1',
      'workspace: same',
      'reply_to: conv_1\t（回信）',
      '[[/AION_SESSION_MESSAGE]]',
      '',
      'ask them',
      '',
      '[[AION_SESSIONS]]',
      'C\tconv_3\tworkspace: same',
      '[[/AION_SESSIONS]]',
    ].join('\n');
    const delivered = parseSessionMessageBlock(content);
    expect(delivered.source?.fromId).toBe('conv_1');
    const mentions = parseSessionsBlock(delivered.text);
    expect(mentions.sessions).toEqual([{ name: 'C', id: 'conv_3', workspace: 'same' }]);
    expect(mentions.text).toBe('ask them');
  });
});
