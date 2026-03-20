/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend, AcpBackendConfig, AcpModelInfo, PresetAgentType } from '@/common/types/acpTypes';

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
  // Allow extension-contributed adapter IDs (e.g. 'ext-buddy') in addition to built-in PresetAgentType values
  presetAgentType?: PresetAgentType | string;
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
 * agentType and originalType are widened to string to support extension-contributed adapter IDs.
 */
export type EffectiveAgentInfo = {
  agentType: PresetAgentType | string;
  isFallback: boolean;
  originalType: PresetAgentType | string;
  isAvailable: boolean;
};

/**
 * Re-export commonly used ACP types for convenience.
 */
export type { AcpBackend, AcpBackendConfig, AcpModelInfo, PresetAgentType };
