/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import { apiRateLimiter } from '../middleware/security';
import {
  cleanupExpiredRecords,
  createStream,
  DEFAULT_THINKING_TEXT,
  finishStream,
  getActiveWecomPlugin,
  getStream,
  registerResponseUrl,
  shouldDropDuplicate,
  upsertStreamContent,
} from '@process/channels/plugins/wecom/WecomStreamState';

const WECOM_WEBHOOK_PATH = '/channels/wecom/webhook';

function parseBody(req: Request): Record<string, unknown> | null {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  return null;
}

function toChatId(payload: Record<string, unknown>): string {
  const from = payload.from as { userid?: string } | undefined;
  const fromUserId =
    from?.userid ||
    (payload.from_userid as string | undefined) ||
    (payload.userid as string | undefined) ||
    'wecom-user';
  return typeof payload.chatid === 'string' && payload.chatid ? payload.chatid : `dm:${fromUserId}`;
}

/**
 * Enterprise WeChat AI Bot encrypted callback endpoint.
 * No JWT: WeCom servers call this URL with msg_signature / timestamp / nonce.
 */
export function registerWecomChannelRoutes(app: Express): void {
  app.get(WECOM_WEBHOOK_PATH, apiRateLimiter, wecomWebhookHandler);
  app.post(WECOM_WEBHOOK_PATH, apiRateLimiter, wecomWebhookHandler);
}

async function wecomWebhookHandler(req: Request, res: Response): Promise<void> {
  cleanupExpiredRecords();

  const plugin = getActiveWecomPlugin();
  if (!plugin || !plugin.isRunning()) {
    res.status(503).json({ ok: false, message: 'WeCom channel plugin is not running' });
    return;
  }

  const msgSignature = String(req.query.msg_signature || '');
  const timestamp = String(req.query.timestamp || '');
  const nonce = String(req.query.nonce || '');

  if (!msgSignature || !timestamp || !nonce) {
    res.status(400).send('missing query signature params');
    return;
  }

  if (req.method === 'GET') {
    const echostr = String(req.query.echostr || '');
    if (!echostr) {
      res.status(400).send('missing echostr');
      return;
    }
    const ok = plugin.verifySignature(msgSignature, timestamp, nonce, echostr);
    if (!ok) {
      res.status(403).send('signature mismatch');
      return;
    }
    try {
      const verified = plugin.decrypt(echostr);
      plugin.metrics.verified += 1;
      res.type('text/plain').send(verified);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(400).send(`decrypt verify failed: ${msg}`);
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('method not allowed');
    return;
  }

  const body = parseBody(req);
  if (!body || typeof body.encrypt !== 'string' || !body.encrypt) {
    res.status(400).send('invalid body: missing encrypt');
    return;
  }

  if (!plugin.verifySignature(msgSignature, timestamp, nonce, body.encrypt)) {
    res.status(403).send('signature mismatch');
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(plugin.decrypt(body.encrypt)) as Record<string, unknown>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).send(`decrypt body failed: ${msg}`);
    return;
  }

  if (payload.msgtype === 'stream' && payload.stream && typeof (payload.stream as { id?: string }).id === 'string') {
    plugin.metrics.streamRefresh += 1;
    plugin.metrics.lastEventAt = Date.now();
    const streamId = String((payload.stream as { id: string }).id);
    const stream = getStream(streamId);
    if (!stream) {
      const expired = createStream(streamId, 'expired');
      upsertStreamContent(streamId, {
        visibleContent: '会话已过期',
        thinkingContent: '',
        finished: true,
      });
      res.json(plugin.buildEncryptedStreamResponse(expired, timestamp, nonce));
      return;
    }
    res.json(plugin.buildEncryptedStreamResponse(stream, timestamp, nonce));
    return;
  }

  const eventId = typeof payload.msgid === 'string' ? payload.msgid : '';
  if (eventId && shouldDropDuplicate(eventId)) {
    res.type('text/plain').send('success');
    return;
  }

  const chatId = toChatId(payload);
  const responseUrl = payload.response_url;
  if (typeof responseUrl === 'string' && responseUrl.trim()) {
    registerResponseUrl(chatId, responseUrl.trim());
  }

  const streamId = `wecom-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stream = createStream(streamId, chatId, DEFAULT_THINKING_TEXT);

  res.json(plugin.buildEncryptedStreamResponse(stream, timestamp, nonce));

  plugin.handleInboundMessage(payload, streamId).catch((error) => {
    upsertStreamContent(streamId, {
      visibleContent: `处理失败: ${error instanceof Error ? error.message : String(error)}`,
      thinkingContent: '',
    });
    finishStream(streamId);
  });
}
