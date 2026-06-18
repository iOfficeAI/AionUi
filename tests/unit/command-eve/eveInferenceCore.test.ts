/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EVE Inference picker core — the STUFEN (level) model + the two required
 * behaviors:
 *
 *  (0) STUFEN shape: EVE exposes FOUR levels — Standard, Hoch (both FREE,
 *      Standard default), Max (DeepSeek V4 Pro, paid, consumes credits) and
 *      Maximum / "härteste Aufgabe" (GLM 5.2, paid + GATED, highest cost). The
 *      paid levels carry a model sublabel + a visible cost badge; Maximum is
 *      flagged `gated` with the highest-cost badge so the ~5× rate is obvious.
 *
 *  (1) Free-tier greying: when the entitlement is trialing (CEVE.v2
 *      trial_ends_at present), EVE Max + EVE Maximum are disabled (greyed) with
 *      a PAID_TIER_REQUIRED hint, and BYOK is disabled; EVE Standard + EVE Hoch
 *      + both local tiers stay selectable. A paid entitlement (trial_ends_at
 *      null/absent) leaves everything selectable.
 *
 *  (2) EVE routing: buildEveInferenceProvider targets the eve-inference Edge
 *      Function URL with the CEVE license WIRE STRING as the bearer api_key
 *      (NOT an OpenRouter key), via the OpenAI-compatible platform so
 *      ClientFactory keeps the egress boundary. The wire value sent is the
 *      level/legacy-tier string the backend registry understands.
 *
 * All tokens here are SYNTHETIC — never a real license.
 */

import { describe, expect, it } from 'vitest';

import {
  buildEveInferenceProvider,
  buildEvePickerGroups,
  buildEveInferenceRequestBody,
  EVE_DEFAULT_INFERENCE_SELECTION,
  EVE_INFERENCE_FUNCTION_URL,
  EVE_INFERENCE_DEFAULT_TIER_ID,
  EVE_INFERENCE_GROUP_TITLE,
  EVE_INFERENCE_TIER_SUBLABEL,
  EVE_INFERENCE_TIERS,
  eveTierValue,
  isByokDisabledForEntitlement,
  isEveInferenceSelection,
  isEveTierSelectable,
  isTrialingEntitlement,
  localTierValue,
  parseEveTierIdFromSelection,
  resolveCommandEveWarmupLane,
  resolveEffectiveInferenceSelection,
  type EvePickerItem,
} from '@/common/config/eveInferenceCore';

/** Synthetic CEVE wire string — NOT a real license. */
const FAKE_WIRE = 'CEVE.v2.FAKE-payload-TESTONLY.FAKE-sig-TESTONLY';

const TRIAL = { trial_ends_at: '2026-07-01T00:00:00.000Z' };
const PAID_NULL = { trial_ends_at: null };
const PAID_ABSENT = {};

function flat(groups: ReturnType<typeof buildEvePickerGroups>): EvePickerItem[] {
  return groups.flatMap((g) => g.items);
}
function byLabel(items: EvePickerItem[], group: 'local' | 'eve', label: string): EvePickerItem | undefined {
  return items.find((i) => i.group === group && i.label === label);
}

describe('eveInferenceCore — trial detection', () => {
  it('treats a non-null trial_ends_at as trialing', () => {
    expect(isTrialingEntitlement(TRIAL)).toBe(true);
  });

  it('treats null/absent/unknown trial_ends_at as NOT trialing (paid)', () => {
    expect(isTrialingEntitlement(PAID_NULL)).toBe(false);
    expect(isTrialingEntitlement(PAID_ABSENT)).toBe(false);
    expect(isTrialingEntitlement(null)).toBe(false);
    expect(isTrialingEntitlement(undefined)).toBe(false);
  });
});

describe('eveInferenceCore — STUFEN shape (requirement 0)', () => {
  it('exposes EXACTLY the four EVE levels in order: Standard, Hoch, Max, Maximum', () => {
    const groups = buildEvePickerGroups(PAID_NULL);
    const eve = groups.find((g) => g.kind === 'eve')!;
    expect(eve.items.map((i) => i.label)).toEqual(['Standard', 'Hoch', 'Max', 'Maximum']);
  });

  it('Standard + Hoch are FREE (not paid-only); Standard is the default', () => {
    const standard = EVE_INFERENCE_TIERS.find((t) => t.id === 'eve-standard')!;
    const hoch = EVE_INFERENCE_TIERS.find((t) => t.id === 'eve-high')!;
    expect(standard.paidOnly).toBe(false);
    expect(hoch.paidOnly).toBe(false);
    expect(hoch.label).toBe('Hoch');
    expect(EVE_INFERENCE_DEFAULT_TIER_ID).toBe('eve-standard');
  });

  it('Max is paid + consumes credits (DeepSeek V4 Pro) and shows a credit badge, NOT gated', () => {
    const items = flat(buildEvePickerGroups(PAID_NULL));
    const max = byLabel(items, 'eve', 'Max')!;
    expect(max.consumesCredits).toBe(true);
    expect(max.gated).toBe(false);
    expect(max.sublabel).toBe('DeepSeek V4 Pro');
    expect(max.costBadge).toBe('verbraucht Credits');
  });

  it('Maximum is paid + GATED (GLM 5.2) and carries the highest-cost (~5×) badge', () => {
    const items = flat(buildEvePickerGroups(PAID_NULL));
    const maximum = byLabel(items, 'eve', 'Maximum')!;
    expect(maximum.consumesCredits).toBe(true);
    expect(maximum.gated).toBe(true);
    expect(maximum.sublabel).toBe('GLM 5.2');
    // The badge makes the ~5× rate unmistakable.
    expect(maximum.costBadge).toBe('~5× Kosten');
    expect(maximum.costBadge).toMatch(/5/);
  });

  it('the two FREE levels carry NO cost badge (free = no credit surprise)', () => {
    const items = flat(buildEvePickerGroups(PAID_NULL));
    expect(byLabel(items, 'eve', 'Standard')!.costBadge).toBeUndefined();
    expect(byLabel(items, 'eve', 'Hoch')!.costBadge).toBeUndefined();
    expect(byLabel(items, 'eve', 'Standard')!.consumesCredits).toBe(false);
    expect(byLabel(items, 'eve', 'Hoch')!.consumesCredits).toBe(false);
  });
});

describe('eveInferenceCore — free-tier greying (requirement 1)', () => {
  it('renders EXACTLY two groups and nothing else', () => {
    const groups = buildEvePickerGroups(TRIAL);
    expect(groups.map((g) => g.kind)).toEqual(['local', 'eve']);
    // Local: Standard + Hoch only (no 31B pro tier). EVE: the four STUFEN.
    expect(groups[0].items.map((i) => i.label)).toEqual(['Standard', 'Hoch']);
    expect(groups[1].items.map((i) => i.label)).toEqual(['Standard', 'Hoch', 'Max', 'Maximum']);
  });

  it('greys EVE Max + EVE Maximum (PAID_TIER_REQUIRED) while trialing; Standard + Hoch + locals selectable', () => {
    const items = flat(buildEvePickerGroups(TRIAL));

    // EVE Max + Maximum disabled with the paid hint.
    const eveMax = byLabel(items, 'eve', 'Max')!;
    const eveMaximum = byLabel(items, 'eve', 'Maximum')!;
    expect(eveMax.disabled).toBe(true);
    expect(eveMax.disabledReasonCode).toBe('PAID_TIER_REQUIRED');
    expect(eveMaximum.disabled).toBe(true);
    expect(eveMaximum.disabledReasonCode).toBe('PAID_TIER_REQUIRED');

    // The cost badge is shown EVEN while greyed, so the user knows what it costs
    // before deciding to upgrade.
    expect(eveMax.costBadge).toBe('verbraucht Credits');
    expect(eveMaximum.costBadge).toBe('~5× Kosten');

    // EVE Standard + Hoch (the FREE levels) selectable on a trial.
    expect(byLabel(items, 'eve', 'Standard')!.disabled).toBe(false);
    expect(byLabel(items, 'eve', 'Hoch')!.disabled).toBe(false);

    // Both local tiers selectable.
    expect(byLabel(items, 'local', 'Standard')!.disabled).toBe(false);
    expect(byLabel(items, 'local', 'Hoch')!.disabled).toBe(false);

    // Local tiers carry their bundled model labels as sublabels.
    expect(byLabel(items, 'local', 'Standard')!.sublabel).toBe('Gemma 4 E4B');
    expect(byLabel(items, 'local', 'Hoch')!.sublabel).toBe('Gemma 4 12B');
  });

  it('leaves ALL EVE levels selectable when paid (trial_ends_at null/absent)', () => {
    for (const ent of [PAID_NULL, PAID_ABSENT]) {
      const items = flat(buildEvePickerGroups(ent));
      expect(byLabel(items, 'eve', 'Standard')!.disabled).toBe(false);
      expect(byLabel(items, 'eve', 'Hoch')!.disabled).toBe(false);
      expect(byLabel(items, 'eve', 'Max')!.disabled).toBe(false);
      expect(byLabel(items, 'eve', 'Maximum')!.disabled).toBe(false);
    }
  });

  it('isEveTierSelectable gates paid-only levels on trial, never the free ones', () => {
    expect(isEveTierSelectable({ paidOnly: false }, TRIAL)).toBe(true);
    expect(isEveTierSelectable({ paidOnly: true }, TRIAL)).toBe(false);
    expect(isEveTierSelectable({ paidOnly: true }, PAID_NULL)).toBe(true);
  });

  it('disables BYOK while trialing, enables it when paid', () => {
    expect(isByokDisabledForEntitlement(TRIAL)).toBe(true);
    expect(isByokDisabledForEntitlement(PAID_NULL)).toBe(false);
    expect(isByokDisabledForEntitlement(PAID_ABSENT)).toBe(false);
    expect(isByokDisabledForEntitlement(null)).toBe(false);
  });
});

describe('eveInferenceCore — honest CLOUD labeling (audit #1)', () => {
  it('the EVE group heading carries an explicit "(Cloud)" marker', () => {
    const groups = buildEvePickerGroups(TRIAL);
    const eveGroup = groups.find((g) => g.kind === 'eve')!;
    expect(eveGroup.title).toBe(EVE_INFERENCE_GROUP_TITLE);
    expect(eveGroup.title).toContain('(Cloud)');
    // The local group stays the private/local one (no Cloud marker).
    expect(groups.find((g) => g.kind === 'local')!.title).not.toContain('Cloud');
  });

  it('the FREE EVE levels carry the external/OpenRouter sublabel; paid levels show their model', () => {
    const items = flat(buildEvePickerGroups(TRIAL));
    // Free levels keep the cloud/external sublabel.
    for (const label of ['Standard', 'Hoch']) {
      expect(byLabel(items, 'eve', label)!.sublabel).toBe(EVE_INFERENCE_TIER_SUBLABEL);
    }
    // Paid levels surface the concrete model as the sublabel (still a level in
    // the primary label, model only in the secondary descriptor).
    expect(byLabel(items, 'eve', 'Max')!.sublabel).toBe('DeepSeek V4 Pro');
    expect(byLabel(items, 'eve', 'Maximum')!.sublabel).toBe('GLM 5.2');
    // Sanity: the free sublabel makes the external/cloud nature explicit.
    expect(EVE_INFERENCE_TIER_SUBLABEL).toMatch(/OpenRouter/);
  });

  it('a user cannot mistake EVE Standard for private/local: heading + row both say cloud/external', () => {
    const groups = buildEvePickerGroups(TRIAL);
    const eveGroup = groups.find((g) => g.kind === 'eve')!;
    const eveStandard = eveGroup.items.find((i) => i.label === 'Standard')!;
    // Heading carries (Cloud); the Standard row carries the OpenRouter sublabel.
    expect(eveGroup.title.toLowerCase()).toContain('cloud');
    expect(eveStandard.sublabel!.toLowerCase()).toContain('openrouter');
  });
});

describe('eveInferenceCore — EVE Standard routing (requirement 2)', () => {
  it('targets the eve-inference Edge Function URL with the license wire as bearer', () => {
    const provider = buildEveInferenceProvider({ tierId: 'eve-standard', licenseWire: FAKE_WIRE });
    // Routes through the OpenAI-compatible client path (ClientFactory egress).
    expect(provider.platform).toBe('openai');
    expect(provider.base_url).toBe(EVE_INFERENCE_FUNCTION_URL);
    expect(provider.base_url).toBe('https://unvbeothoimlzlolxucl.supabase.co/functions/v1/eve-inference');
    // The license wire IS the bearer (OpenAI SDK sends api_key as Bearer).
    expect(provider.api_key).toBe(FAKE_WIRE);
    // Standard tier maps to the 'standard' wire tier (sent as the model).
    expect(provider.use_model).toBe('standard');
  });

  it('maps every level to the wire string the backend registry understands', () => {
    // Hoch sends the legacy-compatible `high` alias (the backend tier→level
    // bridge maps it to the `hoch` level); Max/Maximum send their level names.
    expect(buildEveInferenceProvider({ tierId: 'eve-high', licenseWire: FAKE_WIRE }).use_model).toBe('high');
    expect(buildEveInferenceProvider({ tierId: 'eve-max', licenseWire: FAKE_WIRE }).use_model).toBe('max');
    expect(buildEveInferenceProvider({ tierId: 'eve-maximum', licenseWire: FAKE_WIRE }).use_model).toBe('maximum');
  });

  it('the wire values are exactly the registry-accepted set (no raw model id ever sent)', () => {
    const wires = EVE_INFERENCE_TIERS.map((t) => t.tier);
    expect(wires).toEqual(['standard', 'high', 'max', 'maximum']);
    // The desktop never sends "DeepSeek V4 Pro" / "GLM 5.2" on the wire — only
    // the level; the backend resolves the model.
    for (const w of wires) {
      expect(w).not.toMatch(/DeepSeek|GLM/i);
    }
  });

  it('THROWS (fail-loud) when the license wire is empty — never an empty bearer', () => {
    expect(() => buildEveInferenceProvider({ tierId: 'eve-standard', licenseWire: '' })).toThrow();
    expect(() => buildEveInferenceProvider({ tierId: 'eve-standard', licenseWire: '   ' })).toThrow();
  });

  it('THROWS on an unknown tier id', () => {
    // @ts-expect-error — exercising the runtime guard with a bad tier id.
    expect(() => buildEveInferenceProvider({ tierId: 'eve-bogus', licenseWire: FAKE_WIRE })).toThrow();
  });

  it('builds an OpenAI-compatible body { messages, stream, tier }', () => {
    const body = buildEveInferenceRequestBody({
      tier: 'standard',
      messages: [{ role: 'user', content: 'hallo' }],
      stream: true,
    });
    expect(body).toEqual({
      messages: [{ role: 'user', content: 'hallo' }],
      stream: true,
      tier: 'standard',
    });
  });
});

describe('eveInferenceCore — selection parsing', () => {
  it('round-trips an EVE selection value', () => {
    const value = eveTierValue('eve-standard');
    expect(isEveInferenceSelection(value)).toBe(true);
    expect(parseEveTierIdFromSelection(value)).toBe('eve-standard');
  });

  it('does not treat a local selection as an EVE selection', () => {
    expect(isEveInferenceSelection('command-eve-local:local-standard')).toBe(false);
    expect(parseEveTierIdFromSelection('command-eve-local:local-standard')).toBeUndefined();
  });

  it('default EVE tier is Standard', () => {
    expect(EVE_INFERENCE_DEFAULT_TIER_ID).toBe('eve-standard');
  });
});

describe('eveInferenceCore — default-flip to EVE Standard (cloud)', () => {
  it('the default selection is EVE Standard, not a local tier', () => {
    expect(EVE_DEFAULT_INFERENCE_SELECTION).toBe(eveTierValue('eve-standard'));
    expect(isEveInferenceSelection(EVE_DEFAULT_INFERENCE_SELECTION)).toBe(true);
  });

  it('an absent/empty persisted selection resolves to EVE Standard', () => {
    expect(resolveEffectiveInferenceSelection(undefined)).toBe(EVE_DEFAULT_INFERENCE_SELECTION);
    expect(resolveEffectiveInferenceSelection(null)).toBe(EVE_DEFAULT_INFERENCE_SELECTION);
    expect(resolveEffectiveInferenceSelection('')).toBe(EVE_DEFAULT_INFERENCE_SELECTION);
    expect(resolveEffectiveInferenceSelection('   ')).toBe(EVE_DEFAULT_INFERENCE_SELECTION);
    // The default must route to the cloud lane.
    expect(isEveInferenceSelection(resolveEffectiveInferenceSelection(undefined))).toBe(true);
  });

  it('a present selection is returned verbatim (local stays opt-in, not overridden)', () => {
    const local = localTierValue('local-high');
    expect(resolveEffectiveInferenceSelection(local)).toBe(local);
    expect(isEveInferenceSelection(resolveEffectiveInferenceSelection(local))).toBe(false);
    const eveHigh = eveTierValue('eve-high');
    expect(resolveEffectiveInferenceSelection(eveHigh)).toBe(eveHigh);
  });
});

describe('eveInferenceCore — startup warm-up lane selection', () => {
  it('warms the EVE cloud lane (with wire tier) for an EVE selection', () => {
    expect(resolveCommandEveWarmupLane(eveTierValue('eve-standard'))).toEqual({ lane: 'eve', tier: 'standard' });
    expect(resolveCommandEveWarmupLane(eveTierValue('eve-high'))).toEqual({ lane: 'eve', tier: 'high' });
  });

  it('warms the EVE cloud lane for the DEFAULT (absent/empty) selection — never the inactive local model', () => {
    // The default flipped to EVE Standard, so a fresh user warms the cloud lane.
    expect(resolveCommandEveWarmupLane(undefined)).toEqual({ lane: 'eve', tier: 'standard' });
    expect(resolveCommandEveWarmupLane(null)).toEqual({ lane: 'eve', tier: 'standard' });
    expect(resolveCommandEveWarmupLane('')).toEqual({ lane: 'eve', tier: 'standard' });
    expect(resolveCommandEveWarmupLane('   ')).toEqual({ lane: 'eve', tier: 'standard' });
  });

  it('warms the LOCAL lane only for an explicit local selection', () => {
    expect(resolveCommandEveWarmupLane(localTierValue('local-high'))).toEqual({ lane: 'local' });
    expect(resolveCommandEveWarmupLane(localTierValue('local-standard'))).toEqual({ lane: 'local' });
  });
});
