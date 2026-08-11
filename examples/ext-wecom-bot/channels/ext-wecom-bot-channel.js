const crypto = require('crypto');
const {
  getLatestStreamByChatId,
  upsertStreamContent,
  finishStream,
  consumeResponseUrl,
  setActivePlugin,
} = require('./state');

function sha1Sign(token, timestamp, nonce, encrypted) {
  const sorted = [token, String(timestamp), String(nonce), encrypted].toSorted();
  return crypto.createHash('sha1').update(sorted.join('')).digest('hex');
}

function decodePkcs7(buffer) {
  const pad = buffer[buffer.length - 1];
  if (pad < 1 || pad > 32) {
    throw new Error('Invalid PKCS7 padding');
  }
  return buffer.subarray(0, buffer.length - pad);
}

function encodePkcs7(buffer) {
  const blockSize = 32;
  const padLen = blockSize - (buffer.length % blockSize || blockSize);
  const pad = Buffer.alloc(padLen, padLen);
  return Buffer.concat([buffer, pad]);
}

function decryptPayload(encodingAesKey, encrypted) {
  const aesKey = Buffer.from(`${encodingAesKey}=`, 'base64');
  const iv = aesKey.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);
  const raw = decodePkcs7(decrypted);
  const body = raw.subarray(16);
  const len = body.subarray(0, 4).readUInt32BE(0);
  return body.subarray(4, 4 + len).toString('utf8');
}

function encryptPayload(encodingAesKey, plainText) {
  const aesKey = Buffer.from(`${encodingAesKey}=`, 'base64');
  const iv = aesKey.subarray(0, 16);
  const random16 = crypto.randomBytes(16);
  const message = Buffer.from(plainText);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(message.length, 0);
  const encoded = encodePkcs7(Buffer.concat([random16, len, message]));
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(encoded), cipher.final()]).toString('base64');
}

function extractText(message) {
  if (!message) return '';
  if (typeof message.text === 'string') return message.text;
  if (message.type === 'text' && typeof message.text === 'string') return message.text;
  if (typeof message.fileName === 'string' && message.fileName) return `[文件] ${message.fileName}`;
  if (typeof message.imageUrl === 'string' && message.imageUrl) return `[图片] ${message.imageUrl}`;
  return '';
}

async function postResponseUrlMessage(url, text) {
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
  return true;
}

class ExtWecomBotChannelPlugin {
  constructor(config) {
    this.config = config || {};
    this.running = false;
    this.messageHandler = null;
    this.activeUsers = new Set();
    this.pendingFinalizeTimers = new Map();
    this.metrics = {
      received: 0,
      streamRefresh: 0,
      sent: 0,
      updated: 0,
      verified: 0,
      lastEventAt: 0,
    };
  }

  onMessage(handler) {
    this.messageHandler = handler;
  }

  async start() {
    this.validateConfig();
    this.running = true;
    setActivePlugin(this);
  }

  async stop() {
    this.running = false;
    setActivePlugin(null);
    for (const timer of this.pendingFinalizeTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingFinalizeTimers.clear();
  }

  isRunning() {
    return this.running;
  }

  getActiveUserCount() {
    return this.activeUsers.size;
  }

  getBotInfo() {
    return { displayName: '企业微信 AI Bot (Example)' };
  }

  verifySignature(signature, timestamp, nonce, encrypted) {
    const token = this.config?.credentials?.token;
    if (!token) return false;
    return sha1Sign(token, timestamp, nonce, encrypted) === signature;
  }

  decrypt(encrypted) {
    return decryptPayload(this.config?.credentials?.encodingAesKey, encrypted);
  }

  buildEncryptedStreamResponse(streamState, timestamp, nonce) {
    const payload = {
      msgtype: 'stream',
      stream: {
        id: streamState.streamId,
        finish: !!streamState.finished,
        content: streamState.visibleContent || '',
      },
    };
    if (streamState.thinkingContent) {
      payload.stream.thinking_content = streamState.thinkingContent;
    }
    const plain = JSON.stringify(payload);
    const encrypted = encryptPayload(this.config?.credentials?.encodingAesKey, plain);
    return {
      encrypt: encrypted,
      msgsignature: sha1Sign(this.config?.credentials?.token, timestamp, nonce, encrypted),
      timestamp: String(timestamp),
      nonce: String(nonce),
    };
  }

  toUnifiedIncomingMessage(payload) {
    const msgType = payload.msgtype || 'text';
    const fromUserId = payload?.from?.userid || payload?.from_userid || payload?.userid || 'wecom-user';
    const fromName = payload?.from?.name || fromUserId;
    const groupId = payload.chatid || '';
    const chatType = payload.chattype || 'single';
    const chatId = groupId || `dm:${fromUserId}`;
    const text = this.extractInboundText(payload);
    return {
      id: payload.msgid || `wecom-${Date.now()}`,
      platform: 'ext-wecom-bot',
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
      raw: payload,
      _wecomMeta: {
        chatType,
      },
    };
  }

  extractInboundText(payload) {
    const msgType = payload.msgtype;
    if (msgType === 'text') {
      return payload?.text?.content || '';
    }
    if (msgType === 'voice') {
      return payload?.voice?.content || '';
    }
    if (msgType === 'mixed') {
      const items = Array.isArray(payload?.mixed?.msg_item) ? payload.mixed.msg_item : [];
      return items
        .map((item) => {
          if (item?.msgtype === 'text') return item?.text?.content || '';
          if (item?.msgtype === 'image') return item?.image?.url ? `[图片] ${item.image.url}` : '';
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    if (msgType === 'image') {
      return payload?.image?.url ? `[图片] ${payload.image.url}` : '[图片]';
    }
    if (msgType === 'file') {
      return payload?.file?.name ? `[文件] ${payload.file.name}` : '[文件]';
    }
    if (msgType === 'location') {
      const name = payload?.location?.name || payload?.location?.label || '';
      const lat = payload?.location?.latitude || '';
      const lng = payload?.location?.longitude || '';
      return name ? `[位置] ${name} (${lat}, ${lng})` : `[位置] ${lat}, ${lng}`;
    }
    return '';
  }

  async handleInboundMessage(payload, streamId) {
    if (!this.running) return;
    if (!this.messageHandler) return;
    const unified = this.toUnifiedIncomingMessage(payload);
    unified.raw = {
      ...payload,
      __streamId: streamId,
    };
    this.activeUsers.add(unified.user.id);
    this.metrics.received += 1;
    this.metrics.lastEventAt = Date.now();
    await this.messageHandler(unified);

    // If ActionExecutor doesn't explicitly finish the message, close stream softly.
    const timer = setTimeout(() => {
      finishStream(streamId);
      this.pendingFinalizeTimers.delete(streamId);
    }, 1200);
    this.pendingFinalizeTimers.set(streamId, timer);
  }

  async sendMessage(chatId, message) {
    if (!this.running) throw new Error('ext-wecom-bot plugin is not running');
    const stream = getLatestStreamByChatId(chatId);
    const text = extractText(message);
    this.metrics.sent += 1;
    this.metrics.lastEventAt = Date.now();

    if (!stream) {
      // Fallback: WeCom response_url can be used once after inbound callback.
      const responseUrl = consumeResponseUrl(chatId);
      if (responseUrl) {
        await postResponseUrlMessage(responseUrl, text);
      }
      return `wecom-msg-${Date.now()}`;
    }

    const isThinking = text.includes('Thinking') || text.includes('思考');
    upsertStreamContent(stream.streamId, {
      visibleContent: isThinking ? '' : text,
      thinkingContent: isThinking ? text : '',
      lastMessageId: `wecom-msg-${Date.now()}`,
      finished: !!message?.replyMarkup,
    });
    if (message?.replyMarkup) {
      clearTimeout(this.pendingFinalizeTimers.get(stream.streamId));
      this.pendingFinalizeTimers.delete(stream.streamId);
    }
    return stream.streamId;
  }

  async editMessage(chatId, messageId, message) {
    if (!this.running) throw new Error('ext-wecom-bot plugin is not running');
    const stream = messageId ? { streamId: messageId } : getLatestStreamByChatId(chatId);
    if (!stream) return;
    const text = extractText(message);
    this.metrics.updated += 1;
    this.metrics.lastEventAt = Date.now();

    const isThinking = text.includes('Thinking') || text.includes('思考');
    upsertStreamContent(stream.streamId, {
      visibleContent: isThinking ? '' : text,
      thinkingContent: isThinking ? text : '',
      finished: !!message?.replyMarkup,
    });
    if (message?.replyMarkup) {
      clearTimeout(this.pendingFinalizeTimers.get(stream.streamId));
      this.pendingFinalizeTimers.delete(stream.streamId);
    }
  }

  validateConfig() {
    const token = this.config?.credentials?.token;
    const aesKey = this.config?.credentials?.encodingAesKey;
    if (!token) throw new Error('ext-wecom-bot: token is required');
    if (!aesKey || typeof aesKey !== 'string' || aesKey.length !== 43) {
      throw new Error('ext-wecom-bot: encodingAesKey must be 43 characters');
    }
  }
}

module.exports = ExtWecomBotChannelPlugin;
