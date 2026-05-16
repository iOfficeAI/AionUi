const {
  DEFAULT_THINKING_TEXT,
  createStream,
  getStream,
  upsertStreamContent,
  finishStream,
  shouldDropDuplicate,
  registerResponseUrl,
  cleanupExpiredRecords,
  getActivePlugin,
} = require('../channels/state');

function parseBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  return null;
}

function toChatId(payload) {
  const fromUserId = payload?.from?.userid || payload?.from_userid || payload?.userid || 'wecom-user';
  return payload?.chatid || `dm:${fromUserId}`;
}

module.exports = async function extWecomWebhook(req, res) {
  cleanupExpiredRecords();

  const plugin = getActivePlugin();
  if (!plugin || !plugin.isRunning()) {
    return res.status(503).json({ ok: false, message: 'ext-wecom-bot plugin is not running' });
  }

  const msgSignature = String(req.query.msg_signature || '');
  const timestamp = String(req.query.timestamp || '');
  const nonce = String(req.query.nonce || '');

  if (!msgSignature || !timestamp || !nonce) {
    return res.status(400).send('missing query signature params');
  }

  if (req.method === 'GET') {
    const echostr = String(req.query.echostr || '');
    if (!echostr) {
      return res.status(400).send('missing echostr');
    }
    const ok = plugin.verifySignature(msgSignature, timestamp, nonce, echostr);
    if (!ok) {
      return res.status(403).send('signature mismatch');
    }
    try {
      const verified = plugin.decrypt(echostr);
      plugin.metrics.verified += 1;
      return res.type('text/plain').send(verified);
    } catch (error) {
      return res.status(400).send(`decrypt verify failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).send('method not allowed');
  }

  const body = parseBody(req);
  if (!body || typeof body.encrypt !== 'string' || !body.encrypt) {
    return res.status(400).send('invalid body: missing encrypt');
  }

  if (!plugin.verifySignature(msgSignature, timestamp, nonce, body.encrypt)) {
    return res.status(403).send('signature mismatch');
  }

  let payload;
  try {
    payload = JSON.parse(plugin.decrypt(body.encrypt));
  } catch (error) {
    return res.status(400).send(`decrypt body failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (payload.msgtype === 'stream' && payload.stream?.id) {
    plugin.metrics.streamRefresh += 1;
    plugin.metrics.lastEventAt = Date.now();
    const streamId = String(payload.stream.id);
    const stream = getStream(streamId);
    if (!stream) {
      const expired = createStream(streamId, 'expired');
      upsertStreamContent(streamId, {
        visibleContent: '会话已过期',
        thinkingContent: '',
        finished: true,
      });
      return res.json(plugin.buildEncryptedStreamResponse(expired, timestamp, nonce));
    }
    return res.json(plugin.buildEncryptedStreamResponse(stream, timestamp, nonce));
  }

  const eventId = String(payload.msgid || '');
  if (eventId && shouldDropDuplicate(eventId)) {
    return res.type('text/plain').send('success');
  }

  const chatId = toChatId(payload);
  if (typeof payload.response_url === 'string' && payload.response_url.trim()) {
    registerResponseUrl(chatId, payload.response_url.trim());
  }
  const streamId = `ext-wecom-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stream = createStream(streamId, chatId, DEFAULT_THINKING_TEXT);

  // Respond immediately with stream id. Continue inbound handling asynchronously.
  res.json(plugin.buildEncryptedStreamResponse(stream, timestamp, nonce));

  plugin.handleInboundMessage(payload, streamId).catch((error) => {
    upsertStreamContent(streamId, {
      visibleContent: `处理失败: ${error instanceof Error ? error.message : String(error)}`,
      thinkingContent: '',
    });
    finishStream(streamId);
  });
};
