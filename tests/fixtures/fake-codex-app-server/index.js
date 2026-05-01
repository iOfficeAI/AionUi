#!/usr/bin/env node

const readline = require('node:readline');

const rl = readline.createInterface({ input: process.stdin });
let initialized = false;
let pendingUnsupportedRequestId;
let pendingUnsupportedOriginalId;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

rl.on('line', (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line);

  if (pendingUnsupportedRequestId && request.id === pendingUnsupportedRequestId) {
    const receivedError = Boolean(request.error);
    success(pendingUnsupportedOriginalId, { ok: receivedError, response: request });
    pendingUnsupportedRequestId = undefined;
    pendingUnsupportedOriginalId = undefined;
    return;
  }

  if (request.method === 'initialize') {
    success(request.id, {
      serverInfo: { name: 'fake-codex-app-server', version: '0.0.0-test' },
    });
    return;
  }

  if (request.method === 'initialized') {
    initialized = true;
    return;
  }

  if (request.method === 'thread/start') {
    if (!initialized) {
      send({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32002, message: 'thread/start received before initialized notification' },
      });
      return;
    }
    success(request.id, { thread: { id: 'thread-1' } });
    return;
  }

  if (request.method === 'thread/resume') {
    success(request.id, { thread: { id: request.params.threadId } });
    return;
  }

  if (request.method === 'turn/start') {
    success(request.id, { turn: { id: 'turn-1' } });
    send({
      jsonrpc: '2.0',
      method: 'turn/started',
      params: { threadId: 'thread-1', turnId: 'turn-1' },
    });
    send({
      jsonrpc: '2.0',
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'msg-1', delta: 'hello' },
    });
    send({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    });
    return;
  }

  if (request.method === 'server/request/unsupported') {
    pendingUnsupportedRequestId = 'server-request-1';
    pendingUnsupportedOriginalId = request.id;
    send({ jsonrpc: '2.0', id: pendingUnsupportedRequestId, method: 'client/unknown', params: {} });
    return;
  }

  if (request.method === 'turn/interrupt') {
    success(request.id, { interrupted: true });
    return;
  }

  if (request.method === 'model/list') {
    success(request.id, { models: [{ id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex' }] });
    return;
  }

  success(request.id, {});
});
