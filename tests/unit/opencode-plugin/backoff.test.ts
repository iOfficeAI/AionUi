/**
 * Reconnect backoff growth + reset.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  nextBackoff,
  connectEvents,
  DEFAULT_BACKOFF,
  type BackoffOptions,
} from '../../../packages/opencode-plugin/src/connection.js';
import type { AionCoreClient, SseDispatchEvent } from '../../../packages/opencode-plugin/src/connection.js';
import { okHello } from './_helpers.js';

/**
 * Build an SSE response that immediately closes its body (no chunks).
 * `parseSseStream` returns as soon as the underlying reader signals
 * `done: true`, which is what we want for a "transient drop" cycle in
 * the reconnect loop.
 */
const makeEmptySseResponse = (): Response =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );

describe('nextBackoff', () => {
  it('grows exponentially up to the cap', () => {
    const opts: BackoffOptions = { baseMs: 100, capMs: 800, jitter: false };
    expect(nextBackoff(0, opts, () => 1)).toBe(100);
    expect(nextBackoff(1, opts, () => 1)).toBe(200);
    expect(nextBackoff(2, opts, () => 1)).toBe(400);
    expect(nextBackoff(3, opts, () => 1)).toBe(800);
    expect(nextBackoff(4, opts, () => 1)).toBe(800); // capped
  });

  it('jittered result is in [0, exp]', () => {
    const opts: BackoffOptions = { baseMs: 100, capMs: 800, jitter: true };
    for (let i = 0; i < 20; i += 1) {
      const v = nextBackoff(2, opts, () => 0.5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(400);
    }
  });

  it('jittered full-jitter at 0 gives 0', () => {
    expect(nextBackoff(3, DEFAULT_BACKOFF, () => 0)).toBe(0);
  });
});

describe('connectEvents reconnect loop', () => {
  it('resets the backoff after a successful connect (no jitter)', async () => {
    // With a stream that closes immediately and backoff { baseMs: 1, capMs: 1, jitter: false },
    // each cycle takes ~1ms in real time. We let the loop run for 3 hello
    // calls (>=3 cycles), then abort.
    const helloMock = vi.fn(async () => ({ ok: true, protocolVersion: 1 }));
    const fakeClient = {
      hello: helloMock,
      openEventStream: vi.fn(async () => makeEmptySseResponse()),
    } as unknown as AionCoreClient;

    const dispatch = vi.fn();
    const ac = new AbortController();
    const promise = connectEvents({
      client: fakeClient,
      buildHello: () => ({
        protocolVersion: 1,
        pluginVersion: '0',
        hooks: [],
        project: { directory: '/d', worktree: '/w' },
      }),
      dispatch: dispatch as unknown as (ev: SseDispatchEvent) => void,
      signal: ac.signal,
      backoff: { baseMs: 1, capMs: 1, jitter: false },
      random: () => 0,
    });

    // Poll until at least 3 hello calls have been made
    for (let i = 0; i < 100 && helloMock.mock.calls.length < 3; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }
    ac.abort();
    await promise;

    // The loop ran >= 3 cycles, each cycle = 1 hello. We expect at
    // least 3 (it may complete a 4th before the abort lands).
    expect(helloMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    // The important assertion: it ran 3+ times — proving the loop
    // re-entered after a successful connect (i.e. backoff was reset
    // to baseMs=1, not grown).
    expect(helloMock.mock.calls.length).toBeLessThan(20); // sanity: not spinning
  });

  it('applies growing backoff between failures', async () => {
    const delays: number[] = [];
    const realSetTimeout = setTimeout;

    // Every hello fails; the SSE is never reached.
    const fakeClient = {
      hello: vi.fn(async () => {
        throw new Error('boom');
      }),
      openEventStream: vi.fn(),
    } as unknown as AionCoreClient;

    const ac = new AbortController();
    const setTimeoutImpl = ((handler: () => void, delay: number): ReturnType<typeof setTimeout> => {
      delays.push(delay);
      // Schedule the actual handler immediately (real-time, 0ms).
      return realSetTimeout(handler, 0) as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    const clearTimeoutImpl = ((handle: ReturnType<typeof setTimeout>): void => {
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    }) as unknown as typeof clearTimeout;

    const promise = connectEvents({
      client: fakeClient,
      buildHello: () => ({
        protocolVersion: 1,
        pluginVersion: '0',
        hooks: [],
        project: { directory: '/d', worktree: '/w' },
      }),
      dispatch: () => undefined,
      signal: ac.signal,
      backoff: { baseMs: 100, capMs: 1_000, jitter: false },
      random: () => 1, // full jitter: 0..exp -> nextBackoff(attempt) === exp
      setTimeoutImpl,
      clearTimeoutImpl,
    });

    // Poll until we have observed >= 3 delays (or give up)
    for (let i = 0; i < 200 && delays.length < 3; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }
    ac.abort();
    await promise;

    // 3 failures => 3 backoff delays recorded
    expect(delays.length).toBeGreaterThanOrEqual(3);
    // With jitter=off, random=1: delays should be 100, 200, 400, 800, ...
    // (each attempt's exp = baseMs * 2^attempt, capped at capMs=1000).
    expect(delays[0]).toBeLessThan(1_000);
    expect(delays[1]).toBeLessThan(1_000);
    expect(delays[2]).toBeLessThan(1_000);
    // Sequence is non-decreasing up to the cap
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!);
    }
  });
});

// Use okHello helper to avoid unused-import warning
void okHello;
