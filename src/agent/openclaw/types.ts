/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenClaw Gateway Protocol Types
 *
 * Based on OpenClaw Gateway WebSocket protocol v3.
 * Reference: https://github.com/openclaw/openclaw/tree/main/src/gateway/protocol
 */

// ========== Protocol Version ==========

export const OPENCLAW_PROTOCOL_VERSION = 3 as const;

// ========== Base Frame Types ==========

export interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: ErrorShape;
}

export interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: StateVersion;
}

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

// ========== Error Types ==========

export interface ErrorShape {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
}

// ========== State Types ==========

export interface StateVersion {
  snapshot: number;
  presence: number;
}

// ========== Connect Flow Types ==========

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    displayName?: string;
    version: string;
    platform: string;
    mode: string;
    instanceId?: string;
  };
  caps?: string[];
  commands?: string[];
  permissions?: Record<string, boolean>;
  pathEnv?: string;
  role?: string;
  scopes?: string[];
  device?: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce?: string;
  };
  auth?: {
    token?: string;
    password?: string;
  };
}

export interface HelloOk {
  type: 'hello-ok';
  protocol: number;
  server: {
    version: string;
    commit?: string;
    host?: string;
    connId: string;
  };
  features: {
    methods: string[];
    events: string[];
  };
  snapshot: Snapshot;
  canvasHostUrl?: string;
  auth?: {
    deviceToken: string;
    role: string;
    scopes: string[];
    issuedAtMs?: number;
  };
  policy: {
    maxPayload: number;
    maxBufferedBytes: number;
    tickIntervalMs: number;
  };
}

export interface Snapshot {
  presence: PresenceEntry[];
  stateVersion: StateVersion;
}

export interface PresenceEntry {
  connId: string;
  clientId: string;
  displayName?: string;
  role: string;
  scopes: string[];
  mode: string;
  caps: string[];
}

// ========== Chat Types ==========

export interface ChatSendParams {
  sessionKey: string;
  message: string;
  thinking?: string;
  deliver?: boolean;
  attachments?: unknown[];
  timeoutMs?: number;
  idempotencyKey: string;
}

export interface ChatAbortParams {
  sessionKey: string;
  runId?: string;
}

export interface ChatHistoryParams {
  sessionKey: string;
  limit?: number;
}

export interface ChatEvent {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'delta' | 'final' | 'aborted' | 'error';
  message?: unknown;
  errorMessage?: string;
  usage?: unknown;
  stopReason?: string;
}

// ========== Agent Types ==========

export interface AgentEvent {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  data: Record<string, unknown>;
}

// ========== Session Types ==========

export interface SessionsResolveParams {
  key?: string;
  sessionId?: string;
  label?: string;
  agentId?: string;
  spawnedBy?: string;
  includeGlobal?: boolean;
  includeUnknown?: boolean;
}

export interface SessionsListParams {
  limit?: number;
  activeMinutes?: number;
  includeGlobal?: boolean;
  includeUnknown?: boolean;
  includeDerivedTitles?: boolean;
  includeLastMessage?: boolean;
  label?: string;
  spawnedBy?: string;
  agentId?: string;
  search?: string;
}

export interface SessionsPatchParams {
  key: string;
  label?: string | null;
  model?: string | null;
  // ... other optional fields
}

// ========== Tick Event ==========

export interface TickEvent {
  ts: number;
}

// ========== Shutdown Event ==========

export interface ShutdownEvent {
  reason: string;
  restartExpectedMs?: number;
}

// ========== Gateway Client Modes ==========

export const GATEWAY_CLIENT_MODES = {
  BACKEND: 'backend',
  FRONTEND: 'frontend',
  PROBE: 'probe',
} as const;

export type GatewayClientMode = (typeof GATEWAY_CLIENT_MODES)[keyof typeof GATEWAY_CLIENT_MODES];

// ========== Gateway Client IDs (must match OpenClaw's allowed values) ==========

export const GATEWAY_CLIENT_IDS = {
  WEBCHAT_UI: 'webchat-ui',
  CONTROL_UI: 'openclaw-control-ui',
  WEBCHAT: 'webchat',
  CLI: 'cli',
  GATEWAY_CLIENT: 'gateway-client',
  MACOS_APP: 'openclaw-macos',
  IOS_APP: 'openclaw-ios',
  ANDROID_APP: 'openclaw-android',
  NODE_HOST: 'node-host',
  TEST: 'test',
  FINGERPRINT: 'fingerprint',
  PROBE: 'openclaw-probe',
} as const;

export type GatewayClientId = (typeof GATEWAY_CLIENT_IDS)[keyof typeof GATEWAY_CLIENT_IDS];

// Backward compatible alias
export const GATEWAY_CLIENT_NAMES = GATEWAY_CLIENT_IDS;
export type GatewayClientName = GatewayClientId;

// ========== Gateway Connection Config ==========

export interface OpenClawGatewayConfig {
  /** Gateway host (default: localhost) */
  host?: string;
  /** Gateway port (default: 18789) */
  port: number;
  /** Authentication token */
  token?: string;
  /** Authentication password */
  password?: string;
  /** Connect to external gateway instead of spawning */
  useExternalGateway?: boolean;
  /** CLI path for spawning gateway (default: openclaw) */
  cliPath?: string;
}

// ========== Gateway Client Options ==========

export interface OpenClawGatewayClientOptions {
  url?: string;
  token?: string;
  password?: string;
  instanceId?: string;
  clientName?: string;
  clientDisplayName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: GatewayClientMode;
  role?: string;
  scopes?: string[];
  minProtocol?: number;
  maxProtocol?: number;
  onEvent?: (evt: EventFrame) => void;
  onHelloOk?: (hello: HelloOk) => void;
  onConnectError?: (err: Error) => void;
  onClose?: (code: number, reason: string) => void;
}

// ========== Gateway Close Code Hints ==========

export const GATEWAY_CLOSE_CODE_HINTS: Readonly<Record<number, string>> = {
  1000: 'normal closure',
  1006: 'abnormal closure (no close frame)',
  1008: 'policy violation',
  1012: 'service restart',
};
