/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical definitions live in common/types/detectedAgent.ts
import type { RemoteAgentProtocol, RemoteAgentAuthType } from '@/common/types/detectedAgent';
export type { RemoteAgentProtocol, RemoteAgentAuthType } from '@/common/types/detectedAgent';

/** Last known connection status (cached for UI display) */
export type RemoteAgentStatus = 'unknown' | 'connected' | 'pending' | 'error';

/** Remote Agent instance configuration (corresponds to remote_agents DB table) */
export type RemoteAgentConfig = {
  id: string;
  name: string;
  protocol: RemoteAgentProtocol;
  url: string;
  authType: RemoteAgentAuthType;
  authToken?: string;
  /** Skip TLS certificate verification (for self-signed certificates) */
  allowInsecure?: boolean;
  avatar?: string;
  description?: string;
  /** Ed25519 public key SHA256 fingerprint (OpenClaw protocol only, per-agent) */
  deviceId?: string;
  /** Ed25519 public key PEM (OpenClaw protocol only) */
  devicePublicKey?: string;
  /** Ed25519 private key PEM (OpenClaw protocol only) */
  devicePrivateKey?: string;
  /** Device token issued by Gateway after hello-ok (OpenClaw protocol only) */
  deviceToken?: string;
  status?: RemoteAgentStatus;
  lastConnectedAt?: number;
  createdAt: number;
  updatedAt: number;
};

/** Parameters for creating/updating a remote agent config */
export type RemoteAgentInput = {
  name: string;
  protocol: RemoteAgentProtocol;
  url: string;
  authType: RemoteAgentAuthType;
  authToken?: string;
  /** Skip TLS certificate verification (for self-signed certificates) */
  allowInsecure?: boolean;
  avatar?: string;
  description?: string;
};
