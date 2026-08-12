/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** The platforms for which we ship a per-OS install command. */
export type AgentPlatform = 'macos' | 'linux' | 'windows';

/**
 * Detect the current OS platform from `navigator.userAgentData.platform` /
 * `navigator.platform`. Accepts an explicit `platform` override for tests.
 * Defaults to `linux` when the platform cannot be determined.
 */
export function detectAgentPlatform(declared?: string): AgentPlatform {
  let source = declared;
  if (source === undefined && typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    source = nav.userAgentData?.platform ?? nav.platform;
  }
  const p = (source ?? '').toLowerCase();
  if (p.includes('mac')) return 'macos';
  if (p.includes('win')) return 'windows';
  return 'linux';
}
