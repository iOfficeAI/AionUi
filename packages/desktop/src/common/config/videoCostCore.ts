/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE VIDEO generation cost-wall — pure core (Lane 3, war-game guardrail).
 *
 * Video is the single MOST expensive action in the credit economy: one ~5s clip
 * can cost an order of magnitude more credits than a chat turn or an image. The
 * pricing/trial war-game flagged the heavy video lane as a margin-drain risk, so
 * the desktop NEVER fires a video generation silently:
 *
 *   1. Before any video request the user sees a transparent COST PREVIEW
 *      ("Dieses ~5s-Video kostet ca. N Credits — fortfahren?") and must
 *      EXPLICITLY confirm.
 *   2. The cheaper Fast/720p tier is the DEFAULT. 1080p (and any "high" quality)
 *      is an explicit, opt-in UPGRADE — never the default selection.
 *
 * This module is PURE (no Electron, no fs, no network) so the credit MATH and
 * the default-tier DECISION are unit-testable in plain Node (vitest), mirroring
 * `creditsCore.ts` / `eveInferenceCore.ts`. The renderer (`VideoCostWall.tsx`)
 * is presentation + the confirm wiring on top of this.
 */

// ---------------------------------------------------------------------------
// Tiers (Fast/720p default; 1080p = explicit upgrade)
// ---------------------------------------------------------------------------

/** Video quality tier ids. `fast` is the default; `hd` (1080p) is the upgrade. */
export type VideoQualityTier = 'fast' | 'hd';

/** Supported video resolutions. 720p rides with `fast`, 1080p with `hd`. */
export type VideoResolution = '720p' | '1080p';

export interface VideoTierSpec {
  id: VideoQualityTier;
  resolution: VideoResolution;
  /**
   * Credits per second of generated video at this tier (calibration constant;
   * the binding price is the backend's — these are the desktop preview figures,
   * deliberately conservative / rounded-up so the preview never UNDER-states).
   */
  creditsPerSecond: number;
  /** True for the cheaper DEFAULT tier (Fast/720p). Exactly one tier is default. */
  isDefault: boolean;
  /** True iff selecting this tier is an explicit upgrade (1080p). */
  isUpgrade: boolean;
}

/**
 * The two video tiers (spec / war-game guardrail). Fast/720p is the resting
 * default; HD/1080p is ~2.5× the credits and must be explicitly chosen.
 */
export const VIDEO_TIERS: readonly VideoTierSpec[] = [
  { id: 'fast', resolution: '720p', creditsPerSecond: 8, isDefault: true, isUpgrade: false },
  { id: 'hd', resolution: '1080p', creditsPerSecond: 20, isDefault: false, isUpgrade: true },
] as const;

/** The cheaper Fast/720p tier id — the default the wall pre-selects. */
export const DEFAULT_VIDEO_TIER_ID: VideoQualityTier = 'fast';

/** A typical clip length (seconds) used when the caller does not specify one. */
export const DEFAULT_VIDEO_DURATION_SECONDS = 5;

/** Look up a tier spec by id (falls back to the default tier if unknown). */
export function getVideoTier(id: VideoQualityTier | undefined): VideoTierSpec {
  return VIDEO_TIERS.find((t) => t.id === id) ?? VIDEO_TIERS.find((t) => t.isDefault) ?? VIDEO_TIERS[0];
}

// ---------------------------------------------------------------------------
// Cost preview math
// ---------------------------------------------------------------------------

export interface VideoCostRequest {
  /** Clip duration in seconds (defaults to DEFAULT_VIDEO_DURATION_SECONDS). */
  durationSeconds?: number;
  /** Selected quality tier (defaults to the Fast/720p default tier). */
  tierId?: VideoQualityTier;
}

export interface VideoCostPreview {
  /** Resolved clip duration (seconds, min 1). */
  durationSeconds: number;
  /** The resolved tier the estimate is for. */
  tier: VideoTierSpec;
  /** Estimated credits this generation will cost (rounded UP — never understate). */
  estimatedCredits: number;
  /** Convenience: true iff the resolved tier is the explicit 1080p upgrade. */
  isUpgrade: boolean;
}

/**
 * Estimate the credit cost of a video generation. Rounds UP so the preview is a
 * conservative ceiling (a user should never be surprised by a HIGHER charge than
 * the wall showed). Duration is floored to a minimum of 1s so a degenerate
 * `0`/negative never previews "0 credits".
 */
export function estimateVideoCost(request: VideoCostRequest): VideoCostPreview {
  const rawDuration = request.durationSeconds;
  const durationSeconds =
    typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0
      ? Math.ceil(rawDuration)
      : DEFAULT_VIDEO_DURATION_SECONDS;
  const tier = getVideoTier(request.tierId);
  const estimatedCredits = Math.ceil(durationSeconds * tier.creditsPerSecond);
  return { durationSeconds, tier, estimatedCredits, isUpgrade: tier.isUpgrade };
}

// ---------------------------------------------------------------------------
// The pre-submit gate decision (explicit-confirm guardrail)
// ---------------------------------------------------------------------------

/**
 * The pre-submit gate state. The wall MUST require an explicit confirm before a
 * video request fires; this models the decision purely so the renderer cannot
 * accidentally let a video through un-confirmed.
 */
export interface VideoSubmitGate {
  /** Whether the cost-wall must be shown before submitting (always true for video). */
  requiresConfirm: boolean;
  /** Whether the request is currently allowed to proceed (only after confirm). */
  allowed: boolean;
  /** The default tier the wall pre-selects (the cheaper Fast/720p). */
  defaultTierId: VideoQualityTier;
}

/**
 * Build the pre-submit gate for a video request. `confirmed` reflects whether
 * the user has explicitly pressed "fortfahren" in the wall for THIS request.
 *
 * INVARIANT: video ALWAYS `requiresConfirm`; it is only `allowed` once
 * `confirmed === true`. There is no path where a video submits without the user
 * having seen the cost preview and confirmed.
 */
export function buildVideoSubmitGate(args: { confirmed: boolean }): VideoSubmitGate {
  return {
    requiresConfirm: true,
    allowed: args.confirmed === true,
    defaultTierId: DEFAULT_VIDEO_TIER_ID,
  };
}

/**
 * Guard that an upgrade to 1080p (the `hd` tier) was an EXPLICIT user action.
 * The wall starts on the default tier; this returns true only when the selected
 * tier is the upgrade AND the user explicitly toggled it (never auto-selected).
 */
export function isExplicitUpgrade(args: { selectedTierId: VideoQualityTier; userToggledUpgrade: boolean }): boolean {
  const tier = getVideoTier(args.selectedTierId);
  if (!tier.isUpgrade) return false;
  return args.userToggledUpgrade === true;
}

// ---------------------------------------------------------------------------
// Video-generation INTENT detection (the send-path seam)
// ---------------------------------------------------------------------------

/**
 * Phrases that signal the user is asking to GENERATE a video (the heavy lane),
 * not merely mentioning the word "video". Kept deliberately high-precision so a
 * chat that only references videos ("schau dir dieses Video an") does NOT trip
 * the cost-wall — the wall only fires on an actual generation request. Matched
 * case-insensitively against the trimmed message; DE + EN coverage.
 *
 * The list pairs a video noun with a creation verb (or a well-known short-form
 * format the videomarketer produces) so the signal is a *generation* intent.
 */
const VIDEO_GENERATION_PATTERNS: readonly RegExp[] = [
  // EN: "generate/create/make/produce a video/clip/reel/short"
  /\b(generate|create|make|produce|render|animate)\b[^.!?]{0,40}\b(video|clip|reel|short|tiktok|animation)s?\b/i,
  // EN: "video generation", "text-to-video"
  /\b(text[-\s]?to[-\s]?video|video\s+generation|ai\s+video)\b/i,
  // DE: "erstelle/mach/generiere/produziere ein Video/Clip/Reel/Short"
  /\b(erstelle?|mach|mache|generiere?|produziere?|dreh|drehe|erzeuge?)\b[^.!?]{0,40}\b(video|clip|reel|short|kurzvideo|tiktok|animation)s?\b/i,
  // DE: "Video erstellen/generieren/drehen/produzieren" (verb after noun)
  /\b(video|clip|reel|short|kurzvideo)s?\b[^.!?]{0,40}\b(erstellen|generieren|drehen|produzieren|machen|erzeugen)\b/i,
];

/**
 * Heuristically detect whether a chat message is asking to GENERATE a video.
 * Pure + dependency-light so the send-path can decide, BEFORE submitting,
 * whether to route through the cost-wall. Empty / whitespace / non-string input
 * is never a video request. False positives are minimized by requiring a
 * generation verb near a video noun (see {@link VIDEO_GENERATION_PATTERNS}).
 */
export function isVideoGenerationRequest(message: string | null | undefined): boolean {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  if (text.length === 0) return false;
  return VIDEO_GENERATION_PATTERNS.some((re) => re.test(text));
}
