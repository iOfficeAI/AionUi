/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { WeixinChatRequest } from '@process/channels/plugins/weixin/WeixinMonitor';
import { toUnifiedIncomingMessage, stripHtml } from '@process/channels/plugins/weixin/WeixinAdapter';

describe('toUnifiedIncomingMessage', () => {
  const baseRequest: WeixinChatRequest = {
    conversationId: 'user_abc123',
    text: 'Hello world',
  };

  it('maps conversationId to id, chatId, and user.id', () => {
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.id).toBe('user_abc123');
    expect(msg.chatId).toBe('user_abc123');
    expect(msg.user.id).toBe('user_abc123');
  });

  it('uses last 6 chars of conversationId as displayName fallback', () => {
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.user.displayName).toBe('user_abc123'.slice(-6));
  });

  it('sets platform to weixin', () => {
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.platform).toBe('weixin');
  });

  it('maps text to content.text with type text', () => {
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.content.type).toBe('text');
    expect(msg.content.text).toBe('Hello world');
  });

  it('appends attachment markers after the text body', () => {
    const msg = toUnifiedIncomingMessage({
      ...baseRequest,
      attachments: [
        { kind: 'image', name: 'photo', path: '/tmp/photo.png' },
        { kind: 'file', name: 'report.pdf', path: '/tmp/report.pdf' },
      ],
    });

    expect(msg.content.text).toBe('Hello world\n\n[Image: /tmp/photo.png]\n[File "report.pdf": /tmp/report.pdf]');
  });

  it('uses attachment markers as the whole message when no text is present', () => {
    const msg = toUnifiedIncomingMessage({
      conversationId: 'user_abc123',
      attachments: [{ kind: 'file', name: 'notes.txt', path: '/tmp/notes.txt' }],
    });

    expect(msg.content.text).toBe('[File "notes.txt": /tmp/notes.txt]');
  });

  it('provides a numeric timestamp', () => {
    const before = Date.now();
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
  });
});

describe('stripHtml', () => {
  it('strips plain HTML tags', () => {
    expect(stripHtml('<b>bold</b> text')).toBe('bold text');
  });

  it('decodes standard HTML entities', () => {
    expect(stripHtml('Hello &amp; World')).toBe('Hello & World');
    expect(stripHtml('&quot;quoted&quot;')).toBe('"quoted"');
    expect(stripHtml('it&#39;s')).toBe("it's");
    expect(stripHtml('a&nbsp;b')).toBe('a b');
  });

  it('strips entity-encoded tag names (e.g. from code blocks)', () => {
    // &lt;tag&gt; decodes to <tag> which is then stripped — security over fidelity
    expect(stripHtml('Use &lt;b&gt; for bold')).toBe('Use  for bold');
  });

  it('strips entity-encoded HTML tags (XSS vector)', () => {
    expect(stripHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('alert(1)');
    expect(stripHtml('&lt;img src=x onerror=alert(1)&gt;')).toBe('');
  });

  it('strips double-encoded entity tags (&amp;lt;script&amp;gt;)', () => {
    const result = stripHtml('&amp;lt;script&amp;gt;xss&amp;lt;/script&amp;gt;');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
  });

  it('returns plain text without any HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });
});
