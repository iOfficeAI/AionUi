/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the pure decision helper behind the one-time
 * hardware-acceleration auto-disable notice.
 */

import { describe, it, expect } from 'vitest';
import { shouldNotifyGpuAutoDisable } from '@/renderer/components/layout/gpuAutoDisableDecision';

describe('shouldNotifyGpuAutoDisable', () => {
  it('does not notify when hardware acceleration is not auto-disabled', () => {
    expect(shouldNotifyGpuAutoDisable({ autoDisabled: false, lastCrashAt: 123 }, null)).toBe(false);
  });

  it('does not notify when there is no recorded crash timestamp', () => {
    expect(shouldNotifyGpuAutoDisable({ autoDisabled: true, lastCrashAt: null }, null)).toBe(false);
  });

  it('notifies on a fresh auto-disable episode that was never acknowledged', () => {
    expect(shouldNotifyGpuAutoDisable({ autoDisabled: true, lastCrashAt: 1000 }, null)).toBe(true);
  });

  it('does not notify again for an already-acknowledged episode', () => {
    expect(shouldNotifyGpuAutoDisable({ autoDisabled: true, lastCrashAt: 1000 }, 1000)).toBe(false);
  });

  it('notifies again when a newer crash episode occurs', () => {
    expect(shouldNotifyGpuAutoDisable({ autoDisabled: true, lastCrashAt: 2000 }, 1000)).toBe(true);
  });
});
