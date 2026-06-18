/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE credits core (Lane 3) — the load-bearing UX decisions, all pure:
 *
 *   (1) credit-math DISPLAY: meter model (%, free vs paid), value-receipt €/hours.
 *   (2) the WALL: 402 parse/detect, transparent math, DEFAULT-PACK selection
 *       (100 → 250 → largest), margin-invariant guard.
 *   (3) IDLE-SUPPRESSION: the wall surfaces only when a job is in-flight.
 *   (4) SPEND-CAP validation/normalization.
 *   (+) Day-0 onboarding gate, pricing rows (hidden Solo on churn).
 *
 * No Electron/fs/network — exactly the pattern of eveInferenceCore.test.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  buildCreditMeterModel,
  buildPricingPlans,
  buildValueReceiptModel,
  buildWallModel,
  detectQuotaExhausted,
  DEFAULT_CREDIT_PACKS,
  isClientSeedSatisfied,
  isNearAllowanceWall,
  marginInvariantHolds,
  packEffectiveCostPerCredit,
  parseQuotaExhaustedBody,
  selectDefaultPackIndex,
  shouldForceDayZeroOnboarding,
  shouldSurfaceQuotaWall,
  SOLO_PLAN_EUR,
  STARTER_PLAN_EUR,
  validateSpendCapEur,
  type CreditPack,
  type CreditsStatus,
} from '@/common/config/creditsCore';

function status(overrides: Partial<CreditsStatus> = {}): CreditsStatus {
  return {
    tier: 'starter',
    included_allowance_credits_remaining: 30,
    purchased_credits_remaining: 0,
    spend_cap_eur_cents: 0,
    free_actions_used_this_period: 0,
    free_cap: 40,
    period_start: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// (1) credit-math display — meter model
// ---------------------------------------------------------------------------

describe('buildCreditMeterModel — allowance used fraction', () => {
  it('computes used fraction from grant minus remaining (Starter 60 grant)', () => {
    const m = buildCreditMeterModel(status({ tier: 'starter', included_allowance_credits_remaining: 30 }));
    // 60 grant, 30 left ⇒ 30 used ⇒ 0.5
    expect(m.allowanceUsedFraction).toBeCloseTo(0.5, 5);
    expect(m.isFree).toBe(false);
    expect(m.allowanceRemaining).toBe(30);
  });

  it('clamps used fraction to [0,1] when remaining exceeds the grant (top-up drift)', () => {
    const m = buildCreditMeterModel(status({ included_allowance_credits_remaining: 999 }));
    expect(m.allowanceUsedFraction).toBe(0);
  });

  it('never goes negative and clamps to 1 when fully drained', () => {
    const m = buildCreditMeterModel(status({ included_allowance_credits_remaining: 0 }));
    expect(m.allowanceUsedFraction).toBe(1);
  });

  it('free tier meters ACTIONS against the free cap, not credits', () => {
    const m = buildCreditMeterModel(status({ tier: 'free', free_actions_used_this_period: 34, free_cap: 40 }));
    expect(m.isFree).toBe(true);
    expect(m.allowanceUsedFraction).toBeCloseTo(34 / 40, 5);
  });

  it('totalRemaining sums allowance + purchased', () => {
    const m = buildCreditMeterModel(
      status({ included_allowance_credits_remaining: 10, purchased_credits_remaining: 25 })
    );
    expect(m.totalRemaining).toBe(35);
  });
});

describe('isNearAllowanceWall — the ~85% trigger', () => {
  it('is true at/over 85% used (paid)', () => {
    const m = buildCreditMeterModel(status({ included_allowance_credits_remaining: 9 })); // 51/60 used = 0.85
    expect(m.allowanceUsedFraction).toBeGreaterThanOrEqual(0.85);
    expect(isNearAllowanceWall(m)).toBe(true);
  });

  it('is false well under threshold', () => {
    const m = buildCreditMeterModel(status({ included_allowance_credits_remaining: 50 }));
    expect(isNearAllowanceWall(m)).toBe(false);
  });

  it('respects the free-tier action cap', () => {
    const near = buildCreditMeterModel(status({ tier: 'free', free_actions_used_this_period: 38, free_cap: 40 }));
    expect(isNearAllowanceWall(near)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (1) credit-math display — value receipt
// ---------------------------------------------------------------------------

describe('buildValueReceiptModel — €-value framing', () => {
  it('monetizes hours × rate and rounds € to the nearest 10', () => {
    const r = buildValueReceiptModel({ artifact: '32 ad variants', estimatedHours: 3.6, hourlyRateEur: 90 });
    expect(r.hours).toBe(4); // rounded
    expect(r.eurValue).toBe(360); // 4 * 90 = 360
    expect(r.headline).toContain('32 ad variants');
    expect(r.headline).toContain('~4h');
    expect(r.headline).toContain('~360€');
  });

  it('floors hours to a minimum of 1 so it never reads ~0h', () => {
    const r = buildValueReceiptModel({ artifact: 'a brief', estimatedHours: 0.2, hourlyRateEur: 100 });
    expect(r.hours).toBe(1);
    expect(r.eurValue).toBe(100);
  });

  it('falls back to a default rate when given a non-positive rate', () => {
    const r = buildValueReceiptModel({ artifact: 'x', estimatedHours: 2, hourlyRateEur: 0 });
    expect(r.eurValue).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// (2) the WALL — 402 parse/detect
// ---------------------------------------------------------------------------

describe('parseQuotaExhaustedBody', () => {
  it('parses a well-formed body', () => {
    const body = parseQuotaExhaustedBody({
      error: 'quota_exhausted',
      credits_needed: 12,
      packs: [{ eur: 100, credits: 100, bonus: 8 }],
    });
    expect(body).not.toBeNull();
    expect(body?.credits_needed).toBe(12);
    expect(body?.packs).toHaveLength(1);
  });

  it('rejects a non-quota body', () => {
    expect(parseQuotaExhaustedBody({ error: 'rate_limited' })).toBeNull();
    expect(parseQuotaExhaustedBody(null)).toBeNull();
    expect(parseQuotaExhaustedBody('nope')).toBeNull();
  });

  it('drops malformed packs but keeps valid ones', () => {
    const body = parseQuotaExhaustedBody({
      error: 'quota_exhausted',
      credits_needed: 5,
      packs: [{ eur: 50, credits: 50 }, { eur: 'x' }, null, { credits: 1 }],
    });
    expect(body?.packs).toHaveLength(1);
    expect(body?.packs[0]).toEqual({ eur: 50, credits: 50, bonus: 0 });
  });
});

describe('detectQuotaExhausted — from a thrown inference error', () => {
  it('recovers a preserved structured body on error.body', () => {
    const err = { status: 402, body: { error: 'quota_exhausted', credits_needed: 7, packs: [] } };
    const parsed = detectQuotaExhausted(err);
    expect(parsed?.credits_needed).toBe(7);
  });

  it('recovers a body embedded in the message string', () => {
    const err = new Error('402 quota_exhausted {"error":"quota_exhausted","credits_needed":9,"packs":[]}');
    const parsed = detectQuotaExhausted(err);
    expect(parsed?.credits_needed).toBe(9);
  });

  it('returns a minimal body for a 402 quota message without JSON', () => {
    const parsed = detectQuotaExhausted({ status: 402, message: 'quota_exhausted' });
    expect(parsed).not.toBeNull();
    expect(parsed?.credits_needed).toBe(0);
  });

  it('returns null for a non-quota error', () => {
    expect(detectQuotaExhausted(new Error('network down'))).toBeNull();
    expect(detectQuotaExhausted({ status: 500 })).toBeNull();
    expect(detectQuotaExhausted(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (2) the WALL — default-pack selection
// ---------------------------------------------------------------------------

describe('selectDefaultPackIndex — 100 → 250 → largest', () => {
  const packs: CreditPack[] = [
    { eur: 25, credits: 25, bonus: 0 },
    { eur: 50, credits: 50, bonus: 0 },
    { eur: 100, credits: 100, bonus: 8 },
    { eur: 250, credits: 250, bonus: 38 },
  ];

  it('defaults to the 100€ pack when present', () => {
    expect(selectDefaultPackIndex(packs)).toBe(2);
  });

  it('falls back to the 250€ pack when no 100€ pack', () => {
    const noHundred = packs.filter((p) => p.eur !== 100);
    const idx = selectDefaultPackIndex(noHundred);
    expect(noHundred[idx].eur).toBe(250);
  });

  it('falls back to the largest pack by total credits when neither 100 nor 250', () => {
    const small: CreditPack[] = [
      { eur: 25, credits: 25, bonus: 0 },
      { eur: 50, credits: 50, bonus: 0 },
    ];
    const idx = selectDefaultPackIndex(small);
    expect(small[idx].eur).toBe(50);
  });

  it('returns -1 for an empty pack list', () => {
    expect(selectDefaultPackIndex([])).toBe(-1);
  });

  it('skips a margin-negative pack when a raw cost is supplied', () => {
    // raw cost 0.9 €/credit; a 100-pack giving 200 credits = 0.5 €/credit is BELOW raw
    // (margin-negative) and must NOT be default-selected; the 250 pack at 0.87 holds.
    const risky: CreditPack[] = [
      { eur: 100, credits: 180, bonus: 20 }, // 0.5 €/credit — below raw 0.9 ⇒ ineligible
      { eur: 250, credits: 250, bonus: 38 }, // 0.868 €/credit — below 0.9 too here
      { eur: 50, credits: 50, bonus: 0 }, // 1.0 €/credit — ABOVE raw ⇒ the only eligible
    ];
    const idx = selectDefaultPackIndex(risky, 0.9);
    expect(risky[idx].eur).toBe(50);
  });
});

describe('buildWallModel — transparent credit math', () => {
  it('computes "M more jobs like this" per pack from credits_needed', () => {
    const wall = buildWallModel({
      error: 'quota_exhausted',
      credits_needed: 8,
      packs: [
        { eur: 100, credits: 100, bonus: 8 }, // 108 / 8 = 13 jobs
        { eur: 250, credits: 250, bonus: 38 }, // 288 / 8 = 36 jobs
      ],
    });
    expect(wall.creditsNeeded).toBe(8);
    const hundred = wall.packs.find((p) => p.eur === 100)!;
    expect(hundred.jobsLikeThis).toBe(13);
    expect(hundred.isDefaultSelected).toBe(true); // 100-pack is default
    const twoFifty = wall.packs.find((p) => p.eur === 250)!;
    expect(twoFifty.jobsLikeThis).toBe(36);
    expect(twoFifty.isDefaultSelected).toBe(false);
  });

  it('falls back to the default catalog when the 402 body carries no packs', () => {
    const wall = buildWallModel({ error: 'quota_exhausted', credits_needed: 5, packs: [] });
    expect(wall.packs).toHaveLength(DEFAULT_CREDIT_PACKS.length);
    expect(wall.packs.some((p) => p.isDefaultSelected)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (2) margin invariant
// ---------------------------------------------------------------------------

describe('marginInvariant — effective €/credit must exceed raw cost', () => {
  it('packEffectiveCostPerCredit divides price by total (base + bonus) credits', () => {
    expect(packEffectiveCostPerCredit({ eur: 100, credits: 100, bonus: 8 })).toBeCloseTo(100 / 108, 5);
  });

  it('holds when effective price is above raw cost', () => {
    expect(marginInvariantHolds({ eur: 100, credits: 100, bonus: 8 }, 0.5)).toBe(true);
  });

  it('fails when bonus pushes effective price below raw cost', () => {
    expect(marginInvariantHolds({ eur: 100, credits: 100, bonus: 200 }, 0.5)).toBe(false);
  });

  it('the default catalog holds at a 1-credit ≈ ~0.71€-at-cost calibration (+40% markup)', () => {
    // +40% markup ⇒ list price ≈ raw / (1/1.4) ⇒ a raw of (1/1.4)=0.714 is the
    // break-even at the no-bonus packs; bonus packs must still clear it.
    const raw = 1 / 1.4;
    for (const pack of DEFAULT_CREDIT_PACKS) {
      expect(marginInvariantHolds(pack, raw)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// (3) idle-suppression
// ---------------------------------------------------------------------------

describe('shouldSurfaceQuotaWall — idle suppression', () => {
  it('surfaces only when a job is in-flight AND there is a quota signal', () => {
    expect(shouldSurfaceQuotaWall({ jobInFlight: true, hasQuotaSignal: true })).toBe(true);
  });

  it('suppresses when idle (no in-flight job) even with a quota signal', () => {
    expect(shouldSurfaceQuotaWall({ jobInFlight: false, hasQuotaSignal: true })).toBe(false);
  });

  it('suppresses when there is no quota signal', () => {
    expect(shouldSurfaceQuotaWall({ jobInFlight: true, hasQuotaSignal: false })).toBe(false);
    expect(shouldSurfaceQuotaWall({ jobInFlight: false, hasQuotaSignal: false })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (4) spend-cap validation
// ---------------------------------------------------------------------------

describe('validateSpendCapEur', () => {
  it('treats 0 / null / undefined as uncapped', () => {
    expect(validateSpendCapEur(0)).toEqual({ ok: true, eurCents: 0 });
    expect(validateSpendCapEur(null)).toEqual({ ok: true, eurCents: 0 });
    expect(validateSpendCapEur(undefined)).toEqual({ ok: true, eurCents: 0 });
  });

  it('normalizes euros to integer cents', () => {
    expect(validateSpendCapEur(250)).toEqual({ ok: true, eurCents: 25000 });
    expect(validateSpendCapEur(49.99)).toEqual({ ok: true, eurCents: 4999 });
  });

  it('rejects negatives', () => {
    const r = validateSpendCapEur(-5);
    expect(r.ok).toBe(false);
    expect(r.reasonCode).toBe('NEGATIVE');
  });

  it('rejects absurdly large caps', () => {
    const r = validateSpendCapEur(2_000_000);
    expect(r.ok).toBe(false);
    expect(r.reasonCode).toBe('ABOVE_MAX');
  });

  it('rejects NaN', () => {
    const r = validateSpendCapEur(Number.NaN);
    expect(r.ok).toBe(false);
    expect(r.reasonCode).toBe('NOT_INTEGER');
  });
});

// ---------------------------------------------------------------------------
// (+) Day-0 onboarding gate
// ---------------------------------------------------------------------------

describe('Day-0 onboarding gate', () => {
  it('a whitespace-only seed does not satisfy the requirement', () => {
    expect(isClientSeedSatisfied({ kind: 'paste_brief', value: '   ' })).toBe(false);
    expect(isClientSeedSatisfied({ kind: 'paste_brief', value: 'real brief' })).toBe(true);
    expect(isClientSeedSatisfied(null)).toBe(false);
  });

  it('forces onboarding only when not already seeded and no real seed yet', () => {
    expect(shouldForceDayZeroOnboarding({ alreadySeeded: false, seed: null })).toBe(true);
    expect(shouldForceDayZeroOnboarding({ alreadySeeded: true, seed: null })).toBe(false);
    expect(
      shouldForceDayZeroOnboarding({ alreadySeeded: false, seed: { kind: 'paste_brief', value: 'brief' } })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (+) pricing rows — hidden Solo on churn
// ---------------------------------------------------------------------------

describe('buildPricingPlans — Solo is hidden unless a churn signal', () => {
  it('shows only Starter by default', () => {
    const plans = buildPricingPlans({ churnSignal: false });
    expect(plans).toHaveLength(1);
    expect(plans[0]).toEqual({ id: 'starter', priceEur: STARTER_PLAN_EUR, hidden: false });
  });

  it('surfaces the hidden Solo plan when a churn signal is present', () => {
    const plans = buildPricingPlans({ churnSignal: true });
    expect(plans).toHaveLength(2);
    expect(plans.find((p) => p.id === 'solo')).toEqual({ id: 'solo', priceEur: SOLO_PLAN_EUR, hidden: false });
  });
});
