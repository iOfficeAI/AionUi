/**
 * Wire-protocol types for the AionCore plugin channel (protocol v1).
 *
 * All payloads are camelCase JSON, carried over Bearer-authenticated HTTP
 * (or SSE, for the events stream).
 */

export const PROTOCOL_VERSION = 1 as const;
export const PLUGIN_VERSION = '0.2.0';

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

/** GET /plugin/events — `voice_mode` push payload. */
export type VoiceModeUpdate = {
  /** Session scope. `undefined` or `null` means "global default". */
  sessionID?: string | null;
  /** Whether voice mode is enabled. */
  enabled: boolean;
};

export type SseEvent =
  | { type: 'ping' }
  | { type: 'context.update'; data: ContextUpdate }
  | { type: 'voice_mode'; data: VoiceModeUpdate };

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

/* -------------------------------------------------------------------------- */
/* Background process API (POST /tools/bg)                                    */
/* -------------------------------------------------------------------------- */

/** Status of a background process. */
export type BgProcessStatus = 'running' | 'exited' | 'killed';

/** Snapshot of a background process returned by AionCore. */
export type BgProcessInfo = {
  id: string;
  name?: string;
  command: string;
  cwd: string;
  sessionId: string;
  status: BgProcessStatus;
  exitCode?: number;
  startedAtMs: number;
  endedAtMs?: number;
  outputBytes: number;
  truncated: boolean;
};

/** POST /tools/bg — `op: "start"`. */
export type BgStartRequest = {
  op: 'start';
  command: string;
  cwd?: string;
  sessionId: string;
  callId?: string;
  name?: string;
  timeoutSecs?: number;
};

/** POST /tools/bg — `op: "stop"`. */
export type BgStopRequest = {
  op: 'stop';
  processId: string;
  sessionId: string;
};

/** POST /tools/bg — `op: "list"`. */
export type BgListRequest = {
  op: 'list';
  sessionId: string;
};

/** POST /tools/bg — `op: "read"`. */
export type BgReadRequest = {
  op: 'read';
  processId: string;
  sessionId: string;
  offset?: number;
};

/** Discriminated union of all `/tools/bg` request bodies. */
export type BgRequest = BgStartRequest | BgStopRequest | BgListRequest | BgReadRequest;

/** Success response for `op: "start"` and `op: "stop"`. */
export type BgProcessResponse = { ok: true; process: BgProcessInfo };

/** Success response for `op: "list"`. */
export type BgListResponse = { ok: true; processes: BgProcessInfo[] };

/** Success response for `op: "read"`. */
export type BgReadResponse = { ok: true; output: string; nextOffset: number; process: BgProcessInfo };

/** Server-reported error envelope. */
export type BgErrorResponse = { ok: false; error: string };

/** All success response shapes for `/tools/bg`. */
export type BgSuccessResponse = BgProcessResponse | BgListResponse | BgReadResponse;

/** All possible response shapes for `/tools/bg` (success or error). */
export type BgResponse = BgSuccessResponse | BgErrorResponse;

/** POST /tools/bg_tail — request body. */
export type BgTailRequest = {
  processId: string;
  sessionId: string;
  fromOffset?: number;
};

/** SSE event payloads from /tools/bg_tail. */
export type BgTailChunk = {
  data: string;
  offset: number;
};

export type BgTailDone = {
  exitCode: number | null;
  status: BgProcessStatus;
};

export type BgTailError = {
  message: string;
};

export type BgTailStreamEvent =
  | { type: 'chunk'; data: BgTailChunk }
  | { type: 'done'; data: BgTailDone }
  | { type: 'error'; data: BgTailError };
