/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IGpuStatus } from '@/common/adapter/ipcBridge';

/** localStorage key holding the `lastCrashAt` of the last acknowledged notice. */
export const GPU_AUTO_DISABLE_ACK_KEY = 'aionui.gpuAutoDisableNoticeAckAt';

/**
 * Decide whether to surface the one-time "hardware acceleration auto-disabled"
 * notice. We notify once per crash episode: when auto-recovery has disabled
 * hardware acceleration and the triggering crash timestamp differs from the one
 * the user already acknowledged. A later, distinct crash episode notifies again.
 */
export function shouldNotifyGpuAutoDisable(
  status: Pick<IGpuStatus, 'autoDisabled' | 'lastCrashAt'>,
  ackedAt: number | null
): boolean {
  if (!status.autoDisabled) {
    return false;
  }
  if (!status.lastCrashAt) {
    return false;
  }
  return status.lastCrashAt !== ackedAt;
}
