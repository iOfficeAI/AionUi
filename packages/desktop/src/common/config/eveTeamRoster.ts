/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE — "Dein Team" curated A-roster (HONEST-A).
 *
 * This is a small, opinionated, OUTCOME-NAMED set of roles a user's EVE works
 * AS — NOT an assemble-your-own-company builder. There is deliberately NO
 * role-manifest schema, NO assembler, NO marketplace and NO per-agent Stripe
 * SKU here: this module is curated DATA only. A later step may add those
 * affordances; this one ships the honest fixed team plus the read-only surface
 * and the existing-delegation quick-win.
 *
 * WHY OUTCOME NAMES: the founder mandate is "nothing confusing" — a micro-SME
 * owner thinks in outcomes ("get me found on Google", "write the post"), not in
 * model ids or agent internals. Each role is therefore named for the result it
 * owns and carries a one-line outcome description in plain German.
 *
 * EACH ROLE CARRIES:
 *   - {@link EveTeamRole.agent_id}    stable kebab id (the attribution key the
 *                                     backend ledger `agent_id` column stores).
 *   - {@link EveTeamRole.displayName} the user-facing name.
 *   - {@link EveTeamRole.title}       the human role label (e.g. "Growth Lead").
 *   - {@link EveTeamRole.outcome}     plain-German outcome the role owns.
 *   - {@link EveTeamRole.tier}        the EVE Inference LEVEL it leans on
 *                                     (matches eveInferenceCore wire tiers).
 *   - {@link EveTeamRole.skills}      the Hermes skills it leans on (labels,
 *                                     not a capability grant — execution is
 *                                     still gated by the permission modes).
 *   - {@link EveTeamRole.kind}        'work' (an operator role) or 'governance'
 *                                     (a seat — CEO / Chief-of-Staff).
 *   - {@link EveTeamRole.rhythm}      'always-on' (a permanent worker you pause /
 *                                     throttle) or 'burst' (a sprint hire you
 *                                     engage / let go). This drives WHICH control
 *                                     the UI shows — see eveTeamControlsCore.
 *   - {@link EveTeamRole.free}        true iff the role runs on the bundled,
 *                                     zero-cost local Gemma model (no credits).
 *                                     The base keeps >=1 free always-on worker so
 *                                     the company is never empty (the floor).
 *
 * The `tier` values mirror {@link EveInferenceWireTier} so a role's spend lands
 * on a known EVE level; we keep this module decoupled (a plain union below) so
 * the roster stays a pure, dependency-light data table that is trivially
 * unit-testable in a plain Node (vitest) environment.
 *
 * AGENT_ID DISCIPLINE: ids are stable kebab-case, unique, and MUST NOT be
 * renamed once shipped — the backend ledger attributes spend by this exact
 * string. The reserved system default is `eve` (the un-delegated EVE itself);
 * roster ids never collide with it.
 */

/** EVE Inference level a role leans on (mirrors eveInferenceCore wire tiers). */
export type EveTeamRoleTier = 'standard' | 'high' | 'max' | 'maximum';

/**
 * Salary-grade band of a role — the SEVEN canonical Company.OS bands (G0–G6).
 * The grade maps to a fixed expected EUR/mo "salary" (the hire price) the
 * PRE-VISIBLE budget meter (P0 #1) sums over the ACTIVE team:
 *
 *   - G0 — Gratis-Sockel    : €0   the bundled zero-cost local floor (Gemma).
 *   - G1 — Content          : €25  content / SEO / writer workers.
 *   - G2 — Creative          : €35  creative / image workers.
 *   - G3 — Research          : €40  research / data workers.
 *   - G4 — Ops/Sales         : €25  ops / sales / community workers (its OWN
 *                                   band — NOT folded into G1; a future Ops/Sales
 *                                   worker projects €25, not the €60 video band).
 *   - G5 — Videomarketer     : €60  the heavy GPU video lane.
 *   - G6 — Coder             : €100 the coder (off-ICP, not in the launch roster).
 *
 * DOC PARITY: these are the seven canonical bands (G0–G6). An earlier desktop
 * enum COLLAPSED them to six (G0–G5) by folding Ops/Sales (€25) into G1 and
 * placing video at G4 / coder at G5 — that diverged the band LETTERS from the
 * canonical source even though the euro values were right. This enum is now
 * re-aligned: Ops/Sales is its own G4=€25, video is G5=€60, coder is G6=€100.
 * The euro values are pinned by {@link EVE_GRADE_SALARY_EUR} and a doc-parity
 * unit test so a future Ops/Sales worker can never be mis-priced at €60.
 *
 * Grades are PRICE BANDS, never renamed once shipped — the projected-budget math
 * keys off this exact mapping.
 */
export type EveTeamRoleGrade = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6';

/**
 * The Founder-locked expected EUR/mo "salary" (hire price) per grade band. This
 * is the SINGLE source of the per-role budget figure the projected-spend meter
 * sums. Pure data — no FX, no credits; the at-cost credit layer is a separate
 * concern (see creditsCore). Values mirror the seven canonical G0–G6 bands:
 * Content €25 · Creative €35 · Research €40 · Ops/Sales €25 · Video €60 ·
 * Coder €100. A doc-parity test pins each value so the band↔euro map cannot
 * silently drift (notably: G4 Ops/Sales = €25, NEVER €60).
 */
export const EVE_GRADE_SALARY_EUR: Record<EveTeamRoleGrade, number> = {
  G0: 0,
  G1: 25, // Content
  G2: 35, // Creative
  G3: 40, // Research
  G4: 25, // Ops/Sales (own band — not folded into G1, not the €60 video band)
  G5: 60, // Videomarketer (heavy GPU lane)
  G6: 100, // Coder (off-ICP, deferred)
} as const;

/**
 * Canonical band → worker-class label (G0–G6). The single doc-parity reference a
 * unit test asserts against so the band LETTERS can never silently re-collapse:
 * Ops/Sales must stay its OWN G4 band (€25), not fold back into G1, and video /
 * coder must stay at G5 / G6 (not G4 / G5). Pure labels — no behavior.
 */
export const EVE_CANONICAL_GRADE_CLASS: Record<EveTeamRoleGrade, string> = {
  G0: 'Gratis-Sockel',
  G1: 'Content',
  G2: 'Creative',
  G3: 'Research',
  G4: 'Ops/Sales',
  G5: 'Videomarketer',
  G6: 'Coder',
} as const;

/** A role is either an operator ("work") or a governance seat. */
export type EveTeamRoleKind = 'work' | 'governance';

/**
 * A role's working rhythm — the pre-mortem distinction that keeps the controls
 * honest:
 *   - 'always-on' : a permanent member of the company. You PAUSE or THROTTLE
 *                   (drosseln) it — you do not "fire" it. It stays on the team.
 *   - 'burst'     : engaged for a sprint / a specific push. You HIRE it for a
 *                   sprint (einstellen) and LET IT GO (entlassen) when done.
 * The control surface is keyed off this field — see eveTeamControlsCore.
 */
export type EveTeamRoleRhythm = 'always-on' | 'burst';

export interface EveTeamRole {
  /** Stable kebab id — the backend ledger `agent_id` attribution key. Never rename. */
  agent_id: string;
  /** User-facing name. */
  displayName: string;
  /** Human role label (e.g. "Growth Lead (CMO)"). */
  title: string;
  /** Plain-German outcome this role owns. */
  outcome: string;
  /** EVE Inference level the role leans on. */
  tier: EveTeamRoleTier;
  /**
   * Salary-grade band (the seven canonical G0–G6 bands). Drives the PRE-VISIBLE
   * budget: each role's expected EUR/mo "salary" is
   * {@link EVE_GRADE_SALARY_EUR}[grade]. The free local floor (G0) costs €0;
   * paid cloud roles carry G1..G6 (Content G1 · Creative G2 · Research G3 ·
   * Ops/Sales G4 · Video G5 · Coder G6).
   */
  grade: EveTeamRoleGrade;
  /** Hermes skills the role leans on (labels only — not a capability grant). */
  skills: string[];
  /** 'work' (operator) or 'governance' (seat). */
  kind: EveTeamRoleKind;
  /** Working rhythm — drives which control the UI shows (pause/throttle vs hire/fire). */
  rhythm: EveTeamRoleRhythm;
  /**
   * True iff this role runs on the bundled zero-cost local Gemma model. At least
   * one free always-on worker exists so the non-empty floor can never be undercut
   * (the company is never empty). Defaults to false (a paid cloud-tier role).
   */
  free?: boolean;
}

/** The reserved system default agent id (un-delegated EVE itself). */
export const EVE_SYSTEM_AGENT_ID = 'eve';

/**
 * The curated A-roster. Small + opinionated on purpose. Order is presentation
 * order: governance seats first (they own the company), then the growth/content
 * operators, then the eval/research support role.
 */
export const EVE_TEAM_ROSTER: readonly EveTeamRole[] = [
  // ── Governance seats (always-on — the company always has its leadership) ──
  {
    agent_id: 'ceo',
    displayName: 'EVE',
    title: 'CEO',
    outcome: 'Setzt Prioritäten, trifft Entscheidungen und hält den Kurs.',
    tier: 'high',
    // Governance seats are part of the included base subscription, not an
    // incremental metered hire — so they carry the €0 grade (they never add to
    // the projected hire-spend hull; the base price already covers leadership).
    grade: 'G0',
    skills: ['strategy', 'planning', 'decision-making'],
    kind: 'governance',
    rhythm: 'always-on',
  },
  {
    agent_id: 'chief-of-staff',
    displayName: 'Stabschef',
    title: 'Chief of Staff',
    outcome: 'Koordiniert die Arbeit, verteilt Aufgaben und fasst Ergebnisse zusammen.',
    tier: 'high',
    // Included in the base subscription (see CEO note) — €0 incremental.
    grade: 'G0',
    skills: ['coordination', 'delegation', 'reporting'],
    kind: 'governance',
    rhythm: 'always-on',
  },
  // ── The free local floor (Hauspförtner / FAQ) ───────────────────────────
  // G0: the bundled, zero-cost local Gemma always-on worker. This is the
  // non-empty floor — the base always keeps at least one of these so the
  // company is never empty. No card, no credits, ever.
  {
    agent_id: 'house-keeper',
    displayName: 'Hauspförtner',
    title: 'Empfang / FAQ (G0, gratis lokal)',
    outcome: 'Beantwortet einfache Fragen rund um die Uhr — kostenlos und lokal, ohne Credits.',
    tier: 'standard',
    // G0 — the free local Gratis-Sockel: €0/mo, never adds to the budget.
    grade: 'G0',
    skills: ['faq', 'triage', 'local-chat'],
    kind: 'work',
    rhythm: 'always-on',
    free: true,
  },
  // ── Growth / content operators ──────────────────────────────────────
  // Always-on operators run the steady drumbeat (you pause / throttle them);
  // burst operators are engaged for a specific push (you hire for a sprint /
  // let them go).
  {
    agent_id: 'growth-lead',
    displayName: 'Growth Lead',
    title: 'Growth Lead (CMO)',
    outcome: 'Bringt neue Kunden — plant Kampagnen und misst, was wirkt.',
    tier: 'max',
    // G4 — Ops/Sales band (€25/mo). Growth/CMO is a sales-side worker; it sits
    // in its OWN G4 Ops/Sales band, not the G1 Content band.
    grade: 'G4',
    skills: ['marketing-strategy', 'campaign-planning', 'analytics'],
    kind: 'work',
    rhythm: 'always-on',
  },
  {
    agent_id: 'seo-lead',
    displayName: 'SEO',
    title: 'SEO Lead',
    outcome: 'Macht dich bei Google sichtbar — Keywords, On-Page und Content-Lücken.',
    tier: 'high',
    // G1 — Content band (SEO/content, €25/mo).
    grade: 'G1',
    skills: ['seo-audit', 'keyword-research', 'web-search'],
    kind: 'work',
    rhythm: 'always-on',
  },
  {
    agent_id: 'content-writer',
    displayName: 'Autor',
    title: 'Content / Writer',
    outcome: 'Schreibt Blogposts, Newsletter und Landingpages in deiner Stimme.',
    tier: 'standard',
    // G1 — Content band (€25/mo).
    grade: 'G1',
    skills: ['content-creation', 'copywriting', 'brand-voice'],
    kind: 'work',
    rhythm: 'always-on',
  },
  {
    agent_id: 'reddit-lead',
    displayName: 'Reddit',
    title: 'Reddit / Community',
    outcome: 'Findet die richtigen Subreddits und antwortet ohne Werbe-Geruch.',
    tier: 'standard',
    // G4 — Ops/Sales band (community/social outreach, €25/mo).
    grade: 'G4',
    skills: ['community', 'web-search', 'social-listening'],
    kind: 'work',
    rhythm: 'burst',
  },
  {
    agent_id: 'video-marketer',
    displayName: 'Video',
    title: 'Videomarketer',
    outcome: 'Plant Kurzvideos und Hooks für Shorts, Reels und TikTok.',
    tier: 'max',
    // G5 — Videomarketer (the heavy GPU video lane, €60/mo).
    grade: 'G5',
    skills: ['video-script', 'storyboard', 'social-video'],
    kind: 'work',
    rhythm: 'burst',
  },
  // ── Eval / research support ─────────────────────────────────────────
  {
    agent_id: 'eval-research',
    displayName: 'Recherche',
    title: 'Eval / Research',
    outcome: 'Prüft Behauptungen, recherchiert Quellen und bewertet Ergebnisse.',
    tier: 'maximum',
    // G3 — Research band (research/data, €40/mo).
    grade: 'G3',
    skills: ['research', 'fact-check', 'evaluation'],
    kind: 'work',
    rhythm: 'burst',
  },
] as const;

/** Roster role ids, as a set, for fast membership checks. */
const ROSTER_AGENT_IDS: ReadonlySet<string> = new Set(EVE_TEAM_ROSTER.map((r) => r.agent_id));

/** The heavy GPU video-lane worker's stable agent id (the videomarketer). */
export const VIDEO_MARKETER_AGENT_ID = 'video-marketer';

/**
 * Phrases that ADDRESS the videomarketer worker by name/role in a chat message
 * (DE + EN). Used by the send-path as a fail-safe video-lane signal (DUX-6): a
 * message that explicitly hands the task to the videomarketer reaches the heavy
 * lane even if the NL video-intent regex misses, so the cost-wall still fires.
 * Matched case-insensitively against the trimmed message.
 */
const VIDEO_MARKETER_ADDRESS_PATTERNS: readonly RegExp[] = [
  /@?\bvideomarketer\b/i,
  /@?\bvideo[-\s]?marketer\b/i,
  /\bvideo[-\s]?marketing\b/i,
];

/**
 * True iff the message explicitly addresses the videomarketer worker by name or
 * role. Pure + dependency-light. This is a HELPFUL extra signal for the video
 * cost-wall fail-safe — never the sole gate (the resolved capability/worker is).
 */
export function addressesVideoMarketer(message: string | null | undefined): boolean {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  if (text.length === 0) return false;
  return VIDEO_MARKETER_ADDRESS_PATTERNS.some((re) => re.test(text));
}

/** True iff `id` is a known roster role id (the system default `eve` is NOT a roster role). */
export function isEveTeamAgentId(id: string | null | undefined): boolean {
  return typeof id === 'string' && ROSTER_AGENT_IDS.has(id);
}

/** Find a roster role by its stable agent id, or undefined. */
export function findEveTeamRole(agentId: string | null | undefined): EveTeamRole | undefined {
  if (typeof agentId !== 'string') return undefined;
  return EVE_TEAM_ROSTER.find((r) => r.agent_id === agentId);
}

/**
 * The expected EUR/mo "salary" (hire price) of a role, resolved from its grade
 * band via {@link EVE_GRADE_SALARY_EUR}. This is the single per-role figure the
 * PRE-VISIBLE budget meter sums over the ACTIVE team. Free local (G0) is €0.
 */
export function roleSalaryEur(role: Pick<EveTeamRole, 'grade'>): number {
  return EVE_GRADE_SALARY_EUR[role.grade] ?? 0;
}

/**
 * Resolve the agent id to attribute an inference call to. Returns the role id
 * verbatim when it is a known roster role; otherwise falls back to the reserved
 * system default ({@link EVE_SYSTEM_AGENT_ID}). This is the single rule the
 * desktop uses to stamp the eve-inference request so the backend ledger
 * `agent_id` column attributes spend to the character (or to `eve` when EVE
 * answers directly, un-delegated).
 */
export function resolveAttributionAgentId(candidate: string | null | undefined): string {
  return isEveTeamAgentId(candidate) ? (candidate as string) : EVE_SYSTEM_AGENT_ID;
}

/**
 * Display label for a delegated worker, given the agent id a `delegate_task`
 * carries. Used by the renderer to show "dein Team verteilt die Arbeit" — who
 * is on a delegated sub-task. Falls back to "EVE" for the system default and to
 * the raw id for an unknown worker (never throws, never hides the activity).
 */
export function eveTeamWorkerLabel(agentId: string | null | undefined): string {
  const role = findEveTeamRole(agentId);
  if (role) return `${role.displayName} · ${role.title}`;
  if (typeof agentId === 'string' && agentId === EVE_SYSTEM_AGENT_ID) return 'EVE';
  return typeof agentId === 'string' && agentId.trim().length > 0 ? agentId.trim() : 'EVE';
}
