/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend, AcpBackendConfig, AcpModelInfo, PresetAgentType } from '@/types/acpTypes';

/**
 * Available agent entry returned by the backend.
 */
export type AvailableAgent = {
  backend: AcpBackend;
  name: string;
  cliPath?: string;
  customAgentId?: string;
  isPreset?: boolean;
  context?: string;
  avatar?: string;
  presetAgentType?: PresetAgentType;
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
};

/**
 * Effective agent type info used for UI display and send logic.
 */
export type EffectiveAgentInfo = {
  agentType: PresetAgentType;
  isFallback: boolean;
  originalType: PresetAgentType;
  isAvailable: boolean;
};

/**
 * Re-export commonly used ACP types for convenience.
 */
export type { AcpBackend, AcpBackendConfig, AcpModelInfo, PresetAgentType };
