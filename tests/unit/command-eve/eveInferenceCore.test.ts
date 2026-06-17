/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EVE Inference picker core — the two required behaviors:
 *
 *  (1) Free-tier greying: when the entitlement is trialing (CEVE.v2
 *      trial_ends_at present), EVE High + EVE Max are disabled (greyed) with a
 *      PAID_TIER_REQUIRED hint, and BYOK is disabled; EVE Standard + both local
 *      tiers stay selectable. A paid entitlement (trial_ends_at null/absent)
 *      leaves everything selectable.
 *
 *  (2) EVE Standard routing: buildEveInferenceProvider targets the
 *      eve-inference Edge Function URL with the CEVE license WIRE STRING as the
 *      bearer api_key (NOT an OpenRouter key), via the OpenAI-compatible
 *      platform so ClientFactory keeps the egress boundary.
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

describe('eveInferenceCore — free-tier greying (requirement 1)', () => {
  it('renders EXACTLY two groups and nothing else', () => {
    const groups = buildEvePickerGroups(TRIAL);
    expect(groups.map((g) => g.kind)).toEqual(['local', 'eve']);
    // Local: Standard + High only (no 31B pro tier). EVE: Standard/High/Max.
    expect(groups[0].items.map((i) => i.label)).toEqual(['Standard', 'High']);
    expect(groups[1].items.map((i) => i.label)).toEqual(['Standard', 'High', 'Max']);
  });

  it('greys EVE High + EVE Max (PAID_TIER_REQUIRED) while trialing; Standard + locals selectable', () => {
    const items = flat(buildEvePickerGroups(TRIAL));

    // EVE High + Max disabled with the paid hint.
    const eveHigh = byLabel(items, 'eve', 'High')!;
    const eveMax = byLabel(items, 'eve', 'Max')!;
    expect(eveHigh.disabled).toBe(true);
    expect(eveHigh.disabledReasonCode).toBe('PAID_TIER_REQUIRED');
    expect(eveMax.disabled).toBe(true);
    expect(eveMax.disabledReasonCode).toBe('PAID_TIER_REQUIRED');

    // EVE Standard selectable.
    expect(byLabel(items, 'eve', 'Standard')!.disabled).toBe(false);

    // Both local tiers selectable.
    expect(byLabel(items, 'local', 'Standard')!.disabled).toBe(false);
    expect(byLabel(items, 'local', 'High')!.disabled).toBe(false);

    // Local tiers carry their bundled model labels as sublabels.
    expect(byLabel(items, 'local', 'Standard')!.sublabel).toBe('Gemma 4 E4B');
    expect(byLabel(items, 'local', 'High')!.sublabel).toBe('Gemma 4 12B');
  });

  it('leaves ALL EVE tiers selectable when paid (trial_ends_at null/absent)', () => {
    for (const ent of [PAID_NULL, PAID_ABSENT]) {
      const items = flat(buildEvePickerGroups(ent));
      expect(byLabel(items, 'eve', 'High')!.disabled).toBe(false);
      expect(byLabel(items, 'eve', 'Max')!.disabled).toBe(false);
      expect(byLabel(items, 'eve', 'Standard')!.disabled).toBe(false);
    }
  });

  it('isEveTierSelectable gates paid-only tiers on trial, never Standard', () => {
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

  it('maps High/Max tiers to their wire tier strings', () => {
    expect(buildEveInferenceProvider({ tierId: 'eve-high', licenseWire: FAKE_WIRE }).use_model).toBe('high');
    expect(buildEveInferenceProvider({ tierId: 'eve-max', licenseWire: FAKE_WIRE }).use_model).toBe('max');
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
