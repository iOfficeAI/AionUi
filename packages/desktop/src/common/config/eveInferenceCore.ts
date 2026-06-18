/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE inference picker — pure core (STUFEN / level model).
 *
 * The founder mandate is "nothing confusing": a user picks a STUFE (level), NOT
 * a raw model id. So the picker is EXACTLY TWO groups and NOTHING else (no raw
 * CLI/agent picker, no raw provider/model list, no raw "DeepSeek"/"GLM" id in
 * the primary row):
 *
 *   - Privat (lokal):   Standard = Gemma 4 E4B, Hoch = Gemma 4 12B
 *                       (the bundled local tiers from commandEveShell.ts).
 *   - EVE Inference:    Standard, Hoch, Max, Maximum (cloud, OpenAI-compatible
 *                       Edge fn). The user sees a level; the backend resolves
 *                       the concrete model from that level via a registry.
 *
 * THE FOUR EVE LEVELS (STUFEN):
 *   - Standard  — FREE. The default for a fresh chat.
 *   - Hoch      — FREE. (Was paid in the old 3-tier model; now free.)
 *   - Max       — PAID. DeepSeek V4 Pro. Consumes credits (visible badge).
 *   - Maximum / "härteste Aufgabe" — PAID + GATED. GLM 5.2. The highest cost
 *     level: it carries a VISIBLE higher-cost badge so the ~5× rate vs Max is
 *     obvious before the user picks it.
 *
 * FREE-TIER RULES (entitlement trialing/free per entitlementCore):
 *   - EVE Max + EVE Maximum are GREYED OUT (disabled, "im Paid-Tarif" hint).
 *   - BYOK is GREYED OUT in settings (handled at the settings surface using
 *     {@link isByokDisabledForEntitlement} from this module).
 *   - Only EVE Standard + EVE Hoch + the two local tiers are selectable.
 *
 * BACKEND LEVEL REGISTRY + TIER→LEVEL BRIDGE: the eve-inference Edge Function
 * resolves the concrete upstream model from a user-facing LEVEL via a registry
 * (levels: standard, hoch/high [free], max [DeepSeek V4 Pro, paid], maximum/
 * haerteste [GLM 5.2, paid, gated]). The function also accepts the legacy tier
 * strings (standard/high/max) via a tier→level compatibility bridge, so the
 * wire value this module sends stays compatible: Standard→`standard`,
 * Hoch→`high` (legacy-compatible alias the bridge maps to the `hoch` level),
 * Max→`max`, Maximum→`maximum`.
 *
 * EVE ROUTING (all levels): every EVE Inference level routes through the
 * Command EVE backend Edge Function as an OpenAI-compatible client. We model an
 * EVE level as a synthetic {@link TProviderWithModel} pointed at the function
 * URL with the stored CEVE license WIRE STRING as the bearer credential
 * (`api_key`), then hand it to the existing `ClientFactory` so the existing
 * OpenAIRotatingClient + egress-boundary enforcement apply UNCHANGED. The
 * client never holds an OpenRouter/provider key — only the license.
 *
 * This module is PURE (no Electron, no fs, no network) so the gating + routing
 * shape is unit-testable in a plain Node (vitest) environment.
 */

import type { TProviderWithModel } from './storage';
import { COMMAND_EVE_LOCAL_MODEL_TIERS, type CommandEveLocalModelTier } from './commandEveShell';

// ---------------------------------------------------------------------------
// EVE Inference (cloud) — backend Edge Function
// ---------------------------------------------------------------------------

/**
 * The Command EVE inference Edge Function. OpenAI-compatible: POST a body of
 * `{ messages, stream, tier }` with `Authorization: Bearer <CEVE license wire>`.
 * The function (server side) resolves the actual upstream free/paid model — the
 * desktop never sees a provider key.
 */
export const EVE_INFERENCE_FUNCTION_URL =
  'https://unvbeothoimlzlolxucl.supabase.co/functions/v1/eve-inference';

/** Synthetic provider id for the EVE Inference cloud lane (one per tier). */
export const EVE_INFERENCE_PROVIDER_ID_PREFIX = 'command-eve-inference';
/** Stable provider name surfaced in receipts / egress provider tagging. */
export const EVE_INFERENCE_PROVIDER_NAME = 'EVE Inference';

/**
 * HONEST CLOUD LABELING (founder-mandated). EVE Inference is an EXTERNAL cloud
 * lane (OpenRouter free/paid models via the backend Edge Function) — it is NOT
 * private/local. The picker group heading and the in-conversation chip therefore
 * carry an explicit "(Cloud)" marker so a user can never mistake an EVE tier for
 * the private/local Gemma lane. The local group keeps its "(lokal)" marker.
 */
export const EVE_INFERENCE_GROUP_TITLE = `${EVE_INFERENCE_PROVIDER_NAME} (Cloud)`;
/**
 * Sublabel for EVE tiers (mirrors the local tiers' model-label sublabel). Makes
 * the cloud/external nature explicit on every EVE row, not just the heading.
 */
export const EVE_INFERENCE_TIER_SUBLABEL = 'Externe Free-Modelle · OpenRouter';

/**
 * EVE Inference cloud LEVELS (Stufen). `tier` is the wire value POSTed in the
 * body; the backend level registry (with the legacy tier→level bridge) maps it
 * to a concrete model. `model` is the OpenAI `model` field the client sends —
 * the function accepts a sentinel and routes by this value, so we send it as
 * the model too for a stable, self-describing request.
 *
 * Per-level UI economics (so the picker never surprises a user about cost):
 *   - `paidOnly`        — greyed out while trialing (free tiers stay open).
 *   - `consumesCredits` — show a "verbraucht Credits" marker on the row.
 *   - `gated`           — highest cost, server-gated; show the high-cost badge.
 *   - `costBadge`       — short, non-secret UI badge text (e.g. "~5× Kosten").
 *
 * The two FREE levels (Standard + Hoch) carry NO cost badge; the user can pick
 * them on a trial with no card.
 */
export const EVE_INFERENCE_TIERS = [
  {
    id: 'eve-standard',
    label: 'Standard',
    tier: 'standard',
    /** Free-tier-eligible: selectable on a trial. */
    paidOnly: false,
    consumesCredits: false,
    gated: false,
  },
  {
    id: 'eve-high',
    // STUFE: Hoch (was "High"/paid in the old 3-tier model; now FREE).
    label: 'Hoch',
    // Legacy-compatible wire alias; the backend tier→level bridge maps `high`
    // to the `hoch` level (and accepts `hoch` directly).
    tier: 'high',
    paidOnly: false,
    consumesCredits: false,
    gated: false,
  },
  {
    id: 'eve-max',
    // STUFE: Max — DeepSeek V4 Pro, paid, consumes credits.
    label: 'Max',
    tier: 'max',
    paidOnly: true,
    consumesCredits: true,
    gated: false,
    /** User-facing model behind this level (sublabel only; never the picker id). */
    modelLabel: 'DeepSeek V4 Pro',
    /** Visible credit marker. */
    costBadge: 'verbraucht Credits',
  },
  {
    id: 'eve-maximum',
    // STUFE: Maximum / "härteste Aufgabe" — GLM 5.2, paid + GATED, highest cost.
    label: 'Maximum',
    tier: 'maximum',
    paidOnly: true,
    consumesCredits: true,
    gated: true,
    modelLabel: 'GLM 5.2',
    /** Highest-cost badge so the ~5× rate vs Max is obvious before picking. */
    costBadge: '~5× Kosten',
  },
] as const;

export type EveInferenceTier = (typeof EVE_INFERENCE_TIERS)[number];
export type EveInferenceTierId = EveInferenceTier['id'];
export type EveInferenceWireTier = EveInferenceTier['tier'];

export const EVE_INFERENCE_DEFAULT_TIER_ID: EveInferenceTierId = EVE_INFERENCE_TIERS[0].id;

// ---------------------------------------------------------------------------
// Local (privat) tiers — exactly the two the founder spec lists. We REUSE the
// bundled commandEveShell tiers and intentionally surface only Standard (E4B,
// `default`) + High (12B, `opt_in`). The 31B `pro` tier is NOT part of the
// 2-group picker spec, so it is excluded here on purpose.
// ---------------------------------------------------------------------------

export interface EveLocalPickerTier {
  /** Stable picker id. */
  id: string;
  /** Display label, e.g. "Standard". */
  label: string;
  /** Underlying bundled model label, e.g. "Gemma 4 E4B". */
  modelLabel: string;
  /** commandEveShell local tier id (drives ensure/warm + acp model id). */
  localTierId: CommandEveLocalModelTier['id'];
}

/**
 * The two local picker entries. Bound by `state` to the bundled tiers so a
 * rename in commandEveShell.ts stays in sync (default ⇒ Standard, opt_in ⇒
 * Hoch). Fails loudly (throws at module load) if those states ever go missing.
 */
function resolveLocalTier(state: CommandEveLocalModelTier['state']): CommandEveLocalModelTier {
  const tier = COMMAND_EVE_LOCAL_MODEL_TIERS.find((t) => t.state === state);
  if (!tier) {
    throw new Error(`eveInferenceCore: no bundled local tier with state="${state}"`);
  }
  return tier;
}

export const EVE_LOCAL_PICKER_TIERS: EveLocalPickerTier[] = [
  {
    id: 'local-standard',
    label: 'Standard',
    modelLabel: resolveLocalTier('default').label,
    localTierId: resolveLocalTier('default').id,
  },
  {
    id: 'local-high',
    // STUFE label aligned with the cloud lane: "Hoch" (not "High").
    label: 'Hoch',
    modelLabel: resolveLocalTier('opt_in').label,
    localTierId: resolveLocalTier('opt_in').id,
  },
];

// ---------------------------------------------------------------------------
// The two-group picker model (the ONLY thing the UI renders).
// ---------------------------------------------------------------------------

export type EvePickerGroupKind = 'local' | 'eve';

export interface EvePickerItem {
  /** Unique selection value across both groups. */
  value: string;
  /** Group this item belongs to. */
  group: EvePickerGroupKind;
  /** Primary label (STUFE), e.g. "Standard" / "Hoch" / "Max" / "Maximum". */
  label: string;
  /** Secondary descriptor, e.g. "Gemma 4 E4B" (local) or "DeepSeek V4 Pro". */
  sublabel?: string;
  /** True when this item is disabled for the current entitlement (greyed). */
  disabled: boolean;
  /** Non-secret reason the item is disabled (UI hint). */
  disabledReasonCode?: 'PAID_TIER_REQUIRED';
  /** True iff this is a paid level that consumes credits (show a credit marker). */
  consumesCredits?: boolean;
  /** True iff this is the highest-cost, server-gated level (show high-cost badge). */
  gated?: boolean;
  /** Short, non-secret cost badge text, e.g. "verbraucht Credits" / "~5× Kosten". */
  costBadge?: string;
}

export interface EvePickerGroup {
  kind: EvePickerGroupKind;
  /** Group heading, e.g. "Privat (lokal)" / "EVE Inference". */
  title: string;
  items: EvePickerItem[];
}

/** Stable selection value for an EVE tier (so the UI + router agree). */
export function eveTierValue(tierId: EveInferenceTierId): string {
  return `${EVE_INFERENCE_PROVIDER_ID_PREFIX}:${tierId}`;
}

/**
 * The DEFAULT picker selection for a fresh chat. Founder mandate (software-first
 * GTM): the out-of-the-box experience is Hermes + EVE Standard (OpenRouter free
 * models, cloud) — local Gemma is opt-in. So an absent/empty persisted
 * selection resolves to EVE Standard, not the local default tier.
 */
export const EVE_DEFAULT_INFERENCE_SELECTION: string = eveTierValue(EVE_INFERENCE_DEFAULT_TIER_ID);

/**
 * Normalize a persisted selection to an effective one: an empty/absent value
 * falls back to EVE Standard (the new default). A present value is returned
 * verbatim (the picker still re-resolves a now-disabled paid tier to Standard
 * at render time). Pure, so both the picker and the send path share one rule.
 */
export function resolveEffectiveInferenceSelection(persisted: string | null | undefined): string {
  return typeof persisted === 'string' && persisted.trim().length > 0
    ? persisted
    : EVE_DEFAULT_INFERENCE_SELECTION;
}

/** Stable selection value for a local picker tier. */
export function localTierValue(id: string): string {
  return `command-eve-local:${id}`;
}

const EVE_SELECTION_PREFIX = `${EVE_INFERENCE_PROVIDER_ID_PREFIX}:`;
const LOCAL_SELECTION_PREFIX = 'command-eve-local:';

/** True iff a picker selection value belongs to the EVE Inference (cloud) group. */
export function isEveInferenceSelection(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(EVE_SELECTION_PREFIX);
}

/** True iff a picker selection value belongs to the Privat (lokal) group. */
export function isLocalSelection(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(LOCAL_SELECTION_PREFIX);
}

/**
 * Parse an EVE tier id out of a selection value (e.g.
 * "command-eve-inference:eve-standard" → "eve-standard"). Returns undefined
 * when the value is not a known EVE selection.
 */
export function parseEveTierIdFromSelection(value: string | null | undefined): EveInferenceTierId | undefined {
  if (!isEveInferenceSelection(value)) return undefined;
  const tierId = (value as string).slice(EVE_SELECTION_PREFIX.length);
  return findEveInferenceTier(tierId)?.id;
}

/**
 * Parse a local picker tier out of a selection value (e.g.
 * "command-eve-local:local-standard" → its EveLocalPickerTier). Returns
 * undefined when the value is not a known local selection.
 */
export function parseLocalTierFromSelection(value: string | null | undefined): EveLocalPickerTier | undefined {
  if (!isLocalSelection(value)) return undefined;
  const id = (value as string).slice(LOCAL_SELECTION_PREFIX.length);
  return EVE_LOCAL_PICKER_TIERS.find((tier) => tier.id === id);
}

// ---------------------------------------------------------------------------
// Startup warm-up lane selection. The shim warms whichever lane the user will
// actually hit first; we never warm the inactive lane.
// ---------------------------------------------------------------------------

/**
 * Which lane the startup warm-up should target, derived from the SAME effective
 * picker selection the send path resolves. EVE-tier selection ⇒ warm the cloud
 * route (TLS/edge + license/reachability preflight); local selection ⇒ warm the
 * bundled Ollama model. Pure + sync so it can be unit-tested and shares the
 * exact discriminant the routing resolver uses (no second source of truth).
 *
 * For an EVE selection the resolved wire `tier` is included so the preflight
 * POSTs the right tier; `undefined` tier falls back to the function default.
 */
export type CommandEveWarmupLane = { lane: 'eve'; tier?: EveInferenceWireTier } | { lane: 'local' };

export function resolveCommandEveWarmupLane(persisted: string | null | undefined): CommandEveWarmupLane {
  const selection = resolveEffectiveInferenceSelection(persisted);
  if (!isEveInferenceSelection(selection)) {
    return { lane: 'local' };
  }
  const tierId = parseEveTierIdFromSelection(selection);
  const tier = tierId ? findEveInferenceTier(tierId)?.tier : undefined;
  return { lane: 'eve', tier };
}

// ---------------------------------------------------------------------------
// Entitlement → gating. The ONLY input the gating needs is the trial flag, so
// callers pass a minimal shape (mirrors entitlementCore's status surface).
// ---------------------------------------------------------------------------

/**
 * Minimal entitlement view the picker needs. `trial_ends_at` present + non-null
 * ⇒ this is a TRIAL/free entitlement (entitlementCore CEVE.v2 contract); a paid
 * (non-trial) license keeps it null/absent.
 */
export interface EveEntitlementView {
  trial_ends_at?: string | null;
}

/**
 * True iff the entitlement is a free/trial tier. Conservative & explicit: only
 * a NON-NULL `trial_ends_at` counts as trialing. Absent/null ⇒ treat as paid
 * (the gate already proved the user is `entitled`; a paid license simply omits
 * trial_ends_at).
 */
export function isTrialingEntitlement(entitlement: EveEntitlementView | null | undefined): boolean {
  const t = entitlement?.trial_ends_at;
  return typeof t === 'string' && t.trim().length > 0;
}

/** True iff BYOK (bring-your-own-key) must be greyed out for this entitlement. */
export function isByokDisabledForEntitlement(entitlement: EveEntitlementView | null | undefined): boolean {
  return isTrialingEntitlement(entitlement);
}

/**
 * Whether a given EVE tier is selectable for the entitlement. Standard is
 * always selectable; High/Max are paid-only and disabled while trialing.
 */
export function isEveTierSelectable(
  tier: Pick<EveInferenceTier, 'paidOnly'>,
  entitlement: EveEntitlementView | null | undefined
): boolean {
  if (!tier.paidOnly) return true;
  return !isTrialingEntitlement(entitlement);
}

/**
 * Build the full two-group picker model (STUFEN) for the current entitlement.
 * Local tiers are never gated; the PAID EVE levels (Max, Maximum) are greyed
 * (disabled, PAID_TIER_REQUIRED) while trialing. The FREE levels (Standard,
 * Hoch) always stay selectable. Paid levels carry their model label as the
 * sublabel plus a visible cost badge; the GATED Maximum level carries the
 * highest-cost badge so the ~5× rate is obvious. Free levels keep the
 * cloud/external sublabel.
 */
export function buildEvePickerGroups(entitlement: EveEntitlementView | null | undefined): EvePickerGroup[] {
  const trialing = isTrialingEntitlement(entitlement);

  const localGroup: EvePickerGroup = {
    kind: 'local',
    title: 'Privat (lokal)',
    items: EVE_LOCAL_PICKER_TIERS.map((tier) => ({
      value: localTierValue(tier.id),
      group: 'local',
      label: tier.label,
      sublabel: tier.modelLabel,
      disabled: false,
    })),
  };

  const eveGroup: EvePickerGroup = {
    kind: 'eve',
    // Honest cloud labeling: "(Cloud)" in the heading so EVE is never mistaken
    // for the private/local lane.
    title: EVE_INFERENCE_GROUP_TITLE,
    items: EVE_INFERENCE_TIERS.map((tier) => {
      const disabled = tier.paidOnly && trialing;
      const consumesCredits = tier.consumesCredits === true;
      const gated = tier.gated === true;
      // Paid levels surface their model label (DeepSeek V4 Pro / GLM 5.2);
      // free levels keep the cloud/external sublabel.
      const modelLabel = 'modelLabel' in tier ? (tier.modelLabel as string) : undefined;
      const costBadge = 'costBadge' in tier ? (tier.costBadge as string) : undefined;
      const sublabel = modelLabel ?? EVE_INFERENCE_TIER_SUBLABEL;
      return {
        value: eveTierValue(tier.id),
        group: 'eve' as const,
        label: tier.label,
        sublabel,
        disabled,
        ...(disabled ? { disabledReasonCode: 'PAID_TIER_REQUIRED' as const } : {}),
        consumesCredits,
        gated,
        ...(costBadge ? { costBadge } : {}),
      };
    }),
  };

  return [localGroup, eveGroup];
}

// ---------------------------------------------------------------------------
// EVE tier → synthetic provider for ClientFactory. The license wire string is
// the BEARER credential (OpenAI SDK sends `api_key` as `Authorization: Bearer`).
// ---------------------------------------------------------------------------

export function findEveInferenceTier(tierId: string): EveInferenceTier | undefined {
  return EVE_INFERENCE_TIERS.find((t) => t.id === tierId);
}

/**
 * Build the OpenAI-compatible request body for an EVE Inference call. The
 * function routes by `tier`; `messages`/`stream` are OpenAI-standard.
 *
 * `agent_id` is OPTIONAL and ADDITIVE: when the call is on behalf of a
 * delegated "Dein Team" role, the desktop passes that role's stable id so the
 * backend ledger `agent_id` column attributes the spend to the character.
 * When omitted the field is left off entirely (the backend defaults it to the
 * system `eve`), so an un-delegated call's body keeps its exact prior shape.
 */
export function buildEveInferenceRequestBody(args: {
  tier: EveInferenceWireTier;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  agent_id?: string;
}): {
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
  tier: EveInferenceWireTier;
  agent_id?: string;
} {
  const agentId = typeof args.agent_id === 'string' ? args.agent_id.trim() : '';
  return {
    messages: args.messages,
    stream: args.stream === true,
    tier: args.tier,
    ...(agentId.length > 0 ? { agent_id: agentId } : {}),
  };
}

export interface BuildEveInferenceProviderArgs {
  /** EVE tier id to route (e.g. 'eve-standard'). */
  tierId: EveInferenceTierId;
  /**
   * The stored CEVE license WIRE STRING (e.g. "CEVE.v2.<payload>.<sig>"). Used
   * verbatim as the bearer credential. NOT an OpenRouter/provider key.
   */
  licenseWire: string;
}

/**
 * Build a synthetic {@link TProviderWithModel} for an EVE Inference tier,
 * pointed at the Edge Function with the license wire string as the bearer
 * `api_key`. Hand the result to `ClientFactory.createRotatingClient` — that
 * preserves the existing OpenAIRotatingClient + egress-boundary enforcement
 * (ClientFactory sets `commandEveEgressPolicyAction: 'block'` when the Command
 * EVE shell is enabled). This keeps the egress boundary on this path.
 *
 * THROWS when the license wire string is empty — a missing bearer must be a
 * hard error, never a silent unauthenticated request.
 */
export function buildEveInferenceProvider(args: BuildEveInferenceProviderArgs): TProviderWithModel {
  const tier = findEveInferenceTier(args.tierId);
  if (!tier) {
    throw new Error(`buildEveInferenceProvider: unknown EVE tier "${args.tierId}"`);
  }
  const wire = typeof args.licenseWire === 'string' ? args.licenseWire.trim() : '';
  if (wire.length === 0) {
    throw new Error('buildEveInferenceProvider: missing CEVE license wire string for bearer credential');
  }

  return {
    id: `${EVE_INFERENCE_PROVIDER_ID_PREFIX}-${tier.id}`,
    // 'openai' ⇒ ClientFactory routes through OpenAIRotatingClient (the
    // OpenAI-compatible path with the egress boundary).
    platform: 'openai',
    name: `${EVE_INFERENCE_PROVIDER_NAME} ${tier.label}`,
    base_url: EVE_INFERENCE_FUNCTION_URL,
    // The OpenAI SDK uses api_key as the Authorization: Bearer token.
    api_key: wire,
    // The function routes by the body `tier`; send the tier as model for a
    // stable, self-describing request.
    use_model: tier.tier,
    capabilities: [{ type: 'text' }, { type: 'function_calling' }],
  };
}
