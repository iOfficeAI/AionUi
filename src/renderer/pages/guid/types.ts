/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackendConfig, AcpModelInfo } from '@/common/types/acpTypes';

/**
 * Available agent entry returned by the backend.
 * `agent_type` is the top-level discriminant (acp, aionrs, nanobot, etc.).
 * `backend` is only present when `agent_type === 'acp'` (claude, qwen, codex, …).
 */
export type AvailableAgent = {
  agent_type: string;
  backend?: string;
  name: string;
  cli_path?: string;
  custom_agent_id?: string;
  is_preset?: boolean;
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
  agent_type: string;
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
