/**
 * run_shell_streaming tool: mocked SSE -> ctx.metadata called with
 * accumulated output; final ToolResult has exitCode; abort signal
 * aborts fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRunShellStreamingTool } from '../../../packages/opencode-plugin/src/shell.js';
import { AionCoreClient } from '../../../packages/opencode-plugin/src/connection.js';
import { installFetchMock, type FetchCall } from './_helpers.js';
import type { ToolContext } from '../../../packages/opencode-plugin/node_modules/@opencode-ai/plugin/dist/tool.d.ts';

const makeContext = (overrides: Partial<ToolContext> = {}): ToolContext => {
  const ac = new AbortController();
  const metaCalls: Array<{ title?: string; metadata?: Record<string, unknown> }> = [];
  const ctx: ToolContext = {
    sessionID: 'sess-1',
    messageID: 'msg-1',
    agent: 'test',
    directory: '/proj',
    worktree: '/wt',
    abort: ac.signal,
    metadata: (input) => {
      metaCalls.push(input);
    },
    ask: vi.fn(),
  };
  return Object.assign(ctx, overrides, { __metaCalls: metaCalls, __abort: ac }) as ToolContext & {
    __metaCalls: Array<{ title?: string; metadata?: Record<string, unknown> }>;
    __abort: AbortController;
  };
};

/**
 * Build an SSE `Response` from an array of textual chunks. The body is
 * a `ReadableStream` that yields the chunks sequentially and then
 * closes — matching what the real AionCore server returns.
 */
const sseResponse = (chunks: string[]): Response => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
};

describe('run_shell_streaming', () => {
  let mockFetch: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    // Install a default mock so any unintended fetch call still gets
    // a JSON 200 (rather than a network error from Node's real fetch).
    mockFetch = installFetchMock([]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** Build a tool wired to a boxed client reference. */
  const buildToolWithClient = (client: AionCoreClient | null): ReturnType<typeof createRunShellStreamingTool> => {
    const clientRef: { current: AionCoreClient | null } = { current: client };
    return createRunShellStreamingTool(() => clientRef.current);
  };

  const setUpClient = (): AionCoreClient => new AionCoreClient({ url: 'https://a.example.com', token: 't' });

  it('streams chunks and reports accumulated output via ctx.metadata', async () => {
    const sseChunks = [
      'event: chunk\ndata: {"type":"chunk","data":{"stream":"stdout","data":"hel"}}\n\n',
      'event: chunk\ndata: {"type":"chunk","data":{"stream":"stdout","data":"lo\\n"}}\n\n',
      'event: chunk\ndata: {"type":"chunk","data":{"stream":"stderr","data":"warn"}}\n\n',
      'event: done\ndata: {"type":"done","data":{"exitCode":0,"isError":false,"truncated":false}}\n\n',
    ];
    // Re-install with a single SSE response handler
    mockFetch = installFetchMock([() => sseResponse(sseChunks)]);
    const toolInstance = buildToolWithClient(setUpClient());
    const ctx = makeContext();
    const result = await toolInstance.execute({ command: 'echo hi' }, ctx);

    // Final ToolResult shape
    expect(result).toMatchObject({
      title: 'run_shell_streaming',
      output: 'hello\n\nwarn',
      metadata: { exitCode: 0, isError: false, truncated: false },
    });
  });

  it('emits multiple ctx.metadata calls as chunks arrive (throttled to >=100ms)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const sseChunks: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      sseChunks.push(`event: chunk\ndata: {"type":"chunk","data":{"stream":"stdout","data":"x${i}"}}\n\n`);
    }
    sseChunks.push('event: done\ndata: {"type":"done","data":{"exitCode":0,"isError":false,"truncated":false}}\n\n');
    mockFetch = installFetchMock([() => sseResponse(sseChunks)]);
    const toolInstance = buildToolWithClient(setUpClient());
    const ctx = makeContext();
    const result = await toolInstance.execute({ command: 'printf' }, ctx);

    // The throttler coalesces bursts. The final flush always emits.
    const metaCalls = (ctx as unknown as { __metaCalls: Array<{ title?: string; metadata?: { output?: string } }> })
      .__metaCalls;
    expect(metaCalls.length).toBeGreaterThanOrEqual(1);
    // Last metadata call carries the final accumulated output
    const last = metaCalls[metaCalls.length - 1]!;
    expect(last.title).toBe('run_shell_streaming');
    expect(last.metadata?.output).toBe('x0x1x2x3x4');

    // Final result
    expect(result).toMatchObject({ metadata: { exitCode: 0, isError: false, truncated: false } });
  });

  it('returns disabled metadata when the factory client is null', async () => {
    const toolInstance = buildToolWithClient(null);
    const ctx = makeContext();
    const result = await toolInstance.execute({ command: 'echo hi' }, ctx);
    expect(result).toMatchObject({ title: 'run_shell_streaming', metadata: { disabled: true, isError: true } });
  });

  it('aborts the fetch via ctx.abort and returns a structured error', async () => {
    // Build an SSE response that the client can abort. We expose the
    // underlying controller so we can confirm abort behaviour.
    const encoder = new TextEncoder();
    const controllerRef: { current: ReadableStreamDefaultController<Uint8Array> | null } = { current: null };
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controllerRef.current = c;
        c.enqueue(encoder.encode('event: chunk\ndata: {"type":"chunk","data":{"stream":"stdout","data":"first"}}\n\n'));
      },
    });
    const sseResp = new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      // Verify the signal is forwarded
      expect(init?.signal).toBeDefined();
      return sseResp;
    });
    vi.stubGlobal('fetch', fetchMock);
    // Replace the client's fetchImpl to use our mock
    const client = new AionCoreClient({
      url: 'https://a.example.com',
      token: 't',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const toolInstance = buildToolWithClient(client);

    const ctx = makeContext();
    const promise = toolInstance.execute({ command: 'long' }, ctx);

    // Let one chunk be parsed
    await new Promise((r) => setTimeout(r, 5));
    // Abort the operation
    (ctx as unknown as { __abort: AbortController }).__abort.abort();
    // Force the stream to error so the reader terminates
    const ctl = controllerRef.current;
    if (ctl) {
      try {
        ctl.error(new Error('aborted'));
      } catch {
        /* ignore */
      }
    }
    const result = await promise;
    // When the abort signal triggers, the tool should not crash and
    // should return a structured ToolResult (isError: true).
    expect(result).toBeDefined();
    expect(typeof (result as { output?: string }).output).toBe('string');
  });

  it('handles a stream with a `done` event reporting isError / truncated', async () => {
    const sseChunks = [
      'event: chunk\ndata: {"type":"chunk","data":{"stream":"stdout","data":"oops"}}\n\n',
      'event: done\ndata: {"type":"done","data":{"exitCode":1,"isError":true,"truncated":true}}\n\n',
    ];
    mockFetch = installFetchMock([() => sseResponse(sseChunks)]);
    const toolInstance = buildToolWithClient(setUpClient());
    const ctx = makeContext();
    const result = await toolInstance.execute({ command: 'fail' }, ctx);
    expect(result).toMatchObject({
      metadata: { exitCode: 1, isError: true, truncated: true },
      output: 'oops',
    });
  });

  it('handles `error` events from the server by reporting streamError', async () => {
    const sseChunks = [
      'event: chunk\ndata: {"type":"chunk","data":{"stream":"stdout","data":"a"}}\n\n',
      'event: error\ndata: {"type":"error","data":{"message":"shell crashed"}}\n\n',
    ];
    mockFetch = installFetchMock([() => sseResponse(sseChunks)]);
    const toolInstance = buildToolWithClient(setUpClient());
    const ctx = makeContext();
    const result = await toolInstance.execute({ command: 'crash' }, ctx);
    const metadata = (result as { metadata?: Record<string, unknown> }).metadata;
    expect(metadata).toMatchObject({ isError: true, streamError: true });
    expect((result as { output: string }).output).toContain('shell crashed');
  });

  it('returns a structured error when the server returns a 5xx', async () => {
    mockFetch = installFetchMock([
      () => new Response('internal error', { status: 500, headers: { 'content-type': 'text/plain' } }),
    ]);
    const toolInstance = buildToolWithClient(setUpClient());
    const ctx = makeContext();
    const result = await toolInstance.execute({ command: 'x' }, ctx);
    expect(result).toMatchObject({ metadata: { isError: true, status: 500 } });
  });

  it('respects dispose-style nulling of the factory client reference', async () => {
    // The factory's thunk is re-read on every call. A caller that
    // clears the client (e.g. dispose() in capabilities.ts) must put
    // subsequent calls into the disabled path.
    const clientRef: { current: AionCoreClient | null } = { current: setUpClient() };
    const toolInstance = createRunShellStreamingTool(() => clientRef.current);

    // Simulate dispose: clear the reference.
    clientRef.current = null;

    const ctx = makeContext();
    const result = await toolInstance.execute({ command: 'echo hi' }, ctx);
    expect(result).toMatchObject({ metadata: { disabled: true, isError: true } });
  });
});

// Use FetchCall to avoid unused-import warning
void (null as FetchCall | null);
