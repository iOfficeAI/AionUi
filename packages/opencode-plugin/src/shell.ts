/**
 * `run_shell_streaming` custom tool.
 *
 * Streams a shell command's output to AionCore (via SSE) and surfaces
 * accumulated chunks back to the host via `ctx.metadata` (throttled to
 * at most one call per 100ms). The final returned `ToolResult` carries
 * the exit code and an `isError` / `truncated` flag.
 *
 * If AionCore is unreachable, the tool returns a structured error
 * message but does NOT throw — the host must not crash.
 *
 * The tool is built by a factory so the live `AionCoreClient` is
 * captured in a closure. Callers in tests pass a `getClient` thunk
 * that returns the client (or `null` to exercise the disabled path);
 * production wires the thunk to the real client constructed in
 * `createPlugin`.
 */

import { tool, type ToolDefinition } from '@opencode-ai/plugin';

import { parseSseStream, OUTPUT_PREVIEW_MAX, capPreview } from './connection.js';
import type { AionCoreClient } from './connection.js';
import type { RunShellStreamingRequest, RunShellStreamEvent } from './types.js';

const META_THROTTLE_MS = 100;

const SHELL_DEBUG = typeof process !== 'undefined' && process.env?.CHISL_SHELL_DEBUG === '1';

/** Get-client thunk: returns the live client, or `null` when disabled. */
export type GetAionCoreClient = () => AionCoreClient | null;

/**
 * Build the `run_shell_streaming` tool. The factory closes over
 * `getClient` so the tool always reads the current client at call
 * time, allowing a single tool instance to be disposed and re-built
 * without leaking references.
 */
export const createRunShellStreamingTool = (getClient: GetAionCoreClient): ToolDefinition => {
  return tool({
    description:
      'Run a shell command with output streamed back from AionCore. Use this instead of the built-in `bash` tool when the user wants streaming output, large output, or a recorded audit trail.',
    args: {
      command: tool.schema.string().describe('The shell command to execute.'),
      cwd: tool.schema.string().optional().describe('Working directory; defaults to the session directory.'),
      timeoutSecs: tool.schema.number().int().positive().optional().describe('Optional execution timeout in seconds.'),
    },
    execute: async (args, ctx) => {
      const sessionId = ctx.sessionID;
      const callId = ctx.messageID;

      const client = getClient();
      if (!client) {
        return {
          title: 'run_shell_streaming',
          output: 'AionCore is not configured; run_shell_streaming is disabled.',
          metadata: { exitCode: null, isError: true, truncated: false, disabled: true },
        };
      }

      const body: RunShellStreamingRequest = {
        command: args.command,
        sessionId,
      };
      if (callId) body.callId = callId;
      if (args.cwd) body.cwd = args.cwd;
      if (typeof args.timeoutSecs === 'number') body.timeoutSecs = args.timeoutSecs;

      const controller = new AbortController();
      const onAbort = (): void => controller.abort();
      if (ctx.abort.aborted) onAbort();
      else ctx.abort.addEventListener('abort', onAbort, { once: true });

      let stdout = '';
      let stderr = '';
      let lastMetaEmit = 0;
      let pendingMeta: ReturnType<typeof setTimeout> | null = null;
      const emitMeta = (): void => {
        if (SHELL_DEBUG) {
          console.log(`[shell:meta_emit] ts=${Date.now()} stdoutLen=${stdout.length} stderrLen=${stderr.length}`);
        }
        ctx.metadata({
          title: 'run_shell_streaming',
          metadata: { output: stdout + stderr, stdoutLen: stdout.length, stderrLen: stderr.length },
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

      try {
        const response = await client.openShellStream(body, controller.signal);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          return {
            title: 'run_shell_streaming',
            output: `AionCore rejected the request (HTTP ${response.status}): ${errText.slice(0, OUTPUT_PREVIEW_MAX)}`,
            metadata: { exitCode: null, isError: true, truncated: false, status: response.status },
          };
        }
        if (!response.body) {
          return {
            title: 'run_shell_streaming',
            output: 'AionCore returned an empty response body for run_shell_streaming.',
            metadata: { exitCode: null, isError: true, truncated: false },
          };
        }

        // parseSseStream is generic over dispatch. We pass a typed shim.
        let exitCode: number | null = null;
        let isError = false;
        let truncated = false;
        let errored = false;

        await parseSseStream(
          response.body,
          (ev) => {
            if (ev.type === 'raw') {
              let parsed: RunShellStreamEvent | undefined;
              try {
                parsed = JSON.parse(ev.data) as RunShellStreamEvent;
              } catch {
                return;
              }
              if (parsed && parsed.type === 'chunk') {
                if (SHELL_DEBUG) {
                  console.log(
                    `[shell:chunk_recv] ts=${Date.now()} stream=${parsed.data.stream} bytes=${parsed.data.data.length}`
                  );
                }
                if (parsed.data.stream === 'stdout') stdout += parsed.data.data;
                else if (parsed.data.stream === 'stderr') stderr += parsed.data.data;
                throttledMeta();
                return;
              }
              if (parsed && parsed.type === 'done') {
                exitCode = parsed.data.exitCode;
                isError = parsed.data.isError;
                truncated = parsed.data.truncated;
                return;
              }
              if (parsed && parsed.type === 'error') {
                errored = true;
                stderr += `\n[AionCore error] ${parsed.data.message}`;
              }
            }
          },
          controller.signal
        );

        if (pendingMeta) clearTimeout(pendingMeta);
        // Final flush
        emitMeta();

        const combined = stdout + (stderr ? (stdout ? '\n' : '') + stderr : '');
        if (errored) {
          return {
            title: 'run_shell_streaming',
            output: capPreview(combined || '(no output)'),
            metadata: { exitCode, isError: true, truncated, streamError: true },
          };
        }
        return {
          title: 'run_shell_streaming',
          output: capPreview(combined || '(no output)'),
          metadata: { exitCode, isError, truncated },
        };
      } catch (err) {
        if (pendingMeta) clearTimeout(pendingMeta);
        const message = err instanceof Error ? err.message : String(err);
        return {
          title: 'run_shell_streaming',
          output: `run_shell_streaming failed: ${capPreview(message)}`,
          metadata: { exitCode: null, isError: true, truncated: false },
        };
      } finally {
        ctx.abort.removeEventListener('abort', onAbort);
      }
    },
  });
};
