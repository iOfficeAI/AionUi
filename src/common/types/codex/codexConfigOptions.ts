/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AcpSessionConfigOption } from '@/common/types/acpTypes';

/**
 * Default Codex config options shown on the Guid page when a live ACP probe
 * hasn't populated cached configOptions yet.
 */
export const DEFAULT_CODEX_CONFIG_OPTIONS: AcpSessionConfigOption[] = [
  {
    id: 'model_reasoning_effort',
    name: 'Reasoning effort',
    category: 'reasoning',
    type: 'select',
    currentValue: 'medium',
    options: [
      { value: 'medium', name: 'Medium' },
      { value: 'high', name: 'High' },
      { value: 'xhigh', name: 'Maximum' },
    ],
  },
];

export const DEFAULT_CHATGPT_CONFIG_OPTIONS: AcpSessionConfigOption[] = [
  {
    id: 'reasoning_effort',
    name: 'Reasoning effort',
    category: 'reasoning',
    type: 'select',
    currentValue: 'medium',
    options: [
      { value: 'minimal', name: 'Minimal' },
      { value: 'low', name: 'Low' },
      { value: 'medium', name: 'Medium' },
      { value: 'high', name: 'High' },
    ],
  },
];

export function getDefaultAcpConfigOptions(
  backend: AcpBackend | 'custom' | undefined,
  currentModel?: TProviderWithModel
): AcpSessionConfigOption[] {
  if (backend === 'codex') {
    return DEFAULT_CODEX_CONFIG_OPTIONS;
  }

  if (backend === 'aionrs' && currentModel?.platform === 'chatgpt') {
    return DEFAULT_CHATGPT_CONFIG_OPTIONS;
  }

  return [];
}
