/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE video cost-wall core (Lane 3, war-game heavy-lane guardrail) —
 * all pure:
 *   (1) cost preview math (rounds UP; min 1s duration; tier multiplier).
 *   (2) DEFAULT tier = Fast/720p (cheaper); 1080p is the explicit upgrade.
 *   (3) the submit GATE invariant: video ALWAYS requires confirm; allowed only
 *       after confirm.
 *   (4) explicit-upgrade guard (1080p only via an explicit user toggle).
 *
 * No Electron/fs/network — same pattern as creditsCore.test.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  buildVideoSubmitGate,
  DEFAULT_VIDEO_DURATION_SECONDS,
  DEFAULT_VIDEO_TIER_ID,
  estimateVideoCost,
  getVideoTier,
  isExplicitUpgrade,
  VIDEO_TIERS,
} from '@/common/config/videoCostCore';

// ---------------------------------------------------------------------------
// (2) default tier — Fast/720p is the cheaper resting default
// ---------------------------------------------------------------------------

describe('VIDEO_TIERS — default + upgrade shape', () => {
  it('has exactly one default tier and it is Fast/720p', () => {
    const defaults = VIDEO_TIERS.filter((t) => t.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe('fast');
    expect(defaults[0].resolution).toBe('720p');
    expect(DEFAULT_VIDEO_TIER_ID).toBe('fast');
  });

  it('marks 1080p (hd) as the explicit upgrade and never the default', () => {
    const hd = VIDEO_TIERS.find((t) => t.id === 'hd');
    expect(hd).toBeDefined();
    expect(hd?.resolution).toBe('1080p');
    expect(hd?.isUpgrade).toBe(true);
    expect(hd?.isDefault).toBe(false);
  });

  it('prices the upgrade strictly above the default per second', () => {
    const fast = getVideoTier('fast');
    const hd = getVideoTier('hd');
    expect(hd.creditsPerSecond).toBeGreaterThan(fast.creditsPerSecond);
  });

  it('getVideoTier falls back to the default tier for an unknown id', () => {
    // @ts-expect-error — exercising the runtime fallback for a bad id.
    expect(getVideoTier('nope').isDefault).toBe(true);
    expect(getVideoTier(undefined).id).toBe('fast');
  });
});

// ---------------------------------------------------------------------------
// (1) cost preview math
// ---------------------------------------------------------------------------

describe('estimateVideoCost — preview math', () => {
  it('defaults to the typical clip length + Fast/720p tier', () => {
    const preview = estimateVideoCost({});
    expect(preview.durationSeconds).toBe(DEFAULT_VIDEO_DURATION_SECONDS);
    expect(preview.tier.id).toBe('fast');
    expect(preview.isUpgrade).toBe(false);
    // 5s × 8 credits/s = 40.
    expect(preview.estimatedCredits).toBe(40);
  });

  it('rounds the estimate UP so the preview never under-states', () => {
    // 3.2s × 8 = 25.6 → ceil(duration) 4s × 8 = 32 (duration ceil first).
    const preview = estimateVideoCost({ durationSeconds: 3.2 });
    expect(preview.durationSeconds).toBe(4);
    expect(preview.estimatedCredits).toBe(32);
  });

  it('floors a degenerate (0/negative) duration to the default clip length', () => {
    expect(estimateVideoCost({ durationSeconds: 0 }).durationSeconds).toBe(DEFAULT_VIDEO_DURATION_SECONDS);
    expect(estimateVideoCost({ durationSeconds: -5 }).durationSeconds).toBe(DEFAULT_VIDEO_DURATION_SECONDS);
  });

  it('costs MORE for the 1080p upgrade at the same duration', () => {
    const fast = estimateVideoCost({ durationSeconds: 5, tierId: 'fast' });
    const hd = estimateVideoCost({ durationSeconds: 5, tierId: 'hd' });
    expect(hd.estimatedCredits).toBeGreaterThan(fast.estimatedCredits);
    expect(hd.isUpgrade).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (3) the submit gate invariant — video ALWAYS requires confirm
// ---------------------------------------------------------------------------

describe('buildVideoSubmitGate — explicit-confirm invariant', () => {
  it('always requires confirm and is NOT allowed before confirm', () => {
    const gate = buildVideoSubmitGate({ confirmed: false });
    expect(gate.requiresConfirm).toBe(true);
    expect(gate.allowed).toBe(false);
    expect(gate.defaultTierId).toBe('fast');
  });

  it('is allowed only once the user has explicitly confirmed', () => {
    const gate = buildVideoSubmitGate({ confirmed: true });
    expect(gate.requiresConfirm).toBe(true);
    expect(gate.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (4) explicit-upgrade guard
// ---------------------------------------------------------------------------

describe('isExplicitUpgrade — 1080p only via explicit toggle', () => {
  it('is true only when the upgrade tier was explicitly toggled', () => {
    expect(isExplicitUpgrade({ selectedTierId: 'hd', userToggledUpgrade: true })).toBe(true);
  });

  it('is false when on the upgrade tier without an explicit toggle', () => {
    expect(isExplicitUpgrade({ selectedTierId: 'hd', userToggledUpgrade: false })).toBe(false);
  });

  it('is false for the default (non-upgrade) tier regardless of the toggle', () => {
    expect(isExplicitUpgrade({ selectedTierId: 'fast', userToggledUpgrade: true })).toBe(false);
    expect(isExplicitUpgrade({ selectedTierId: 'fast', userToggledUpgrade: false })).toBe(false);
  });
});
