/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical definitions live in common/types/agent/detectedAgent.ts
import type { RemoteAgentProtocol, RemoteAgentAuthType } from '@/common/types/agent/detectedAgent';
export type { RemoteAgentProtocol, RemoteAgentAuthType } from '@/common/types/agent/detectedAgent';

/** Last known connection status (cached for UI display) */
export type RemoteAgentStatus = 'unknown' | 'connected' | 'pending' | 'reconnecting' | 'error';

/** Remote Agent instance configuration (corresponds to remote_agents DB table) */
export type RemoteAgentConfig = {
  id: string;
  name: string;
  protocol: RemoteAgentProtocol;
  url: string;
  auth_type: RemoteAgentAuthType;
  auth_token?: string;
  /** Skip TLS certificate verification (for self-signed certificates) */
  allow_insecure?: boolean;
  /**
   * Tool-host mode for OpenCode agents (C04): 'local' (default) injects a
   * client-side fs MCP and denies the server's built-in tools; 'server' uses
   * the OpenCode server's own tools against its working tree. Ignored by
   * non-opencode protocols.
   */
  tool_host?: 'local' | 'server';
  avatar?: string;
  description?: string;
  /** Ed25519 public key SHA256 fingerprint (OpenClaw protocol only, per-agent) */
  device_id?: string;
  /** Ed25519 public key PEM (OpenClaw protocol only) */
  device_public_key?: string;
  /** Ed25519 private key PEM (OpenClaw protocol only) */
  device_private_key?: string;
  /** Device token issued by Gateway after hello-ok (OpenClaw protocol only) */
  device_token?: string;
  status?: RemoteAgentStatus;
  last_connected_at?: number;
  created_at: number;
  updated_at: number;
};

/** Parameters for creating/updating a remote agent config */
export type RemoteAgentInput = {
  name: string;
  protocol: RemoteAgentProtocol;
  url: string;
  auth_type: RemoteAgentAuthType;
  auth_token?: string;
  /** Skip TLS certificate verification (for self-signed certificates) */
  allow_insecure?: boolean;
  /** Tool-host mode for OpenCode agents: 'local' (default) or 'server'. */
  tool_host?: 'local' | 'server';
  avatar?: string;
  description?: string;
};

/**
 * One active server-side session on a remote OpenCode agent. Returned by
 * `ipcBridge.remoteAgent.listSessions` (which proxies the upstream
 * `GET /session`). Powers the "View Active Sessions" picker that lets the
 * user attach a new Chisl conversation to an existing session for
 * cross-device handoff.
 */
export type RemoteSession = {
  /** OpenCode session id (`ses_...`). Used as `extra.sessionKey` on attach. */
  id: string;
  /** Server-side session title (often the first user prompt). May be empty
   *  on freshly created sessions. */
  title?: string;
  /** Last-activity timestamp in milliseconds. Absent on older OpenCode
   *  builds that don't emit `time.updated`. */
  updated_at?: number;
};

/**
 * Live connectivity status for the AionCore plugin installed on a remote
 * OpenCode agent. Returned as part of {@link RemoteAgentPluginInfo} from
 * `GET /api/remote-agents/{id}/plugin` and the rotate-token endpoint.
 */
export type RemoteAgentPluginStatus = {
  connected: boolean;
  last_hello_at: number | null;
  plugin_version: string | null;
  opencode_version: string | null;
  hooks: string[];
  events_connected: boolean;
  audit_count: number;
};

/**
 * Full plugin installation bundle for a remote OpenCode agent. Includes the
 * config snippet, env vars, bearer token, and live status. Returned by
 * `GET /api/remote-agents/{id}/plugin` and
 * `POST /api/remote-agents/{id}/plugin/rotate-token`.
 */
export type RemoteAgentPluginInfo = {
  endpoint_url: string;
  candidates: string[];
  token: string;
  config_snippet: string;
  env_snippet: string;
  status: RemoteAgentPluginStatus;
};
