/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ChannelRuntimeMode = 'runtime' | 'legacy';

/**
 * Resolve channel runtime mode.
 *
 * Default is `runtime` to fully replace in-process ChannelManager lifecycle
 * in Electron main process. Set `AIONUI_CHANNEL_MODE=legacy` to opt back
 * into the previous in-process mode.
 */
export function resolveChannelRuntimeMode(value = process.env.AIONUI_CHANNEL_MODE): ChannelRuntimeMode {
  return value === 'legacy' ? 'legacy' : 'runtime';
}

export function isLegacyChannelRuntime(value = process.env.AIONUI_CHANNEL_MODE): boolean {
  return resolveChannelRuntimeMode(value) === 'legacy';
}
