/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackendConfig, AcpModelInfo } from '@/common/types/acpTypes';

/**
 * Available agent entry returned by the backend.
 * `backend` is typed as `string` because the IPC layer returns plain strings
 * and the superset includes non-ACP values like `'remote'` and `'aionrs'`.
 */
export type AvailableAgent = {
  backend: string;
  name: string;
  cliPath?: string;
  customAgentId?: string;
  isPreset?: boolean;
  context?: string;
  avatar?: string;
  presetAgentType?: string;
  isExtension?: boolean;
  extensionName?: string;
};

/**
 * Computed mention option for the @ mention dropdown.
 */
export type MentionOption = {
  key: string;
  label: string;
  tokens: Set<string>;
  avatar: string | undefined;
  avatarImage: string | undefined;
  logo: string | undefined;
  isExtension?: boolean;
};

/**
 * Effective agent type info used for UI display and send logic.
 */
export type EffectiveAgentInfo = {
  agentType: string;
  isFallback: boolean;
  originalType: string;
  isAvailable: boolean;
};

/**
 * Re-export commonly used ACP types for convenience.
 * `AcpBackend` is re-exported as `string` to match the widened `AvailableAgent.backend`.
 */
export type AcpBackend = string;
export type { AcpBackendConfig, AcpModelInfo };
