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
  buildResolvedVideoMessage,
  buildVideoSubmitGate,
  DEFAULT_VIDEO_DURATION_SECONDS,
  DEFAULT_VIDEO_TIER_ID,
  estimateVideoCost,
  getVideoTier,
  isExplicitUpgrade,
  isVideoGenerationRequest,
  isVideoLaneRequest,
  requestRoutesToVideoLane,
  VIDEO_LANE_AGENT_ID,
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

  // DUX-2: the per-second credit rate MUST equal the backend Seedance debit
  // (1 credit = 1 US-cent). SSOT = eve-app `eve-model-registry` Seedance
  // usd_price: Fast/720p $0.2419/s → ceil 24; Standard/1080p $0.682/s → ceil 68.
  // The prior 8/20 figures under-stated the real charge by ~3× (dishonest
  // preview). If the registry usd_price changes, update BOTH the registry and
  // VIDEO_TIERS, and this pin.
  it('pins per-second credits to the CALIBRATED backend Seedance rate (1 credit = 1 US-cent)', () => {
    expect(getVideoTier('fast').creditsPerSecond).toBe(24); // ceil($0.2419/s × 100)
    expect(getVideoTier('hd').creditsPerSecond).toBe(68); //   ceil($0.682/s × 100)
  });

  it('the calibrated rates are no LONGER the old ~3× under-stated 8/20', () => {
    // Regression guard: the honesty bug was the preview being ~3× below debit.
    expect(getVideoTier('fast').creditsPerSecond).not.toBe(8);
    expect(getVideoTier('hd').creditsPerSecond).not.toBe(20);
    // And the calibrated rates are within ~1 credit of the registry USD cents.
    expect(getVideoTier('fast').creditsPerSecond).toBeCloseTo(24.19, 0);
    expect(getVideoTier('hd').creditsPerSecond).toBeCloseTo(68.2, 0);
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
    // CALIBRATED: 5s × 24 credits/s = 120 (Seedance Fast 720p, matches debit).
    expect(preview.estimatedCredits).toBe(120);
  });

  it('rounds the estimate UP so the preview never under-states', () => {
    // 3.2s → ceil(duration) 4s × 24 credits/s = 96 (duration ceil first).
    const preview = estimateVideoCost({ durationSeconds: 3.2 });
    expect(preview.durationSeconds).toBe(4);
    expect(preview.estimatedCredits).toBe(96);
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

// ---------------------------------------------------------------------------
// (5) video-generation INTENT detection (the send-path seam)
// ---------------------------------------------------------------------------

describe('isVideoGenerationRequest — high-precision generation-intent detection', () => {
  it('detects EN generation requests', () => {
    expect(isVideoGenerationRequest('Generate a video for our launch')).toBe(true);
    expect(isVideoGenerationRequest('please create a short reel for TikTok')).toBe(true);
    expect(isVideoGenerationRequest('make a 5s clip about the product')).toBe(true);
    expect(isVideoGenerationRequest('do a text-to-video of the hero shot')).toBe(true);
  });

  it('detects DE generation requests (verb before OR after the noun)', () => {
    expect(isVideoGenerationRequest('Erstelle ein Video für die Kampagne')).toBe(true);
    expect(isVideoGenerationRequest('Mach mir ein kurzes Reel für Instagram')).toBe(true);
    expect(isVideoGenerationRequest('Ich möchte ein Video erstellen')).toBe(true);
    expect(isVideoGenerationRequest('Bitte ein Kurzvideo generieren')).toBe(true);
  });

  it('does NOT trip on a mere mention of a video (no generation intent)', () => {
    expect(isVideoGenerationRequest('schau dir dieses Video an')).toBe(false);
    expect(isVideoGenerationRequest('the video was great, thanks')).toBe(false);
    expect(isVideoGenerationRequest('summarize this YouTube link')).toBe(false);
    expect(isVideoGenerationRequest('write a blog post about marketing')).toBe(false);
  });

  it('is false for empty / whitespace / non-string input', () => {
    expect(isVideoGenerationRequest('')).toBe(false);
    expect(isVideoGenerationRequest('   ')).toBe(false);
    expect(isVideoGenerationRequest(null)).toBe(false);
    expect(isVideoGenerationRequest(undefined)).toBe(false);
  });

  // DUX-6: the hardened classifier must catch MORE real video-intent phrasings
  // (ad/spot/trailer/promo formats, more verbs, both word orders) so fewer heavy
  // requests slip past — without tripping on a mere mention.
  it('detects the broadened video-intent phrasings (DUX-6 recall)', () => {
    expect(isVideoGenerationRequest('schneide mir einen Werbespot für Instagram')).toBe(true);
    expect(isVideoGenerationRequest('mach ein Produktvideo für die Landingpage')).toBe(true);
    expect(isVideoGenerationRequest('ich brauche ein Video für den Launch')).toBe(true);
    expect(isVideoGenerationRequest('cut a promo video for the product')).toBe(true);
    expect(isVideoGenerationRequest('whip up a TikTok ad for us')).toBe(true);
    expect(isVideoGenerationRequest('design a trailer for the campaign')).toBe(true);
    expect(isVideoGenerationRequest('a product video for me — create it')).toBe(true);
  });

  it('still does NOT trip on mere mentions after broadening', () => {
    expect(isVideoGenerationRequest('schau dir dieses Video an')).toBe(false);
    expect(isVideoGenerationRequest('the trailer was great, thanks')).toBe(false);
    expect(isVideoGenerationRequest('what time is the ad meeting?')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (6) FAIL-SAFE video-lane gate (DUX-6) — not the NL regex alone
// ---------------------------------------------------------------------------

describe('requestRoutesToVideoLane — fail-safe gate on the resolved capability/worker', () => {
  it('fires when the resolver explicitly flags the video capability (regex irrelevant)', () => {
    // A message the NL regex would MISS, but the resolver classified as video.
    expect(requestRoutesToVideoLane({ message: 'do the thing we talked about', resolvedVideoCapability: true })).toBe(true);
  });

  it('fires when the request is addressed/resolved to the videomarketer agent', () => {
    expect(requestRoutesToVideoLane({ message: 'handle it', resolvedAgentId: VIDEO_LANE_AGENT_ID })).toBe(true);
    expect(VIDEO_LANE_AGENT_ID).toBe('video-marketer');
  });

  it('fires when the resolved worker owns a video-lane skill', () => {
    expect(requestRoutesToVideoLane({ message: 'go', resolvedSkills: ['storyboard'] })).toBe(true);
    expect(requestRoutesToVideoLane({ message: 'go', resolvedSkills: ['social-video', 'copywriting'] })).toBe(true);
  });

  it('falls back to the NL classifier as a LAST resort when no resolver signal', () => {
    expect(requestRoutesToVideoLane({ message: 'Erstelle ein Video für die Kampagne' })).toBe(true);
  });

  it('does NOT fire for a plain non-video request with no video signal at all', () => {
    expect(requestRoutesToVideoLane({ message: 'write a blog post about marketing' })).toBe(false);
    expect(requestRoutesToVideoLane({ message: 'handle it', resolvedAgentId: 'content-writer' })).toBe(false);
    expect(requestRoutesToVideoLane({ message: 'go', resolvedSkills: ['copywriting'] })).toBe(false);
  });

  it('isVideoLaneRequest is the readable alias of the same gate', () => {
    expect(isVideoLaneRequest({ resolvedVideoCapability: true })).toBe(true);
    expect(isVideoLaneRequest({ message: 'just chatting' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (7) Resolved video message on CONFIRM (DUX-5)
// ---------------------------------------------------------------------------

describe('buildResolvedVideoMessage — confirm carries the resolved tier/resolution/cost', () => {
  it('appends an explicit video directive with the resolved spec (not the bare text)', () => {
    const out = buildResolvedVideoMessage('Mach ein Reel für den Launch', { tierId: 'fast', estimatedCredits: 120 });
    expect(out).toContain('Mach ein Reel für den Launch');
    expect(out).toContain('[EVE:VIDEO ');
    expect(out).toContain('tier=fast');
    expect(out).toContain('resolution=720p');
    expect(out).toContain('quality=fast');
    expect(out).toContain('credits<=120');
  });

  it('carries the 1080p upgrade resolution + higher cost when the user upgraded', () => {
    const out = buildResolvedVideoMessage('Make a launch video', { tierId: 'hd', estimatedCredits: 340 });
    expect(out).toContain('tier=hd');
    expect(out).toContain('resolution=1080p');
    expect(out).toContain('quality=hd');
    expect(out).toContain('credits<=340');
  });

  it('is idempotent — never double-stamps the directive', () => {
    const once = buildResolvedVideoMessage('clip pls', { tierId: 'fast', estimatedCredits: 120 });
    const twice = buildResolvedVideoMessage(once, { tierId: 'hd', estimatedCredits: 999 });
    expect(twice).toBe(once);
    expect((twice.match(/\[EVE:VIDEO /g) ?? []).length).toBe(1);
  });

  it('still emits the directive even when the original text is empty', () => {
    const out = buildResolvedVideoMessage('', { tierId: 'fast', estimatedCredits: 120 });
    expect(out.startsWith('[EVE:VIDEO ')).toBe(true);
  });

  it('the resolved message DIFFERS from the unmodified original (the DUX-5 bug)', () => {
    const original = 'Erstelle ein Kurzvideo';
    const resolved = buildResolvedVideoMessage(original, { tierId: 'hd', estimatedCredits: 340 });
    // Confirming must NOT just re-fire the original text — it carries the spec.
    expect(resolved).not.toBe(original);
  });
});
