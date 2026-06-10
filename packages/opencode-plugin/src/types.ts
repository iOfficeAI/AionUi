/**
 * Wire-protocol types for the AionCore plugin channel (protocol v1).
 *
 * All payloads are camelCase JSON, carried over Bearer-authenticated HTTP
 * (or SSE, for the events stream).
 */

export const PROTOCOL_VERSION = 1 as const;
export const PLUGIN_VERSION = '0.1.0';

/** POST /plugin/hello — request body. */
export type HelloRequest = {
  protocolVersion: number;
  pluginVersion: string;
  opencodeVersion?: string;
  hooks: string[];
  project?: {
    directory: string;
    worktree: string;
  };
};

/** POST /plugin/hello — response body. */
export type HelloResponse = {
  ok: true;
  protocolVersion: number;
};

/** GET /plugin/events — server-sent event payloads. */
export type ContextUpdate = {
  /** Optional session scope; if omitted, applies globally. */
  sessionID?: string;
  /** Strings to push into the system prompt. */
  system?: string[];
  /** Human-readable note for debugging. */
  note?: string;
};

export type SseEvent = { type: 'ping' } | { type: 'context.update'; data: ContextUpdate };

/** POST /plugin/result — discriminated union on `kind`. */
export type ToolBeforePayload = {
  kind: 'toolBefore';
  tool: string;
  sessionId: string;
  callId: string;
  args: unknown;
};

export type ToolAfterPayload = {
  kind: 'toolAfter';
  tool: string;
  sessionId: string;
  callId: string;
  args: unknown;
  title?: string;
  outputLen?: number;
  outputPreview?: string;
  metadata?: unknown;
};

export type EventPayload = {
  kind: 'event';
  event: unknown;
};

export type PermissionAskPayload = {
  kind: 'permissionAsk';
  permission: unknown;
};

export type ResultRequest = ToolBeforePayload | ToolAfterPayload | EventPayload | PermissionAskPayload;

/** Generic ok response (non-permission). */
export type OkResponse = { ok: true };

/** Response shape for `permissionAsk`. */
export type PermissionResponse = {
  ok: true;
  status: 'allow' | 'deny' | 'ask';
};

export type ResultResponse = OkResponse | PermissionResponse;

/** POST /tools/run_shell_streaming — request body. */
export type RunShellStreamingRequest = {
  command: string;
  cwd?: string;
  sessionId: string;
  callId?: string;
  timeoutSecs?: number;
};

/** Streamed events from run_shell_streaming. */
export type RunShellChunk = {
  stream: 'stdout' | 'stderr';
  data: string;
};

export type RunShellDone = {
  exitCode: number | null;
  isError: boolean;
  truncated: boolean;
};

export type RunShellError = {
  message: string;
};

export type RunShellStreamEvent =
  | { type: 'chunk'; data: RunShellChunk }
  | { type: 'done'; data: RunShellDone }
  | { type: 'error'; data: RunShellError };
