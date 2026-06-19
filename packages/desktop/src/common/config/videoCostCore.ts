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
   * Credits per second of generated video at this tier — CALIBRATED to the
   * backend's real Seedance per-second USD price (1 credit = 1 US-cent of
   * at-cost spend, the credit-unit invariant from creditsCore). The preview MUST
   * equal what the backend will actually debit, so these are NOT free-chosen
   * "conservative" desktop figures — they are pinned to the registry:
   *
   *   SSOT: eve-app `eve-model-registry` Seedance `usd_price` (per-second).
   *     - Seedance Fast 720p   ≈ $0.2419/s  →  ≈ 24 credits/s  (ceil(24.19)).
   *     - Seedance Standard 1080p ≈ $0.682/s →  ≈ 68 credits/s  (ceil(68.2)).
   *
   * The prior desktop figures (8 / 20) UNDER-stated by ~3× — the wall showed far
   * fewer credits than the backend would debit (DUX-2). These calibrated rates
   * close that honesty gap. If the registry `usd_price` changes, update BOTH the
   * backend registry and these constants (the test pins them — see
   * videoCostCore.test.ts). Per-second credits are rounded UP from the USD cents
   * so the preview is a ceiling, never an under-state.
   */
  creditsPerSecond: number;
  /** True for the cheaper DEFAULT tier (Fast/720p). Exactly one tier is default. */
  isDefault: boolean;
  /** True iff selecting this tier is an explicit upgrade (1080p). */
  isUpgrade: boolean;
}

/**
 * The two video tiers (spec / war-game guardrail). Fast/720p is the resting
 * default; HD/1080p is the explicit upgrade.
 *
 * `creditsPerSecond` is CALIBRATED to the backend Seedance `usd_price` (1 credit
 * = 1 US-cent), so the wall preview equals the real debit:
 *   - Fast/720p:   $0.2419/s → 24 credits/s.
 *   - HD/1080p:    $0.682/s  → 68 credits/s.
 * SSOT = eve-app `eve-model-registry`. Do not hand-tune these in isolation.
 */
export const VIDEO_TIERS: readonly VideoTierSpec[] = [
  { id: 'fast', resolution: '720p', creditsPerSecond: 24, isDefault: true, isUpgrade: false },
  { id: 'hd', resolution: '1080p', creditsPerSecond: 68, isDefault: false, isUpgrade: true },
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
  // EN: "generate/create/make/produce/edit a video/clip/reel/short/spot/ad"
  /\b(generate|create|make|produce|render|animate|edit|cut|film|shoot|design|build|whip\s+up)\b[^.!?]{0,60}\b(video|clip|reel|short|shorts|tiktok|tik[-\s]?tok|animation|spot|ad|advert|commercial|trailer|montage|footage|story|stories|movie)s?\b/i,
  // EN: noun-first — "a video for ... — create it", "video ad", "promo video"
  /\b(video|clip|reel|short|kurzvideo|tiktok|tik[-\s]?tok|animation|spot|trailer)s?\b[^.!?]{0,60}\b(generate|create|make|produce|render|animate|edit|cut|film|shoot|design|build|für\s+mich|for\s+me)\b/i,
  // EN: format/lane keywords — "text-to-video", "ai video", "video generation"
  /\b(text[-\s]?to[-\s]?video|img[-\s]?to[-\s]?video|image[-\s]?to[-\s]?video|video\s+gen(eration)?|ai\s+video|video\s+ad|promo\s+video|explainer\s+video|product\s+video)\b/i,
  // DE: "erstelle/mach/generiere/produziere/schneide/drehe/brauche ein Video/Clip/Reel/Short"
  /\b(erstell|erstelle|erstellst|mach|mache|machst|generier|generiere|generierst|produzier|produziere|dreh|drehe|drehst|erzeug|erzeuge|schneid|schneide|bau|baue|design|entwirf|brauch|brauche|brauchst|braucht|will|möcht|möchte|möchtest|hätte?\s+gern)\b[^.!?]{0,60}\b(video|clip|reel|short|shorts|kurzvideo|tiktok|tik[-\s]?tok|animation|spot|werbespot|werbevideo|trailer|imagefilm|film|produktvideo)s?\b/i,
  // DE: verb-after-noun — "Video erstellen/generieren/schneiden/produzieren"
  /\b(video|clip|reel|short|shorts|kurzvideo|tiktok|tik[-\s]?tok|animation|spot|werbespot|werbevideo|trailer|imagefilm|produktvideo)s?\b[^.!?]{0,60}\b(erstellen|erstell|generieren|generier|drehen|dreh|produzieren|produzier|machen|mach|erzeugen|erzeug|schneiden|schneid|bauen|bau|für\s+mich)\b/i,
];

/**
 * Heuristically detect whether a chat message is asking to GENERATE a video
 * (the heavy paid lane). Pure + dependency-light so the send-path can decide,
 * BEFORE submitting, whether to route through the cost-wall.
 *
 * IMPORTANT (DUX-6): this regex is a HELPFUL pre-filter, NOT the sole gate. A
 * narrow NL regex will always have false-negatives, and a missed video request
 * silently bypasses the most expensive lane in the credit economy. The send-path
 * MUST ALSO gate on the resolved video capability / addressed videomarketer
 * (see {@link isVideoLaneRequest} / {@link requestRoutesToVideoLane}). The regex
 * widens recall (DE/EN, more verbs + short-form/ad/spot/trailer formats), but the
 * fail-safe is the capability gate, not this function.
 *
 * Empty / whitespace / non-string input is never a video request.
 */
export function isVideoGenerationRequest(message: string | null | undefined): boolean {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  if (text.length === 0) return false;
  return VIDEO_GENERATION_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------------------
// Fail-safe video-lane gate (DUX-6) — do NOT rely on the NL regex alone
// ---------------------------------------------------------------------------

/**
 * The stable roster agent id of the heavy video lane worker (the videomarketer).
 * Mirrors `eveTeamRoster` `video-marketer` — duplicated here as a plain string
 * so this module stays a pure, dependency-light core. If the roster id ever
 * changes (it must not — it is the ledger attribution key), update both.
 */
export const VIDEO_LANE_AGENT_ID = 'video-marketer';

/**
 * Hermes skills that mark a worker as the heavy GPU video lane. If a request is
 * routed to a worker that owns ANY of these, the cost-wall MUST fire — regardless
 * of what the prompt text said. Mirrors the `video-marketer` role's `skills`.
 */
const VIDEO_LANE_SKILLS: ReadonlySet<string> = new Set(['video-script', 'storyboard', 'social-video']);

/** Inputs the send-path knows about a pending send, used to decide video routing. */
export interface VideoLaneRouting {
  /** The raw chat message (run through the NL classifier). */
  message?: string | null;
  /** The agent id the request is addressed to / resolved to (if any). */
  resolvedAgentId?: string | null;
  /** The skill labels of the resolved worker / capability (if known). */
  resolvedSkills?: readonly string[] | null;
  /**
   * An explicit signal that the resolver already classified this as the video
   * capability (e.g. a tool/lane class). When true the wall fires unconditionally.
   */
  resolvedVideoCapability?: boolean | null;
}

/**
 * FAIL-SAFE gate (DUX-6): true iff a pending request reaches the heavy video
 * lane by ANY known path — so the cost-wall fires even when the NL regex misses.
 * The gate is the OR of every signal we have:
 *
 *   1. the request is addressed to / resolved to the videomarketer agent id, OR
 *   2. the resolved worker owns a video-lane skill (video-script/storyboard/…), OR
 *   3. the resolver explicitly flagged the video capability, OR
 *   4. (last resort) the NL prompt classifier {@link isVideoGenerationRequest}.
 *
 * Routing on the resolved capability/worker — not just the prompt — is the whole
 * point: it removes the regex as the SOLE gate. The wall over-firing (a false
 * positive) is cheap and recoverable (the user cancels); a false-negative silently
 * spends on the most expensive lane, which is the failure we refuse.
 */
export function requestRoutesToVideoLane(routing: VideoLaneRouting): boolean {
  if (routing.resolvedVideoCapability === true) return true;
  if (typeof routing.resolvedAgentId === 'string' && routing.resolvedAgentId.trim() === VIDEO_LANE_AGENT_ID) {
    return true;
  }
  if (Array.isArray(routing.resolvedSkills) && routing.resolvedSkills.some((s) => VIDEO_LANE_SKILLS.has(s))) {
    return true;
  }
  return isVideoGenerationRequest(routing.message);
}

/**
 * Convenience alias kept readable at the send-path call-site. Identical to
 * {@link requestRoutesToVideoLane}; named for the question the gate answers
 * ("is this the video lane?") so the SendBox reads as a fail-safe, not a regex.
 */
export function isVideoLaneRequest(routing: VideoLaneRouting): boolean {
  return requestRoutesToVideoLane(routing);
}

// ---------------------------------------------------------------------------
// Resolved video-request payload (DUX-5) — what CONFIRM actually sends
// ---------------------------------------------------------------------------

/** The user's resolved selection from the cost-wall (tier + previewed credits). */
export interface ResolvedVideoSelection {
  tierId: VideoQualityTier;
  estimatedCredits: number;
}

/**
 * Build the message the send-path dispatches AFTER the user confirms the wall
 * (DUX-5). The prior wiring discarded the resolved tier/resolution/cost and
 * re-fired the UNMODIFIED original text — so confirming did NOT actually route a
 * video request at the chosen spec. This appends an explicit, agent-readable
 * video directive carrying the resolved resolution + per-clip credit ceiling, so
 * the request the videomarketer/video lane receives matches exactly what the
 * user saw and approved.
 *
 * The directive is a deterministic suffix (idempotent: not appended twice) so it
 * is both human-legible and parseable by the agent. The original intent text is
 * preserved verbatim ahead of it.
 */
export function buildResolvedVideoMessage(originalMessage: string, resolved: ResolvedVideoSelection): string {
  const tier = getVideoTier(resolved.tierId);
  const directive =
    `[EVE:VIDEO tier=${tier.id} resolution=${tier.resolution} ` +
    `quality=${tier.isUpgrade ? 'hd' : 'fast'} credits<=${resolved.estimatedCredits}]`;
  const base = typeof originalMessage === 'string' ? originalMessage : '';
  if (base.includes('[EVE:VIDEO ')) return base; // idempotent — never double-stamp.
  const trimmed = base.replace(/\s+$/, '');
  return trimmed.length > 0 ? `${trimmed}\n\n${directive}` : directive;
}
