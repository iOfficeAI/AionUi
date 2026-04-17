/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Detection layer types — represents available execution engines in the system.
 *
 * Each `kind` corresponds to a distinct execution engine / communication protocol.
 * Assistants (user-configured presets with skills, prompts, etc.) are a configuration
 * layer that *references* these execution engines — they are NOT detected agents.
 *
 * Uses generic `DetectedAgent<K>`:
 *   - `DetectedAgent`           — any kind, for generic lists
 *   - `DetectedAgent<'acp'>`    — ACP-specific fields directly accessible
 *   - `DetectedAgent<'remote'>` — Remote-specific fields directly accessible
 */

/** Remote agent communication protocol */
export type RemoteAgentProtocol = 'openclaw' | 'zeroclaw' | 'acp';

/** Remote agent authentication method */
export type RemoteAgentAuthType = 'bearer' | 'password' | 'none';

/** Execution engine kinds — each uses a different protocol or runtime */
export type DetectedAgentKind = 'gemini' | 'acp' | 'remote' | 'aionrs' | 'openclaw-gateway' | 'nanobot';

/** Kind-specific fields mapping */
type KindFields = {
  gemini: {};

  acp: {
    /** Resolved CLI binary path */
    cliPath?: string;
    /** Extra arguments passed to the ACP CLI */
    acpArgs?: string[];
    /** Whether this agent was contributed by an extension */
    isExtension?: boolean;
    /** Name of the contributing extension */
    extensionName?: string;
    /** Extension-contributed custom agent ID (e.g. 'ext:name:adapterId') */
    customAgentId?: string;
  };

  remote: {
    /** Remote agent config ID (FK to remote_agents table) */
    remoteAgentId: string;
    /** WebSocket endpoint URL */
    url: string;
    /** Remote communication protocol */
    protocol: RemoteAgentProtocol;
    /** Remote authentication method */
    authType: RemoteAgentAuthType;
  };

  aionrs: {
    /** Resolved CLI binary path */
    cliPath?: string;
    /** Binary version string */
    version?: string;
  };

  'openclaw-gateway': {
    /** Resolved CLI binary path */
    cliPath?: string;
    /** Gateway WebSocket URL */
    gatewayUrl?: string;
  };

  nanobot: {
    /** Resolved CLI binary path */
    cliPath?: string;
  };
};

/**
 * Detected execution engine.
 *
 * @typeParam K - Narrows to a specific kind for direct field access.
 *               Defaults to the full union for generic lists.
 */
export type DetectedAgent<K extends DetectedAgentKind = DetectedAgentKind> = {
  id: string;
  name: string;
  kind: K;
  available: boolean;
  /** Backend identifier used for routing and display */
  backend: string;
} & KindFields[K];

// Convenience aliases
export type AcpDetectedAgent = DetectedAgent<'acp'>;
export type GeminiDetectedAgent = DetectedAgent<'gemini'>;
export type RemoteDetectedAgent = DetectedAgent<'remote'>;
export type AionrsDetectedAgent = DetectedAgent<'aionrs'>;
export type NanobotDetectedAgent = DetectedAgent<'nanobot'>;
export type OpenClawDetectedAgent = DetectedAgent<'openclaw-gateway'>;

// Type guard — narrows a generic DetectedAgent to a specific kind
export function isAgentKind<K extends DetectedAgentKind>(agent: DetectedAgent, kind: K): agent is DetectedAgent<K> {
  return agent.kind === kind;
}
