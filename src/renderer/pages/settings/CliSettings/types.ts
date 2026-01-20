/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CliSettingsConfig } from '@/common/storage';

/**
 * CLI 设置面板 Props
 * CLI Settings Panel Props
 */
export interface CliSettingsPanelProps {
  backend: string;
  name: string;
  cliPath: string;
  config: CliSettingsConfig;
  onConfigChange: (config: CliSettingsConfig) => void;
}

/**
 * CLI 设置加载状态
 * CLI Settings Loading State
 */
export interface CliSettingsState {
  settings: Record<string, CliSettingsConfig>;
  loading: boolean;
  error: string | null;
}

/**
 * 检测到的 CLI Agent
 * Detected CLI Agent
 */
export interface DetectedCliAgent {
  backend: string;
  name: string;
  cliPath?: string;
}
