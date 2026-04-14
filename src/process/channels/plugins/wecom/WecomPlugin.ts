/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePlugin } from '../BasePlugin';
import { decryptPayload, encryptPayload, sha1Sign } from './WecomCrypto';
import {
  consumeResponseUrl,
  finishStream,
  getLatestStreamByChatId,
  getStream,
  setActiveWecomPlugin,
  upsertStreamContent,
} from './WecomStreamState';
import type { WecomStreamRecord } from './WecomStreamState';
import type { IChannelPluginConfig, IUnifiedIncomingMessage, IUnifiedOutgoingMessage, PluginType } from '../../types';
import AiBot from '@wecom/aibot-node-sdk';

const WECOM_CALLBACK_PATH = '/channels/wecom/webhook';

function extractOutgoingText(message: IUnifiedOutgoingMessage): string {
  if (message.type === 'text' && typeof message.text === 'string') {
    return message.text;
  }
  return '';
}

async function postResponseUrlMessage(url: string, text: string): Promise<void> {
  const payload = {
    msgtype: 'markdown',
    markdown: {
      content: text || '',
    },
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`response_url send failed: HTTP ${response.status} ${body}`.trim());
  }
}

/**
 * Enterprise WeChat (WeCom) AI Bot channel plugin.
 *
 * Uses the official encrypted callback (GET verify + POST JSON { encrypt }) and
 * stream-mode JSON responses documented for WeCom intelligent bots.
 *
 * Requires WebUI HTTP server to be running so {@link WECOM_CALLBACK_PATH} is reachable.
 */
export class WecomPlugin extends BasePlugin {
  readonly type: PluginType = 'wecom';

  private mode: 'webhook' | 'websocket' = 'webhook';
  private token = '';
  private encodingAesKey = '';

  private botId = '';
  private secret = '';
  private wsClient: unknown | null = null;
  private readonly wsActiveUsers = new Set<string>();
  private readonly wsContexts = new Map<string, { frameHeaders: { headers: { req_id: string } }; streamId: string }>();

  private readonly activeUsers = new Set<string>();
  private readonly pendingFinalizeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly metrics = {
    received: 0,
    streamRefresh: 0,
    sent: 0,
    updated: 0,
    verified: 0,
    lastEventAt: 0,
  };

  isRunning(): boolean {
    return this._status === 'running';
  }

  /** Public URL path (relative to WebUI base) for the management console. */
  static getCallbackPath(): string {
    return WECOM_CALLBACK_PATH;
  }

  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const botId = config.credentials?.botId?.trim();
    const secret = config.credentials?.secret?.trim();
    const token = config.credentials?.token?.trim();
    const encodingAesKey = config.credentials?.encodingAesKey?.trim();

    if (botId && secret) {
      this.mode = 'websocket';
      this.botId = botId;
      this.secret = secret;
      return;
    }

    this.mode = 'webhook';
    if (!token) {
      throw new Error('WeCom: callback Token is required');
    }
    if (!encodingAesKey || encodingAesKey.length !== 43) {
      throw new Error('WeCom: EncodingAESKey must be 43 characters (from WeCom admin)');
    }
    this.token = token;
    this.encodingAesKey = encodingAesKey;
  }

  protected async onStart(): Promise<void> {
    if (this.mode === 'websocket') {
      await this.startWebsocket();
      return;
    }
    setActiveWecomPlugin(this);
  }

  protected async onStop(): Promise<void> {
    if (this.mode === 'websocket') {
      this.stopWebsocket();
      return;
    }
    setActiveWecomPlugin(null);
    for (const timer of this.pendingFinalizeTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingFinalizeTimers.clear();
  }

  verifySignature(signature: string, timestamp: string, nonce: string, encrypted: string): boolean {
    if (!this.token) return false;
    return sha1Sign(this.token, timestamp, nonce, encrypted) === signature;
  }

  decrypt(encrypted: string): string {
    return decryptPayload(this.encodingAesKey, encrypted);
  }

  buildEncryptedStreamResponse(
    streamState: WecomStreamRecord,
    timestamp: string,
    nonce: string
  ): { encrypt: string; msgsignature: string; timestamp: string; nonce: string } {
    const payload: Record<string, unknown> = {
      msgtype: 'stream',
      stream: {
        id: streamState.streamId,
        finish: !!streamState.finished,
        content: streamState.visibleContent || '',
      },
    };
    if (streamState.thinkingContent) {
      (payload.stream as Record<string, unknown>).thinking_content = streamState.thinkingContent;
    }
    const plain = JSON.stringify(payload);
    const encrypted = encryptPayload(this.encodingAesKey, plain);
    const tsNum = Number(timestamp);
    const resolvedTs = Number.isFinite(tsNum) ? tsNum : Math.floor(Date.now() / 1000);
    const n = String(nonce);
    return {
      encrypt: encrypted,
      msgsignature: sha1Sign(this.token, String(resolvedTs), n, encrypted),
      timestamp: String(resolvedTs),
      nonce: n,
    };
  }

  private extractInboundText(payload: Record<string, unknown>): string {
    const msgType = typeof payload.msgtype === 'string' ? payload.msgtype : 'text';
    if (msgType === 'text') {
      const text = payload.text as { content?: string } | undefined;
      return text?.content || '';
    }
    if (msgType === 'voice') {
      const voice = payload.voice as { content?: string } | undefined;
      return voice?.content || '';
    }
    if (msgType === 'mixed') {
      const mixed = payload.mixed as { msg_item?: Array<Record<string, unknown>> } | undefined;
      const items = Array.isArray(mixed?.msg_item) ? mixed.msg_item : [];
      return items
        .map((item) => {
          if (item?.msgtype === 'text') {
            const t = item.text as { content?: string } | undefined;
            return t?.content || '';
          }
          if (item?.msgtype === 'image') {
            const im = item.image as { url?: string } | undefined;
            return im?.url ? `[图片] ${im.url}` : '';
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    if (msgType === 'image') {
      const image = payload.image as { url?: string } | undefined;
      return image?.url ? `[图片] ${image.url}` : '[图片]';
    }
    if (msgType === 'file') {
      const file = payload.file as { name?: string } | undefined;
      return file?.name ? `[文件] ${file.name}` : '[文件]';
    }
    if (msgType === 'location') {
      const loc = payload.location as
        | { name?: string; label?: string; latitude?: string; longitude?: string }
        | undefined;
      const name = loc?.name || loc?.label || '';
      const lat = loc?.latitude || '';
      const lng = loc?.longitude || '';
      return name ? `[位置] ${name} (${lat}, ${lng})` : `[位置] ${lat}, ${lng}`;
    }
    return '';
  }

  private toUnifiedIncomingMessage(payload: Record<string, unknown>): IUnifiedIncomingMessage {
    const msgType = typeof payload.msgtype === 'string' ? payload.msgtype : 'text';
    const from = payload.from as { userid?: string; name?: string } | undefined;
    const fromUserId =
      from?.userid ||
      (payload.from_userid as string | undefined) ||
      (payload.userid as string | undefined) ||
      'wecom-user';
    const fromName = from?.name || fromUserId;
    const groupId = typeof payload.chatid === 'string' ? payload.chatid : '';
    const chatType = typeof payload.chattype === 'string' ? payload.chattype : 'single';
    const chatId = groupId || `dm:${fromUserId}`;
    const text = this.extractInboundText(payload);
    return {
      id: (typeof payload.msgid === 'string' && payload.msgid) || `wecom-${Date.now()}`,
      platform: 'wecom',
      chatId,
      user: {
        id: fromUserId,
        displayName: fromName,
      },
      content: {
        type: msgType === 'command' ? 'command' : 'text',
        text,
      },
      timestamp: Date.now(),
      raw: { ...payload, _wecomChatType: chatType },
    };
  }

  async handleInboundMessage(payload: Record<string, unknown>, streamId: string): Promise<void> {
    if (!this.messageHandler) return;
    const unified = this.toUnifiedIncomingMessage(payload);
    unified.raw = {
      ...payload,
      __streamId: streamId,
      _wecomChatType: typeof payload.chattype === 'string' ? payload.chattype : 'single',
    };
    this.activeUsers.add(unified.user.id);
    this.metrics.received += 1;
    this.metrics.lastEventAt = Date.now();
    await this.messageHandler(unified);

    const timer = setTimeout(() => {
      finishStream(streamId);
      this.pendingFinalizeTimers.delete(streamId);
    }, 1200);
    this.pendingFinalizeTimers.set(streamId, timer);
  }

  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    if (this.mode === 'websocket') {
      await this.wsUpsertStream(chatId, extractOutgoingText(message), !!message.replyMarkup);
      const ctx = this.wsContexts.get(chatId);
      return ctx?.streamId || `wecomws-msg-${Date.now()}`;
    }

    const stream = getLatestStreamByChatId(chatId);
    const text = extractOutgoingText(message);
    this.metrics.sent += 1;
    this.metrics.lastEventAt = Date.now();

    if (!stream) {
      const responseUrl = consumeResponseUrl(chatId);
      if (responseUrl) {
        await postResponseUrlMessage(responseUrl, text);
      }
      return `wecom-msg-${Date.now()}`;
    }

    const isThinking = text.startsWith('⏳ Thinking...');
    upsertStreamContent(stream.streamId, {
      visibleContent: isThinking ? '' : text,
      thinkingContent: isThinking ? text : '',
      lastMessageId: `wecom-msg-${Date.now()}`,
      finished: !!message.replyMarkup,
    });
    if (message.replyMarkup) {
      const t = this.pendingFinalizeTimers.get(stream.streamId);
      if (t) clearTimeout(t);
      this.pendingFinalizeTimers.delete(stream.streamId);
    }
    return stream.streamId;
  }

  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    if (this.mode === 'websocket') {
      await this.wsUpsertStream(chatId, extractOutgoingText(message), !!message.replyMarkup, messageId);
      return;
    }

    const stream = messageId ? getStream(messageId) : getLatestStreamByChatId(chatId);
    if (!stream) return;
    const text = extractOutgoingText(message);
    this.metrics.updated += 1;
    this.metrics.lastEventAt = Date.now();

    const isThinking = text.startsWith('⏳ Thinking...');
    upsertStreamContent(stream.streamId, {
      visibleContent: isThinking ? '' : text,
      thinkingContent: isThinking ? text : '',
      finished: !!message.replyMarkup,
    });
    if (message.replyMarkup) {
      const t = this.pendingFinalizeTimers.get(stream.streamId);
      if (t) clearTimeout(t);
      this.pendingFinalizeTimers.delete(stream.streamId);
    }
  }

  getActiveUserCount(): number {
    return this.mode === 'websocket' ? this.wsActiveUsers.size : this.activeUsers.size;
  }

  getBotInfo(): { username?: string; displayName: string } | null {
    return { displayName: this.mode === 'websocket' ? 'WeCom (WS)' : 'WeCom' };
  }

  private async startWebsocket(): Promise<void> {
    const WSClientCtor = (AiBot as unknown as { WSClient?: new (opts: Record<string, unknown>) => unknown }).WSClient;
    if (!WSClientCtor) {
      throw new Error('WeCom: WSClient not found in SDK');
    }
    const client = new WSClientCtor({ botId: this.botId, secret: this.secret });

    const emitter = client as unknown as {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      connect?: () => unknown;
      disconnect?: () => unknown;
    };
    if (!emitter.on || !emitter.connect) {
      throw new Error('WeCom: SDK client missing on/connect methods');
    }

    emitter.on('authenticated', () => {
      this.metrics.lastEventAt = Date.now();
    });
    emitter.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.setError(msg);
      console.error('[WecomPlugin][WS] error:', err);
    });

    const handleMsg = (frame: unknown) => {
      void this.handleWsMessageFrame(frame).catch((error) => {
        console.error('[WecomPlugin][WS] handle message frame failed:', error);
      });
    };

    emitter.on('message.text', handleMsg);
    emitter.on('message.voice', handleMsg);
    emitter.on('message.mixed', handleMsg);
    emitter.on('message.image', handleMsg);
    emitter.on('message.file', handleMsg);
    emitter.on('message.video', handleMsg);

    // (Optional) welcome message. Keep minimal: no auto-welcome to avoid extra behavior.

    emitter.connect();
    this.wsClient = client;
  }

  private stopWebsocket(): void {
    this.wsContexts.clear();
    this.wsActiveUsers.clear();
    const client = this.wsClient as unknown as { disconnect?: () => unknown };
    client?.disconnect?.();
    this.wsClient = null;
  }

  private getWsReqId(frame: unknown): string | null {
    if (!frame || typeof frame !== 'object') return null;
    const headers = (frame as { headers?: unknown }).headers;
    const reqId = headers && typeof headers === 'object' ? (headers as { req_id?: unknown }).req_id : undefined;
    return typeof reqId === 'string' && reqId.trim() ? reqId : null;
  }

  private getWsFrameHeaders(frame: unknown): { headers: { req_id: string } } | null {
    const reqId = this.getWsReqId(frame);
    return reqId ? { headers: { req_id: reqId } } : null;
  }

  private getWsBody(frame: unknown): Record<string, unknown> {
    if (!frame || typeof frame !== 'object') return {};
    const body = (frame as { body?: unknown }).body;
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  }

  private async handleWsMessageFrame(frame: unknown): Promise<void> {
    if (!this.messageHandler) return;
    const frameHeaders = this.getWsFrameHeaders(frame);
    const payload = this.getWsBody(frame);
    const unified = this.toUnifiedIncomingMessage(payload);

    this.wsActiveUsers.add(unified.user.id);
    this.metrics.received += 1;
    this.metrics.lastEventAt = Date.now();

    if (frameHeaders) {
      const streamId = `wecomws-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.wsContexts.set(unified.chatId, { frameHeaders, streamId });
    }

    // Non-blocking like other plugins
    void this.messageHandler(unified).catch((error) =>
      console.error('[WecomPlugin][WS] messageHandler failed:', error)
    );
  }

  private async wsUpsertStream(
    chatId: string,
    text: string,
    finish: boolean,
    streamIdOverride?: string
  ): Promise<void> {
    const ctx = this.wsContexts.get(chatId);
    if (!ctx || !this.wsClient) return;
    const streamId = streamIdOverride || ctx.streamId;
    const client = this.wsClient as unknown as {
      replyStream?: (
        frame: { headers: { req_id: string } },
        streamId: string,
        content: string,
        finish?: boolean
      ) => Promise<unknown>;
    };
    if (!client.replyStream) return;
    await client.replyStream(ctx.frameHeaders, streamId, text || '', finish);
  }
}
