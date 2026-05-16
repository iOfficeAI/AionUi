const DEFAULT_THINKING_TEXT = '思考中...';
const STREAM_IDLE_MS = 30_000;
const STREAM_TTL_MS = 5 * 60_000;
const EVENT_TTL_MS = 5 * 60_000;
const RESPONSE_URL_TTL_MS = 55 * 60_000;

let activePlugin = null;
const streamStore = new Map();
const eventDeduper = new Map();
const responseUrlStore = new Map();

function now() {
  return Date.now();
}

function createStream(streamId, chatId, initialText = DEFAULT_THINKING_TEXT) {
  const ts = now();
  const record = {
    streamId,
    chatId,
    visibleContent: '',
    thinkingContent: initialText || DEFAULT_THINKING_TEXT,
    finished: false,
    createdAt: ts,
    updatedAt: ts,
    lastMessageId: null,
    finalizedAt: 0,
  };
  streamStore.set(streamId, record);
  return record;
}

function getStream(streamId) {
  return streamStore.get(streamId) || null;
}

function getLatestStreamByChatId(chatId) {
  if (!chatId) return null;
  let latest = null;
  for (const stream of streamStore.values()) {
    if (stream.chatId !== chatId) continue;
    if (!latest || stream.updatedAt > latest.updatedAt) {
      latest = stream;
    }
  }
  return latest;
}

function upsertStreamContent(streamId, payload) {
  const stream = getStream(streamId);
  if (!stream) return null;
  if (typeof payload.visibleContent === 'string') {
    stream.visibleContent = payload.visibleContent;
  }
  if (typeof payload.thinkingContent === 'string') {
    stream.thinkingContent = payload.thinkingContent;
  }
  if (typeof payload.lastMessageId === 'string') {
    stream.lastMessageId = payload.lastMessageId;
  }
  if (payload.finished === true) {
    stream.finished = true;
    stream.finalizedAt = now();
  }
  stream.updatedAt = now();
  return stream;
}

function finishStream(streamId) {
  return upsertStreamContent(streamId, { finished: true, thinkingContent: '' });
}

function shouldDropDuplicate(eventId) {
  if (!eventId) return false;
  const ts = eventDeduper.get(eventId);
  const current = now();
  if (ts && current - ts < EVENT_TTL_MS) {
    return true;
  }
  eventDeduper.set(eventId, current);
  return false;
}

function registerResponseUrl(chatId, responseUrl) {
  const normalizedChatId = String(chatId || '').trim();
  const normalizedUrl = String(responseUrl || '').trim();
  if (!normalizedChatId || !normalizedUrl) return;
  responseUrlStore.set(normalizedChatId, {
    url: normalizedUrl,
    expiresAt: now() + RESPONSE_URL_TTL_MS,
    used: false,
    createdAt: now(),
  });
}

function consumeResponseUrl(chatId) {
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) return null;
  const record = responseUrlStore.get(normalizedChatId);
  if (!record) return null;
  if (record.used || record.expiresAt <= now()) {
    responseUrlStore.delete(normalizedChatId);
    return null;
  }
  // WeCom response_url is single-use.
  record.used = true;
  responseUrlStore.set(normalizedChatId, record);
  return record.url;
}

function cleanupExpiredRecords() {
  const current = now();

  for (const [eventId, ts] of eventDeduper.entries()) {
    if (current - ts > EVENT_TTL_MS) {
      eventDeduper.delete(eventId);
    }
  }

  for (const [streamId, stream] of streamStore.entries()) {
    const age = current - stream.updatedAt;
    if (stream.finished) {
      if (age > STREAM_IDLE_MS) {
        streamStore.delete(streamId);
      }
      continue;
    }
    if (age > STREAM_TTL_MS) {
      streamStore.delete(streamId);
    }
  }

  for (const [chatId, record] of responseUrlStore.entries()) {
    if (record.expiresAt <= current || record.used) {
      responseUrlStore.delete(chatId);
    }
  }
}

function setActivePlugin(plugin) {
  activePlugin = plugin || null;
}

function getActivePlugin() {
  return activePlugin;
}

module.exports = {
  DEFAULT_THINKING_TEXT,
  createStream,
  getStream,
  getLatestStreamByChatId,
  upsertStreamContent,
  finishStream,
  registerResponseUrl,
  consumeResponseUrl,
  shouldDropDuplicate,
  cleanupExpiredRecords,
  setActivePlugin,
  getActivePlugin,
};
