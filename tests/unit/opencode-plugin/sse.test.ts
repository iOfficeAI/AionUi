/**
 * SSE parser + event forwarding filter.
 *
 * Covers spec items 2 (parser correctness across split chunks) and 9
 * (event filter — only the 3 declared types are forwarded).
 */
import { describe, it, expect, vi } from 'vitest';
import { parseSseStream, capPreview, OUTPUT_PREVIEW_MAX } from '../../../packages/opencode-plugin/src/connection.js';
import type { SseDispatchEvent } from '../../../packages/opencode-plugin/src/connection.js';
import { sseResponse, installFetchMock, okHello, okResult } from './_helpers.js';

const collect = async (chunks: string[]): Promise<SseDispatchEvent[]> => {
  const events: SseDispatchEvent[] = [];
  const ac = new AbortController();
  await parseSseStream(sseResponse(chunks).body as ReadableStream<Uint8Array>, (ev) => events.push(ev), ac.signal);
  return events;
};

describe('parseSseStream', () => {
  it('dispatches a ping event', async () => {
    const events = await collect(['event: ping\n', 'data: ping\n\n']);
    expect(events).toEqual([{ type: 'ping' }]);
  });

  it('dispatches a typed context.update event with parsed JSON data', async () => {
    const payload = JSON.stringify({ type: 'context.update', data: { sessionID: 's1', system: ['hello'] } });
    const events = await collect([`event: context.update\ndata: ${payload}\n\n`]);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('context.update');
    expect(events[0]).toMatchObject({ type: 'context.update', data: { sessionID: 's1', system: ['hello'] } });
  });

  it('parses multi-chunk input where lines are split across byte boundaries', async () => {
    // Each chunk contains a partial line + a newline. The parser must
    // reassemble the event across chunks.
    const a = 'event: context.update\nda';
    const b = 'ta: {"type":"context.update","data":{"system":["x"]}}\n\n';
    const events = await collect([a, b]);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('context.update');
    expect(events[0]).toMatchObject({ data: { system: ['x'] } });
  });

  it('handles multiple events delivered in a single chunk', async () => {
    const chunk = 'event: ping\ndata: ping\n\nevent: ping\ndata: ping\n\n';
    const events = await collect([chunk]);
    expect(events).toEqual([{ type: 'ping' }, { type: 'ping' }]);
  });

  it('handles CRLF line endings and ignores comment lines', async () => {
    const events = await collect([': keep-alive\r\n', 'event: ping\r\n', 'data: ping\r\n\r\n']);
    expect(events).toEqual([{ type: 'ping' }]);
  });

  it('falls back to raw dispatch for unparseable data', async () => {
    const events = await collect(['event: custom\ndata: not-json\n\n']);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'raw', event: 'custom', data: 'not-json' });
  });

  it('joins multi-line data fields with newlines', async () => {
    const events = await collect(['data: line1\n', 'data: line2\n\n']);
    expect(events).toEqual([{ type: 'raw', event: 'message', data: 'line1\nline2' }]);
  });
});

describe('capPreview', () => {
  it('returns the input unchanged when within the cap', () => {
    expect(capPreview('short', 100)).toBe('short');
  });

  it('truncates and annotates output when over the cap', () => {
    const big = 'x'.repeat(OUTPUT_PREVIEW_MAX + 50);
    const out = capPreview(big);
    expect(out.length).toBeLessThanOrEqual(OUTPUT_PREVIEW_MAX + 64);
    expect(out.startsWith('xxxx')).toBe(true);
    expect(out).toContain('[truncated');
  });
});

describe('event forwarding filter (event hook)', () => {
  /**
   * Spin up the full plugin via a fake `PluginInput` and check that
   * `event` hook only forwards the three declared event types.
   */
  it('forwards only file.watcher.updated, session.idle, message.part.updated', async () => {
    vi.useRealTimers();
    const emptySse = (): Response =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.close();
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }
      );
    const { calls } = installFetchMock([
      okHello(), // hello
      emptySse(), // SSE connect (immediately closed)
      okResult(),
      okResult(),
      okResult(),
      okResult(),
    ]);

    // Lazy-import so the mock is in place first
    const { ChislPlugin } = await import('../../../packages/opencode-plugin/src/index.js');

    // Build a minimal PluginInput. The plugin uses `client` only via
    // detectServerVersion (best-effort) and SSE.
    const input = {
      client: {} as never,
      project: { id: 'p1', worktree: '/wt', time: { created: 0 } },
      directory: '/proj',
      worktree: '/wt',
      experimental_workspace: { register: () => undefined },
      serverUrl: new URL('http://localhost:3000'),
      $: {} as never,
    };
    const hooks = await ChislPlugin(input, { url: 'https://a.example.com', token: 't' });

    // Wait briefly for the hello + initial SSE connect to register
    await new Promise((r) => setTimeout(r, 50));

    // Snapshot the call count after the initial hello
    const baseline = calls.length;

    const eventHook = hooks.event;
    if (!eventHook) throw new Error('event hook not registered');

    // Send allowed + disallowed event types
    await eventHook({ event: { type: 'file.watcher.updated' } as never });
    await eventHook({ event: { type: 'session.idle' } as never });
    await eventHook({ event: { type: 'message.part.updated' } as never });
    await eventHook({ event: { type: 'session.created' } as never });
    await eventHook({ event: { type: 'message.updated' } as never });

    // Allow the fire-and-forget microtasks to flush
    await new Promise((r) => setTimeout(r, 50));

    const resultCalls = calls
      .slice(baseline)
      .filter((c) => c.url.endsWith('/plugin/result'))
      .map((c) => JSON.parse(c.init.body as string) as { kind: string; event?: { type: string } });

    // Only the 3 allowed types should have produced POSTs
    expect(resultCalls.map((r) => r.kind)).toEqual(['event', 'event', 'event']);
    expect(resultCalls.map((r) => r.event?.type)).toEqual([
      'file.watcher.updated',
      'session.idle',
      'message.part.updated',
    ]);

    // Cleanup: stop the SSE loop
    await hooks.dispose?.();
  });
});
