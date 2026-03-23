import { describe, expect, it } from 'vitest';
import type { ChatRequest } from 'weixin-agent-sdk';
import { toUnifiedIncomingMessage, toChatResponse } from '@process/channels/plugins/weixin/WeixinAdapter';
import type { IUnifiedOutgoingMessage } from '@process/channels/types';

// ==================== toUnifiedIncomingMessage ====================

describe('toUnifiedIncomingMessage', () => {
  const baseRequest: ChatRequest = {
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

  it('provides a numeric timestamp', () => {
    const before = Date.now();
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('maps image media to photo attachment', () => {
    const req: ChatRequest = {
      conversationId: 'user_abc123',
      text: '',
      media: { type: 'image', filePath: '/tmp/photo.jpg', mimeType: 'image/jpeg' },
    };
    const msg = toUnifiedIncomingMessage(req);
    expect(msg.content.type).toBe('photo');
    expect(msg.content.attachments?.[0].type).toBe('photo');
    expect(msg.content.attachments?.[0].fileId).toBe('/tmp/photo.jpg');
    expect(msg.content.attachments?.[0].mimeType).toBe('image/jpeg');
  });

  it('maps audio media to audio attachment', () => {
    const req: ChatRequest = {
      conversationId: 'user_abc123',
      text: '',
      media: { type: 'audio', filePath: '/tmp/voice.wav', mimeType: 'audio/wav' },
    };
    const msg = toUnifiedIncomingMessage(req);
    expect(msg.content.type).toBe('audio');
    expect(msg.content.attachments?.[0].type).toBe('audio');
  });

  it('maps video media to video attachment', () => {
    const req: ChatRequest = {
      conversationId: 'user_abc123',
      text: '',
      media: { type: 'video', filePath: '/tmp/video.mp4', mimeType: 'video/mp4' },
    };
    const msg = toUnifiedIncomingMessage(req);
    expect(msg.content.type).toBe('video');
    expect(msg.content.attachments?.[0].type).toBe('video');
  });

  it('maps file media to document attachment with fileName', () => {
    const req: ChatRequest = {
      conversationId: 'user_abc123',
      text: '',
      media: { type: 'file', filePath: '/tmp/doc.pdf', mimeType: 'application/pdf', fileName: 'doc.pdf' },
    };
    const msg = toUnifiedIncomingMessage(req);
    expect(msg.content.type).toBe('document');
    expect(msg.content.attachments?.[0].type).toBe('document');
    expect(msg.content.attachments?.[0].fileName).toBe('doc.pdf');
  });
});

// ==================== toChatResponse ====================

describe('toChatResponse', () => {
  it('maps text message', () => {
    const msg: IUnifiedOutgoingMessage = { type: 'text', text: 'Hello' };
    const resp = toChatResponse(msg);
    expect(resp.text).toBe('Hello');
    expect(resp.media).toBeUndefined();
  });

  it('maps image message', () => {
    const msg: IUnifiedOutgoingMessage = { type: 'image', imageUrl: 'https://example.com/pic.jpg' };
    const resp = toChatResponse(msg);
    expect(resp.media?.type).toBe('image');
    expect(resp.media?.url).toBe('https://example.com/pic.jpg');
  });

  it('maps file message with fileName', () => {
    const msg: IUnifiedOutgoingMessage = { type: 'file', fileUrl: '/tmp/doc.pdf', fileName: 'doc.pdf' };
    const resp = toChatResponse(msg);
    expect(resp.media?.type).toBe('file');
    expect(resp.media?.url).toBe('/tmp/doc.pdf');
    expect(resp.media?.fileName).toBe('doc.pdf');
  });

  it('ignores buttons and replyMarkup', () => {
    const msg: IUnifiedOutgoingMessage = {
      type: 'buttons',
      text: 'Choose',
      buttons: [[{ label: 'Yes', action: 'yes' }]],
    };
    const resp = toChatResponse(msg);
    expect(resp.text).toBe('Choose');
    expect(resp.media).toBeUndefined();
  });
});
