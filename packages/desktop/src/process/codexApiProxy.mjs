#!/usr/bin/env node
/**
 * Codex Responses API → Chat Completions API local proxy.
 *
 * Codex CLI requires `wire_api = "responses"` (OpenAI Responses API format),
 * but the POUNDING API only supports the Chat Completions API for the
 * `deepseek-v4-pro` model. This proxy translates between the two formats,
 * including SSE streaming support.
 *
 * Usage: node codex-api-proxy.mjs --port 18792 --upstream https://api.mxou.cn/v1
 */

import http from 'node:http';

const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const PORT = parseInt(getArg('--port') || '18792', 10);
const UPSTREAM = (getArg('--upstream') || 'https://api.mxou.cn/v1').replace(/\/+$/, '');
const API_KEY = getArg('--api-key') || process.env.POUNDING_API_KEY || '';

// ── Translation: Responses API → Chat Completions ──────────────────────────

function responsesToChatCompletions(body) {
  const input = body.input;
  let messages = [];

  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') {
        messages.push({ role: 'user', content: item });
      } else if (item.role) {
        // Map 'developer' role to 'system' (POUNDING API compatibility)
        const role = item.role === 'developer' ? 'system' : item.role;
        let content = item.content;
        if (Array.isArray(content)) {
          content = content.map((part) => ({
            ...part,
            type: part.type === 'input_text' ? 'text' : part.type,
          }));
        }
        messages.push({ role, content });
      } else if (item.content) {
        messages.push({ role: 'user', content: item.content });
      }
    }
  }

  const req = {
    model: body.model,
    messages,
  };

  if (body.max_output_tokens) req.max_tokens = body.max_output_tokens;
  if (body.temperature != null) req.temperature = body.temperature;
  if (body.top_p != null) req.top_p = body.top_p;
  if (body.instructions) {
    req.messages.unshift({ role: 'system', content: body.instructions });
  }
  if (body.stop) req.stop = body.stop;
  // Always non-streaming for REST; streaming handled separately via SSE
  req.stream = false;

  return req;
}

function chatCompletionToResponse(ccResp, model) {
  const choice = ccResp.choices?.[0] ?? {};
  const message = choice.message ?? {};

  const output = [];
  if (message.content) {
    output.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: message.content }],
    });
  }
  if (message.reasoning_content) {
    output.push({
      type: 'reasoning',
      summary: [{ type: 'summary_text', text: message.reasoning_content }],
    });
  }

  return {
    id: ccResp.id?.replace('chatcmpl-', 'resp_') ?? 'resp_proxy',
    object: 'response',
    created_at: ccResp.created,
    model: ccResp.model ?? model,
    output,
    status: 'completed',
    usage: ccResp.usage
      ? {
          input_tokens: ccResp.usage.prompt_tokens ?? 0,
          output_tokens: ccResp.usage.completion_tokens ?? 0,
          total_tokens: ccResp.usage.total_tokens ?? 0,
          input_tokens_details: { cached_tokens: ccResp.usage.prompt_tokens_details?.cached_tokens ?? 0 },
          output_tokens_details: { reasoning_tokens: ccResp.usage.completion_tokens_details?.reasoning_tokens ?? 0 },
        }
      : undefined,
  };
}

// ── HTTP Proxy ─────────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  try {
    // ── /v1/models ────────────────────────────────────────────────────
    if (req.method === 'GET' && path === '/v1/models') {
      const upstreamResp = await fetch(`${UPSTREAM}/models`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await upstreamResp.json();

      // Enrich model metadata so Codex doesn't show "Model metadata for
      // X not found. Defaulting to fallback metadata" warnings.
      // The POUNDING API only returns {id, object, created, owned_by}
      // but Codex expects context_window, max_output_tokens, etc.
      const METADATA = {
        'deepseek-v4-pro': { context_window: 256000, max_output_tokens: 32000, pricing: { prompt: 0, completion: 0 } },
        'deepseek-v4-flash': {
          context_window: 256000,
          max_output_tokens: 32000,
          pricing: { prompt: 0, completion: 0 },
        },
        'mimo-v2.5': { context_window: 256000, max_output_tokens: 16384, pricing: { prompt: 0, completion: 0 } },
        'mimo-v2.5-pro': { context_window: 256000, max_output_tokens: 16384, pricing: { prompt: 0, completion: 0 } },
        'MiniMax-M2.7-highspeed': {
          context_window: 256000,
          max_output_tokens: 16384,
          pricing: { prompt: 0, completion: 0 },
        },
        'doubao-seed-1-8-251228': {
          context_window: 128000,
          max_output_tokens: 16384,
          pricing: { prompt: 0, completion: 0 },
        },
        'agnes-2.0-flash': { context_window: 128000, max_output_tokens: 16384, pricing: { prompt: 0, completion: 0 } },
      };

      if (Array.isArray(data.data)) {
        data.data = data.data.map((m) => {
          const meta = METADATA[m.id];
          if (meta) {
            return { ...m, ...meta };
          }
          // For unknown models, provide reasonable defaults
          return { ...m, context_window: 256000, max_output_tokens: 16384 };
        });
      }

      res.writeHead(upstreamResp.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // ── /v1/responses ─────────────────────────────────────────────────
    if (req.method === 'POST' && path === '/v1/responses') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const responsesReq = JSON.parse(body);
      const isStream = responsesReq.stream !== false;

      console.log(
        `[proxy] ${responsesReq.model}: stream=${isStream} ${JSON.stringify(responsesReq.input).slice(0, 100)}...`
      );

      if (!isStream) {
        // ── Non-streaming (simple JSON) ──────────────────────────────
        const chatReq = responsesToChatCompletions(responsesReq);
        const upstreamResp = await fetch(`${UPSTREAM}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify(chatReq),
        });

        const ccResp = await upstreamResp.json();

        if (!upstreamResp.ok) {
          console.error(`[proxy] upstream error:`, JSON.stringify(ccResp).slice(0, 200));
          res.writeHead(upstreamResp.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(ccResp));
          return;
        }

        const responsesResp = chatCompletionToResponse(ccResp, responsesReq.model);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responsesResp));
        console.log(`[proxy] OK: ${responsesResp.output?.[0]?.content?.[0]?.text?.slice(0, 80) ?? '(no text)'}`);
        return;
      }

      // ── Streaming (Server-Sent Events) ─────────────────────────────
      const chatReq = responsesToChatCompletions(responsesReq);
      chatReq.stream = true;
      chatReq.stream_options = { include_usage: true };

      const upstreamResp = await fetch(`${UPSTREAM}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(chatReq),
      });

      if (!upstreamResp.ok) {
        const errText = await upstreamResp.text();
        console.error(`[proxy] upstream stream error:`, errText.slice(0, 200));
        res.writeHead(upstreamResp.status, { 'Content-Type': 'application/json' });
        res.end(errText);
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const responseId = 'resp_' + Date.now();
      const msgItemId = 'msg_' + Date.now();
      res.write(
        `event: response.created\ndata: ${JSON.stringify({
          type: 'response.created',
          response: {
            id: responseId,
            object: 'response',
            model: responsesReq.model,
            status: 'in_progress',
            output: [],
          },
        })}\n\n`
      );

      // Send output_item.added BEFORE any deltas — Codex requires this
      // to create an active item that output_text.delta events can target.
      res.write(
        `event: response.output_item.added\ndata: ${JSON.stringify({
          type: 'response.output_item.added',
          output_index: 0,
          item: { id: msgItemId, type: 'message', role: 'assistant', status: 'in_progress', content: [] },
        })}\n\n`
      );

      res.write(
        `event: response.content_part.added\ndata: ${JSON.stringify({
          type: 'response.content_part.added',
          item_id: msgItemId,
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: '' },
        })}\n\n`
      );

      // Read SSE stream from upstream
      const reader = upstreamResp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let fullReasoning = '';
      let usageInfo = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const chunk = JSON.parse(data);
              const delta = chunk.choices?.[0]?.delta;
              if (delta?.content) {
                fullContent += delta.content;
                res.write(
                  `event: response.output_text.delta\ndata: ${JSON.stringify({
                    type: 'response.output_text.delta',
                    item_id: msgItemId,
                    output_index: 0,
                    content_index: 0,
                    delta: delta.content,
                  })}\n\n`
                );
              }
              if (delta?.reasoning_content) fullReasoning += delta.reasoning_content;
              if (chunk.usage) usageInfo = chunk.usage;
            } catch (e) {
              /* skip malformed */
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Emit terminal lifecycle events required by the Responses API spec.
      // Without these, Codex CLI does not "commit" the accumulated delta text.
      res.write(
        `event: response.output_text.done\ndata: ${JSON.stringify({
          type: 'response.output_text.done',
          item_id: msgItemId,
          output_index: 0,
          content_index: 0,
          text: fullContent,
        })}\n\n`
      );

      res.write(
        `event: response.content_part.done\ndata: ${JSON.stringify({
          type: 'response.content_part.done',
          item_id: msgItemId,
          output_index: 0,
          content_index: 0,
        })}\n\n`
      );

      res.write(
        `event: response.output_item.done\ndata: ${JSON.stringify({
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            id: msgItemId,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: fullContent }],
          },
        })}\n\n`
      );

      const output = [];
      if (fullContent)
        output.push({
          id: msgItemId,
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: fullContent }],
        });
      if (fullReasoning) output.push({ type: 'reasoning', summary: [{ type: 'summary_text', text: fullReasoning }] });

      res.write(
        `event: response.completed\ndata: ${JSON.stringify({
          type: 'response.completed',
          response: {
            id: responseId,
            object: 'response',
            model: responsesReq.model,
            status: 'completed',
            output,
            usage: usageInfo
              ? {
                  input_tokens: usageInfo.prompt_tokens ?? 0,
                  output_tokens: usageInfo.completion_tokens ?? 0,
                  total_tokens: usageInfo.total_tokens ?? 0,
                  input_tokens_details: { cached_tokens: usageInfo.prompt_tokens_details?.cached_tokens ?? 0 },
                  output_tokens_details: {
                    reasoning_tokens: usageInfo.completion_tokens_details?.reasoning_tokens ?? 0,
                  },
                }
              : undefined,
          },
        })}\n\n`
      );

      res.end();
      console.log(`[proxy] STREAM OK: "${fullContent.slice(0, 80)}"`);
      return;
    }

    // ── Fallback: direct proxy ────────────────────────────────────────
    let reqBody = '';
    for await (const chunk of req) {
      reqBody += chunk;
    }

    const upstreamUrl = `${UPSTREAM}${path}`;
    const upstreamResp = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: reqBody || undefined,
    });

    const data = await upstreamResp.text();
    res.writeHead(upstreamResp.status, {
      'Content-Type': upstreamResp.headers.get('content-type') || 'application/json',
    });
    res.end(data);
  } catch (err) {
    console.error(`[proxy] error:`, err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: err.message, type: 'proxy_error' } }));
  }
}

// ── Port conflict handling ──────────────────────────────────────────────────

function tryListen(port, maxRetries = 10) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(handleRequest);
    srv.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && maxRetries > 0) {
        console.log(`[proxy] Port ${port} in use, trying ${port + 1}...`);
        srv.close();
        resolve(tryListen(port + 1, maxRetries - 1));
        return;
      }
      reject(err);
    });
    srv.listen(port, '127.0.0.1', () => {
      // Write the actual port to stdout so the parent process can read it.
      // The parent (CodexProxyManager) parses this line to discover the port.
      console.log(`[proxy] PORT=${port}`);
      console.log(`[proxy] Codex API proxy listening on http://127.0.0.1:${port}`);
      console.log(`[proxy] Upstream: ${UPSTREAM}`);
      console.log(`[proxy] Model: deepseek-v4-pro (Responses → Chat Completions with SSE streaming)`);
      resolve(srv);
    });
  });
}

tryListen(PORT).catch((err) => {
  console.error(`[proxy] Failed to start:`, err.message);
  process.exit(1);
});
