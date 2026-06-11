/**
 * Background-process tools (5):
 *   - bg_start
 *   - bg_stop
 *   - bg_list
 *   - bg_read
 *   - bg_tail
 *
 * All five follow the factory pattern used by `shell.ts`: a
 * `GetAionCoreClient` thunk is closed over so the live client is
 * re-read on every call. A null client (e.g. after dispose) returns
 * a structured disabled result rather than throwing.
 *
 * `bg_tail` mirrors the streaming shape of `run_shell_streaming`:
 * the SSE body is parsed incrementally, output is accumulated, and
 * `ctx.metadata` is throttled to >=100ms with a final flush.
 */

import { tool, type ToolDefinition } from '@opencode-ai/plugin';

import { capPreview, parseSseStream } from './connection.js';
import type { GetAionCoreClient } from './shell.js';
import type {
  BgListResponse,
  BgProcessInfo,
  BgProcessResponse,
  BgReadResponse,
  BgResponse,
  BgStartRequest,
  BgStopRequest,
  BgListRequest,
  BgReadRequest,
  BgTailRequest,
  BgTailStreamEvent,
} from './types.js';

const META_THROTTLE_MS = 100;

/** Cap on the `output` string returned in a tool result. */
export const BG_OUTPUT_MAX = 30_000;

/** Cap on the `output` string returned by `bg_tail`'s metadata. */
const BG_TAIL_META_MAX = 30_000;

/** Re-export the client thunk type for consumers. */
export type { GetAionCoreClient };

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

const isBgError = (r: BgResponse): r is { ok: false; error: string } => r.ok === false;

const disabledResult = (
  title: string
): { title: string; output: string; metadata: { disabled: true; isError: true } } => ({
  title,
  output: `AionCore is not configured; ${title} is disabled.`,
  metadata: { disabled: true, isError: true },
});

const errorResult = (
  title: string,
  message: string
): { title: string; output: string; metadata: { isError: true; status?: number } } => ({
  title,
  output: `${title} failed: ${capPreview(message, BG_OUTPUT_MAX)}`,
  metadata: { isError: true },
});

const httpErrorResult = (
  title: string,
  status: number,
  body: string
): { title: string; output: string; metadata: { isError: true; status: number } } => ({
  title,
  output: `AionCore rejected the request (HTTP ${status}): ${capPreview(body, BG_OUTPUT_MAX)}`,
  metadata: { isError: true, status },
});

/* -------------------------------------------------------------------------- */
/* bg_start                                                                   */
/* -------------------------------------------------------------------------- */

export const createBgStartTool = (getClient: GetAionCoreClient): ToolDefinition => {
  return tool({
    description:
      'Start a long-running background process on AionCore. The process runs detached and is identified by an id that can later be passed to bg_read, bg_tail, or bg_stop.',
    args: {
      command: tool.schema.string().describe('Shell command to start in the background.'),
      cwd: tool.schema.string().optional().describe('Working directory; defaults to the session directory.'),
      name: tool.schema.string().optional().describe('Optional human-readable name for the process.'),
      timeoutSecs: tool.schema.number().int().positive().optional().describe('Optional execution timeout in seconds.'),
    },
    execute: async (args, ctx) => {
      const client = getClient();
      if (!client) return disabledResult('bg_start');
      try {
        const body: BgStartRequest = {
          op: 'start',
          command: args.command,
          sessionId: ctx.sessionID,
        };
        if (ctx.messageID) body.callId = ctx.messageID;
        if (args.cwd) body.cwd = args.cwd;
        if (args.name) body.name = args.name;
        if (typeof args.timeoutSecs === 'number') body.timeoutSecs = args.timeoutSecs;
        const response = await client.postBg(body);
        if (isBgError(response)) {
          return errorResult('bg_start', response.error);
        }
        if (!response.ok) {
          return errorResult('bg_start', 'unexpected response shape');
        }
        const p = (response as BgProcessResponse).process;
        const label = p.name ?? p.id;
        return {
          title: 'bg_start',
          output: `Started background process ${label} (id=${p.id}, status=${p.status})`,
          metadata: { process: p },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // AionCoreHttpError carries a status; surface it.
        const status = (err as { status?: number }).status;
        if (typeof status === 'number') {
          return httpErrorResult('bg_start', status, (err as { body?: string }).body ?? '');
        }
        return errorResult('bg_start', message);
      }
    },
  });
};

/* -------------------------------------------------------------------------- */
/* bg_stop                                                                    */
/* -------------------------------------------------------------------------- */

export const createBgStopTool = (getClient: GetAionCoreClient): ToolDefinition => {
  return tool({
    description: 'Stop a running background process by id. Returns the final state of the process.',
    args: {
      processId: tool.schema.string().describe('Id of the background process to stop.'),
    },
    execute: async (args, ctx) => {
      const client = getClient();
      if (!client) return disabledResult('bg_stop');
      try {
        const body: BgStopRequest = {
          op: 'stop',
          processId: args.processId,
          sessionId: ctx.sessionID,
        };
        const response = await client.postBg(body);
        if (isBgError(response)) {
          return errorResult('bg_stop', response.error);
        }
        if (!response.ok) {
          return errorResult('bg_stop', 'unexpected response shape');
        }
        const p = (response as BgProcessResponse).process;
        return {
          title: 'bg_stop',
          output: `Stopped ${p.name ?? p.id} (status=${p.status}${p.exitCode !== undefined ? `, exitCode=${p.exitCode}` : ''})`,
          metadata: { process: p },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = (err as { status?: number }).status;
        if (typeof status === 'number') {
          return httpErrorResult('bg_stop', status, (err as { body?: string }).body ?? '');
        }
        return errorResult('bg_stop', message);
      }
    },
  });
};

/* -------------------------------------------------------------------------- */
/* bg_list                                                                    */
/* -------------------------------------------------------------------------- */

const formatProcessRow = (p: BgProcessInfo): string => {
  const label = p.name ?? p.id;
  const exit = p.exitCode !== undefined ? ` exit=${p.exitCode}` : '';
  return `${label.padEnd(24)} id=${p.id} status=${p.status}${exit}`;
};

export const createBgListTool = (getClient: GetAionCoreClient): ToolDefinition => {
  return tool({
    description: 'List background processes for the current session. Returns id, name, status, and exit code.',
    args: {},
    execute: async (_args, ctx) => {
      const client = getClient();
      if (!client) return disabledResult('bg_list');
      try {
        const body: BgListRequest = { op: 'list', sessionId: ctx.sessionID };
        const response = await client.postBg(body);
        if (isBgError(response)) {
          return errorResult('bg_list', response.error);
        }
        if (!response.ok) {
          return errorResult('bg_list', 'unexpected response shape');
        }
        const processes = (response as BgListResponse).processes;
        const output =
          processes.length === 0
            ? '(no background processes)'
            : `Background processes (${processes.length}):\n` + processes.map(formatProcessRow).join('\n');
        return {
          title: 'bg_list',
          output: capPreview(output, BG_OUTPUT_MAX),
          metadata: { processes },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = (err as { status?: number }).status;
        if (typeof status === 'number') {
          return httpErrorResult('bg_list', status, (err as { body?: string }).body ?? '');
        }
        return errorResult('bg_list', message);
      }
    },
  });
};

/* -------------------------------------------------------------------------- */
/* bg_read                                                                    */
/* -------------------------------------------------------------------------- */

export const createBgReadTool = (getClient: GetAionCoreClient): ToolDefinition => {
  return tool({
    description:
      'Read a snapshot of the captured output of a background process. Returns the output text and the new offset for subsequent reads.',
    args: {
      processId: tool.schema.string().describe('Id of the background process to read.'),
      offset: tool.schema
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Byte offset to start reading from; defaults to 0.'),
    },
    execute: async (args, ctx) => {
      const client = getClient();
      if (!client) return disabledResult('bg_read');
      try {
        const body: BgReadRequest = {
          op: 'read',
          processId: args.processId,
          sessionId: ctx.sessionID,
        };
        if (typeof args.offset === 'number') body.offset = args.offset;
        const response = await client.postBg(body);
        if (isBgError(response)) {
          return errorResult('bg_read', response.error);
        }
        if (!response.ok) {
          return errorResult('bg_read', 'unexpected response shape');
        }
        const ok = response as BgReadResponse;
        return {
          title: 'bg_read',
          output: capPreview(ok.output || '(no output)', BG_OUTPUT_MAX),
          metadata: { process: ok.process, nextOffset: ok.nextOffset },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = (err as { status?: number }).status;
        if (typeof status === 'number') {
          return httpErrorResult('bg_read', status, (err as { body?: string }).body ?? '');
        }
        return errorResult('bg_read', message);
      }
    },
  });
};

/* -------------------------------------------------------------------------- */
/* bg_tail                                                                    */
/* -------------------------------------------------------------------------- */

export type BgTailResult = {
  title: string;
  output: string;
  metadata: {
    processId: string;
    offset: number;
    status?: BgProcessInfo['status'];
    exitCode?: number | null;
    streamError?: boolean;
    aborted?: boolean;
  };
};

/**
 * Build the `bg_tail` tool. Streams captured process output via SSE
 * until the server reports `done`/`error`, the host aborts, or
 * `maxSeconds` elapses.
 */
export const createBgTailTool = (getClient: GetAionCoreClient): ToolDefinition => {
  return tool({
    description:
      'Stream the captured output of a background process. Emits accumulated output via metadata while running and returns the final output + process state.',
    args: {
      processId: tool.schema.string().describe('Id of the background process to tail.'),
      fromOffset: tool.schema
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Byte offset to start tailing from; defaults to 0.'),
      maxSeconds: tool.schema
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum wall-clock seconds to wait. Default 30, max 300.'),
    },
    execute: async (args, ctx) => {
      const processId = args.processId;
      const maxSeconds = Math.min(Math.max(args.maxSeconds ?? 30, 1), 300);
      const fromOffset = typeof args.fromOffset === 'number' ? args.fromOffset : 0;

      const client = getClient();
      if (!client) {
        return {
          title: 'bg_tail',
          output: `AionCore is not configured; bg_tail is disabled.`,
          metadata: { processId, offset: fromOffset, aborted: false, streamError: true },
        };
      }

      const controller = new AbortController();
      const onAbort = (): void => controller.abort();
      if (ctx.abort.aborted) onAbort();
      else ctx.abort.addEventListener('abort', onAbort, { once: true });

      // maxSeconds wall-clock cap: abort the request when exceeded.
      const timer = setTimeout(() => controller.abort(), maxSeconds * 1000);

      let accumulated = '';
      let lastOffset = fromOffset;
      let status: BgProcessInfo['status'] | undefined;
      let exitCode: number | null | undefined;
      let streamError = false;
      let aborted = false;
      let lastMetaEmit = 0;
      let pendingMeta: ReturnType<typeof setTimeout> | null = null;

      const emitMeta = (): void => {
        const meta: BgTailResult['metadata'] = { processId, offset: lastOffset };
        if (status) meta.status = status;
        if (exitCode !== undefined) meta.exitCode = exitCode;
        if (streamError) meta.streamError = true;
        if (aborted) meta.aborted = true;
        ctx.metadata({
          title: 'bg_tail',
          metadata: { output: capPreview(accumulated, BG_TAIL_META_MAX), ...meta },
        });
      };
      const throttledMeta = (): void => {
        const now = Date.now();
        const elapsed = now - lastMetaEmit;
        if (elapsed >= META_THROTTLE_MS) {
          lastMetaEmit = now;
          emitMeta();
          return;
        }
        if (pendingMeta) return;
        pendingMeta = setTimeout(() => {
          pendingMeta = null;
          lastMetaEmit = Date.now();
          emitMeta();
        }, META_THROTTLE_MS - elapsed);
      };

      const buildRequest = (): BgTailRequest => {
        const body: BgTailRequest = { processId, sessionId: ctx.sessionID };
        if (fromOffset) body.fromOffset = fromOffset;
        return body;
      };

      try {
        const response = await client.openBgTailStream(buildRequest(), controller.signal);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          if (pendingMeta) clearTimeout(pendingMeta);
          return {
            title: 'bg_tail',
            output: `AionCore rejected the request (HTTP ${response.status}): ${capPreview(errText, BG_OUTPUT_MAX)}`,
            metadata: { processId, offset: lastOffset, streamError: true },
          };
        }
        if (!response.body) {
          if (pendingMeta) clearTimeout(pendingMeta);
          return {
            title: 'bg_tail',
            output: 'AionCore returned an empty response body for bg_tail.',
            metadata: { processId, offset: lastOffset, streamError: true },
          };
        }

        await parseSseStream(
          response.body,
          (ev) => {
            if (ev.type !== 'raw') return;
            let parsed: BgTailStreamEvent | undefined;
            try {
              parsed = JSON.parse(ev.data) as BgTailStreamEvent;
            } catch {
              return;
            }
            if (!parsed) return;
            if (parsed.type === 'chunk') {
              accumulated += parsed.data.data;
              lastOffset = parsed.data.offset;
              throttledMeta();
              return;
            }
            if (parsed.type === 'done') {
              status = parsed.data.status;
              exitCode = parsed.data.exitCode;
              // drain any further events (none should follow but be safe)
              return;
            }
            if (parsed.type === 'error') {
              streamError = true;
              accumulated += `\n[AionCore error] ${parsed.data.message}`;
            }
          },
          controller.signal
        );

        aborted = controller.signal.aborted;
        if (pendingMeta) clearTimeout(pendingMeta);
        emitMeta();

        return {
          title: 'bg_tail',
          output: capPreview(accumulated || '(no output)', BG_OUTPUT_MAX),
          metadata: {
            processId,
            offset: lastOffset,
            ...(status ? { status } : {}),
            ...(exitCode !== undefined ? { exitCode } : {}),
            ...(streamError ? { streamError: true } : {}),
            ...(aborted ? { aborted: true } : {}),
          },
        };
      } catch (err) {
        if (pendingMeta) clearTimeout(pendingMeta);
        aborted = controller.signal.aborted;
        const message = err instanceof Error ? err.message : String(err);
        return {
          title: 'bg_tail',
          output: `bg_tail failed: ${capPreview(message, BG_OUTPUT_MAX)}`,
          metadata: { processId, offset: lastOffset, streamError: true, aborted },
        };
      } finally {
        clearTimeout(timer);
        ctx.abort.removeEventListener('abort', onAbort);
      }
    },
  });
};

/* -------------------------------------------------------------------------- */
/* Combined factory                                                           */
/* -------------------------------------------------------------------------- */

export type BgTools = {
  bg_start: ToolDefinition;
  bg_stop: ToolDefinition;
  bg_list: ToolDefinition;
  bg_read: ToolDefinition;
  bg_tail: ToolDefinition;
};

/** Build all five bg tools bound to a single `getClient` thunk. */
export const createBgTools = (getClient: GetAionCoreClient): BgTools => ({
  bg_start: createBgStartTool(getClient),
  bg_stop: createBgStopTool(getClient),
  bg_list: createBgListTool(getClient),
  bg_read: createBgReadTool(getClient),
  bg_tail: createBgTailTool(getClient),
});
