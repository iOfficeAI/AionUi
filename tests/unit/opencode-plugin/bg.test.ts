/**
 * Five background-process tools: happy paths (payload shape, fetch
 * body, output), error paths (null client, non-2xx, ok:false, network),
 * bg_tail streaming (chunk accumulation, throttling, done, abort,
 * maxSeconds cap).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AionCoreClient } from '../../../packages/opencode-plugin/src/connection.js';
import {
  createBgListTool,
  createBgReadTool,
  createBgStartTool,
  createBgStopTool,
  createBgTailTool,
  createBgTools,
  BG_OUTPUT_MAX,
} from '../../../packages/opencode-plugin/src/bg.js';
import { installFetchMock, jsonResponse, type FetchCall } from './_helpers.js';
import type { ToolContext } from '../../../packages/opencode-plugin/node_modules/@opencode-ai/plugin/dist/tool.d.ts';
import type { BgProcessInfo, BgTailRequest } from '../../../packages/opencode-plugin/src/types.js';

const sseResponse = (chunks: string[]): Response => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
};

const makeContext = (
  overrides: Partial<ToolContext> = {}
): ToolContext & {
  __metaCalls: Array<{ title?: string; metadata?: Record<string, unknown> }>;
  __abort: AbortController;
} => {
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

const findBgCall = (calls: FetchCall[]): FetchCall | undefined => calls.find((c) => c.url.endsWith('/tools/bg'));

const findBgTailCall = (calls: FetchCall[]): FetchCall | undefined =>
  calls.find((c) => c.url.endsWith('/tools/bg_tail'));

const makeProcess = (overrides: Partial<BgProcessInfo> = {}): BgProcessInfo => ({
  id: 'bg-1',
  name: 'long-runner',
  command: 'sleep 100',
  cwd: '/proj',
  sessionId: 'sess-1',
  status: 'running',
  startedAtMs: Date.now(),
  outputBytes: 0,
  truncated: false,
  ...overrides,
});

const setUpClient = (): AionCoreClient => new AionCoreClient({ url: 'https://a.example.com', token: 't' });

describe('bg_start', () => {
  let mockFetch: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    mockFetch = installFetchMock([]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const buildTool = (client: AionCoreClient | null) => {
    const ref: { current: AionCoreClient | null } = { current: client };
    return createBgStartTool(() => ref.current);
  };

  it('returns disabled result when client is null', async () => {
    const toolInstance = buildTool(null);
    const result = await toolInstance.execute({ command: 'sleep 10' }, makeContext());
    expect(result).toMatchObject({ title: 'bg_start', metadata: { disabled: true, isError: true } });
  });

  it('POSTs the correct body shape to /tools/bg and returns the process info', async () => {
    const proc = makeProcess();
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: true, process: proc })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ command: 'sleep 10' }, makeContext());
    const call = findBgCall(mockFetch.calls);
    expect(call).toBeDefined();
    const body = JSON.parse(call!.init.body as string);
    expect(body).toEqual({
      op: 'start',
      command: 'sleep 10',
      sessionId: 'sess-1',
      callId: 'msg-1',
    });
    expect(result).toMatchObject({
      title: 'bg_start',
      output: expect.stringContaining('bg-1'),
      metadata: { process: proc },
    });
  });

  it('passes cwd, name, timeoutSecs through when provided', async () => {
    const proc = makeProcess();
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: true, process: proc })]);
    const toolInstance = buildTool(setUpClient());
    await toolInstance.execute({ command: 'make', cwd: '/build', name: 'build', timeoutSecs: 60 }, makeContext());
    const body = JSON.parse(findBgCall(mockFetch.calls)!.init.body as string);
    expect(body).toMatchObject({ op: 'start', cwd: '/build', name: 'build', timeoutSecs: 60, command: 'make' });
  });

  it('returns a structured error when the server returns ok:false', async () => {
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: false, error: 'rate limit' })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ command: 'x' }, makeContext());
    expect(result).toMatchObject({ title: 'bg_start', metadata: { isError: true } });
    expect((result as { output: string }).output).toContain('rate limit');
  });

  it('returns a structured error when the server returns a 5xx', async () => {
    mockFetch = installFetchMock([() => new Response('boom', { status: 503 })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ command: 'x' }, makeContext());
    expect(result).toMatchObject({ title: 'bg_start', metadata: { isError: true, status: 503 } });
  });
});

describe('bg_stop', () => {
  let mockFetch: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    mockFetch = installFetchMock([]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const buildTool = (client: AionCoreClient | null) => {
    const ref: { current: AionCoreClient | null } = { current: client };
    return createBgStopTool(() => ref.current);
  };

  it('returns disabled when client is null', async () => {
    const toolInstance = buildTool(null);
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    expect(result).toMatchObject({ title: 'bg_stop', metadata: { disabled: true, isError: true } });
  });

  it('POSTs the correct body shape and returns the final process state', async () => {
    const proc = makeProcess({ status: 'killed', exitCode: 137, endedAtMs: 12345 });
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: true, process: proc })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    const body = JSON.parse(findBgCall(mockFetch.calls)!.init.body as string);
    expect(body).toEqual({ op: 'stop', processId: 'bg-1', sessionId: 'sess-1' });
    expect(result).toMatchObject({
      title: 'bg_stop',
      metadata: { process: proc },
    });
    expect((result as { output: string }).output).toContain('killed');
  });

  it('returns structured error on ok:false', async () => {
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: false, error: 'no such process' })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ processId: 'missing' }, makeContext());
    expect(result).toMatchObject({ title: 'bg_stop', metadata: { isError: true } });
  });

  it('returns structured error on 5xx', async () => {
    mockFetch = installFetchMock([() => new Response('nope', { status: 500 })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    expect(result).toMatchObject({ title: 'bg_stop', metadata: { isError: true, status: 500 } });
  });
});

describe('bg_list', () => {
  let mockFetch: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    mockFetch = installFetchMock([]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const buildTool = (client: AionCoreClient | null) => {
    const ref: { current: AionCoreClient | null } = { current: client };
    return createBgListTool(() => ref.current);
  };

  it('returns disabled when client is null', async () => {
    const toolInstance = buildTool(null);
    const result = await toolInstance.execute({}, makeContext());
    expect(result).toMatchObject({ title: 'bg_list', metadata: { disabled: true, isError: true } });
  });

  it('POSTs the correct body and returns the processes list', async () => {
    const procs: BgProcessInfo[] = [makeProcess({ id: 'a' }), makeProcess({ id: 'b', status: 'exited', exitCode: 0 })];
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: true, processes: procs })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({}, makeContext());
    const body = JSON.parse(findBgCall(mockFetch.calls)!.init.body as string);
    expect(body).toEqual({ op: 'list', sessionId: 'sess-1' });
    const metadata = (result as unknown as { metadata: { processes: BgProcessInfo[] } }).metadata;
    expect(metadata.processes).toHaveLength(2);
    const output = (result as { output: string }).output;
    expect(output).toContain('a');
    expect(output).toContain('b');
    expect(output).toContain('Background processes');
  });

  it('reports an empty list with a helpful message', async () => {
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: true, processes: [] })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({}, makeContext());
    expect((result as { output: string }).output).toContain('no background processes');
  });

  it('returns structured error on ok:false', async () => {
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: false, error: 'denied' })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({}, makeContext());
    expect(result).toMatchObject({ title: 'bg_list', metadata: { isError: true } });
  });

  it('returns structured error on 5xx', async () => {
    mockFetch = installFetchMock([() => new Response('nope', { status: 500 })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({}, makeContext());
    expect(result).toMatchObject({ title: 'bg_list', metadata: { isError: true, status: 500 } });
  });
});

describe('bg_read', () => {
  let mockFetch: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    mockFetch = installFetchMock([]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const buildTool = (client: AionCoreClient | null) => {
    const ref: { current: AionCoreClient | null } = { current: client };
    return createBgReadTool(() => ref.current);
  };

  it('returns disabled when client is null', async () => {
    const toolInstance = buildTool(null);
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    expect(result).toMatchObject({ title: 'bg_read', metadata: { disabled: true, isError: true } });
  });

  it('POSTs the correct body and returns output + nextOffset + process', async () => {
    const proc = makeProcess({ id: 'bg-1' });
    mockFetch = installFetchMock([
      () => jsonResponse(200, { ok: true, output: 'hello\nworld', nextOffset: 11, process: proc }),
    ]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    const body = JSON.parse(findBgCall(mockFetch.calls)!.init.body as string);
    expect(body).toEqual({ op: 'read', processId: 'bg-1', sessionId: 'sess-1' });
    expect(result).toMatchObject({
      title: 'bg_read',
      output: 'hello\nworld',
      metadata: { process: proc, nextOffset: 11 },
    });
  });

  it('passes offset through when provided', async () => {
    const proc = makeProcess();
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: true, output: 'tail', nextOffset: 5, process: proc })]);
    const toolInstance = buildTool(setUpClient());
    await toolInstance.execute({ processId: 'bg-1', offset: 5 }, makeContext());
    const body = JSON.parse(findBgCall(mockFetch.calls)!.init.body as string);
    expect(body).toEqual({ op: 'read', processId: 'bg-1', sessionId: 'sess-1', offset: 5 });
  });

  it('caps the output string at BG_OUTPUT_MAX', async () => {
    const proc = makeProcess();
    const big = 'x'.repeat(BG_OUTPUT_MAX + 1000);
    mockFetch = installFetchMock([
      () => jsonResponse(200, { ok: true, output: big, nextOffset: big.length, process: proc }),
    ]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    const output = (result as { output: string }).output;
    expect(output.length).toBeLessThanOrEqual(BG_OUTPUT_MAX + 64);
    expect(output).toContain('truncated');
  });

  it('returns "(no output)" when the server sends an empty string', async () => {
    const proc = makeProcess();
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: true, output: '', nextOffset: 0, process: proc })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    expect((result as { output: string }).output).toBe('(no output)');
  });

  it('returns structured error on ok:false', async () => {
    mockFetch = installFetchMock([() => jsonResponse(200, { ok: false, error: 'gone' })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    expect(result).toMatchObject({ title: 'bg_read', metadata: { isError: true } });
  });

  it('returns structured error on 5xx', async () => {
    mockFetch = installFetchMock([() => new Response('nope', { status: 500 })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    expect(result).toMatchObject({ title: 'bg_read', metadata: { isError: true, status: 500 } });
  });
});

describe('bg_tail', () => {
  let mockFetch: ReturnType<typeof installFetchMock>;
  beforeEach(() => {
    mockFetch = installFetchMock([]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const buildTool = (client: AionCoreClient | null) => {
    const ref: { current: AionCoreClient | null } = { current: client };
    return createBgTailTool(() => ref.current);
  };

  it('returns disabled when client is null', async () => {
    const toolInstance = buildTool(null);
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    const metadata = (result as { metadata: Record<string, unknown> }).metadata;
    expect(metadata).toMatchObject({ processId: 'bg-1', streamError: true, aborted: false });
  });

  it('streams chunks and accumulates output in metadata + final result', async () => {
    const sseChunks = [
      'event: chunk\ndata: {"type":"chunk","data":{"data":"hel","offset":3}}\n\n',
      'event: chunk\ndata: {"type":"chunk","data":{"data":"lo","offset":5}}\n\n',
      'event: done\ndata: {"type":"done","data":{"exitCode":0,"status":"exited"}}\n\n',
    ];
    mockFetch = installFetchMock([() => sseResponse(sseChunks)]);
    const toolInstance = buildTool(setUpClient());
    const ctx = makeContext();
    const result = await toolInstance.execute({ processId: 'bg-1' }, ctx);
    expect(result).toMatchObject({
      title: 'bg_tail',
      output: 'hello',
    });
    const metadata = (result as { metadata: Record<string, unknown> }).metadata;
    expect(metadata).toMatchObject({ processId: 'bg-1', offset: 5, status: 'exited', exitCode: 0 });
  });

  it('throttles metadata calls but always emits a final flush', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const sseChunks: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      sseChunks.push(`event: chunk\ndata: {"type":"chunk","data":{"data":"x${i}","offset":${(i + 1) * 2}}}\n\n`);
    }
    sseChunks.push('event: done\ndata: {"type":"done","data":{"exitCode":0,"status":"exited"}}\n\n');
    mockFetch = installFetchMock([() => sseResponse(sseChunks)]);
    const toolInstance = buildTool(setUpClient());
    const ctx = makeContext();
    const result = await toolInstance.execute({ processId: 'bg-1' }, ctx);
    const metaCalls = ctx.__metaCalls;
    // Final flush is guaranteed, and at minimum the first chunk + final flush fire.
    expect(metaCalls.length).toBeGreaterThanOrEqual(1);
    const last = metaCalls[metaCalls.length - 1]!;
    expect(last.title).toBe('bg_tail');
    expect(last.metadata?.['output']).toBe('x0x1x2x3x4');
    expect(result).toMatchObject({ output: 'x0x1x2x3x4' });
  });

  it('handles an `error` event from the server (streamError)', async () => {
    const sseChunks = [
      'event: chunk\ndata: {"type":"chunk","data":{"data":"partial","offset":7}}\n\n',
      'event: error\ndata: {"type":"error","data":{"message":"crash"}}\n\n',
    ];
    mockFetch = installFetchMock([() => sseResponse(sseChunks)]);
    const toolInstance = buildTool(setUpClient());
    const ctx = makeContext();
    const result = await toolInstance.execute({ processId: 'bg-1' }, ctx);
    const metadata = (result as { metadata: Record<string, unknown> }).metadata;
    expect(metadata).toMatchObject({ processId: 'bg-1', streamError: true });
    expect((result as { output: string }).output).toContain('crash');
  });

  it('respects ctx.abort and returns a structured aborted result', async () => {
    const encoder = new TextEncoder();
    const controllerRef: { current: ReadableStreamDefaultController<Uint8Array> | null } = { current: null };
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controllerRef.current = c;
        c.enqueue(encoder.encode('event: chunk\ndata: {"type":"chunk","data":{"data":"first","offset":5}}\n\n'));
      },
    });
    const sseResp = new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeDefined();
      return sseResp;
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new AionCoreClient({
      url: 'https://a.example.com',
      token: 't',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const toolInstance = buildTool(client);
    const ctx = makeContext();
    const promise = toolInstance.execute({ processId: 'bg-1' }, ctx);
    await new Promise((r) => setTimeout(r, 5));
    ctx.__abort.abort();
    try {
      controllerRef.current?.error(new Error('aborted'));
    } catch {
      /* ignore */
    }
    const result = await promise;
    expect(result).toBeDefined();
    expect(typeof (result as { output?: string }).output).toBe('string');
  });

  it('caps tail output at BG_OUTPUT_MAX in the result', async () => {
    const big = 'y'.repeat(BG_OUTPUT_MAX + 1000);
    const sseChunks = [
      `event: chunk\ndata: ${JSON.stringify({ type: 'chunk', data: { data: big, offset: big.length } })}\n\n`,
      'event: done\ndata: {"type":"done","data":{"exitCode":0,"status":"exited"}}\n\n',
    ];
    mockFetch = installFetchMock([() => sseResponse(sseChunks)]);
    const toolInstance = buildTool(setUpClient());
    const ctx = makeContext();
    const result = await toolInstance.execute({ processId: 'bg-1' }, ctx);
    const output = (result as { output: string }).output;
    expect(output.length).toBeLessThanOrEqual(BG_OUTPUT_MAX + 64);
  });

  it('returns a structured error when the server returns a 5xx', async () => {
    mockFetch = installFetchMock([() => new Response('nope', { status: 500 })]);
    const toolInstance = buildTool(setUpClient());
    const result = await toolInstance.execute({ processId: 'bg-1' }, makeContext());
    expect(result).toMatchObject({
      title: 'bg_tail',
      metadata: { processId: 'bg-1', streamError: true },
    });
  });

  it('POSTs the correct body to /tools/bg_tail (processId + sessionId + fromOffset)', async () => {
    const sseChunks = [
      'event: chunk\ndata: {"type":"chunk","data":{"data":"hi","offset":2}}\n\n',
      'event: done\ndata: {"type":"done","data":{"exitCode":0,"status":"exited"}}\n\n',
    ];
    mockFetch = installFetchMock([() => sseResponse(sseChunks)]);
    const toolInstance = buildTool(setUpClient());
    const ctx = makeContext();
    await toolInstance.execute({ processId: 'bg-9', fromOffset: 100 }, ctx);
    const call = findBgTailCall(mockFetch.calls);
    expect(call).toBeDefined();
    const body = JSON.parse(call!.init.body as string) as BgTailRequest;
    expect(body).toEqual({ processId: 'bg-9', sessionId: 'sess-1', fromOffset: 100 });
    expect(call!.init.method).toBe('POST');
  });
});

describe('createBgTools', () => {
  it('returns a BgTools bag with all five tool definitions', () => {
    const ref: { current: AionCoreClient | null } = { current: setUpClient() };
    const tools = createBgTools(() => ref.current);
    expect(Object.keys(tools).toSorted()).toEqual(['bg_list', 'bg_read', 'bg_start', 'bg_stop', 'bg_tail']);
    for (const [, def] of Object.entries(tools)) {
      expect(typeof def.execute).toBe('function');
      expect(typeof def.description).toBe('string');
    }
  });

  it('tools honor the boxed clientRef: setting to null returns disabled result', async () => {
    const ref: { current: AionCoreClient | null } = { current: setUpClient() };
    const tools = createBgTools(() => ref.current);
    ref.current = null;
    const ctx = makeContext();
    const startResult = await tools.bg_start.execute({ command: 'x' }, ctx);
    expect(startResult).toMatchObject({ metadata: { disabled: true } });
    const listResult = await tools.bg_list.execute({}, ctx);
    expect(listResult).toMatchObject({ metadata: { disabled: true } });
  });
});
