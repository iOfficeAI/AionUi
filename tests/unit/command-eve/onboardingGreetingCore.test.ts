/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE guided onboarding (SLICE S2) — pure greeting-builder tests.
 *
 * The builder turns the S0 read-only status model into the one-time German
 * readiness greeting. These tests pin the load-bearing contract:
 *   - first_value_ready ⇒ "du bist startklar", no gaps.
 *   - !ready ⇒ ONLY genuine `blocked` items appear; `skipped`/`ok` are filtered.
 *   - cloud-ready user with an OPTIONAL blocked local lane is still ready.
 *   - links route registration/license/cloud → registration target, local →
 *     runtime; identity carries no link.
 *   - HONESTY: a name is only greeted when confirmed (verified, no pending
 *     confirmation); a guessed name is NOT asserted in the headline.
 */

import { describe, expect, it } from 'vitest';
import {
  buildOnboardingGreeting,
  COMMAND_EVE_ONBOARDING_GREETING_VERSION,
} from '@/common/config/onboardingGreetingCore';
import type {
  ICommandEveOnboardingItem,
  ICommandEveOnboardingStatusModel,
} from '@/common/adapter/ipcBridge';

function model(
  overrides: Partial<ICommandEveOnboardingStatusModel> = {}
): ICommandEveOnboardingStatusModel {
  return {
    schema_version: 'command-eve-onboarding-status/v0',
    generated_at: '2026-06-21T00:00:00.000Z',
    read_only: true,
    first_value_ready: false,
    entitlement_state: 'registered_unlicensed',
    cloud_bearer_available: false,
    identity: {
      needs_confirmation: true,
      confidence: 'placeholder',
      source: 'unverified',
    },
    items: [],
    warnings: [],
    ...overrides,
  };
}

function item(overrides: Partial<ICommandEveOnboardingItem> & Pick<ICommandEveOnboardingItem, 'id' | 'state'>): ICommandEveOnboardingItem {
  return {
    plain_meaning: 'x',
    remediation_kind: 'none',
    ...overrides,
  };
}

describe('buildOnboardingGreeting', () => {
  it('renders the startklar state with NO gaps when first_value_ready', () => {
    const greeting = buildOnboardingGreeting(
      model({
        first_value_ready: true,
        entitlement_state: 'entitled',
        cloud_bearer_available: true,
        items: [
          item({ id: 'cloud-lane', state: 'ok' }),
          item({ id: 'local-lane', state: 'skipped' }),
        ],
      })
    );
    expect(greeting.schema_version).toBe(COMMAND_EVE_ONBOARDING_GREETING_VERSION);
    expect(greeting.ready).toBe(true);
    expect(greeting.gaps).toHaveLength(0);
    expect(greeting.headline).toContain('startklar');
  });

  it('a cloud-ready user with a BLOCKED optional local lane is still startklar (local never blocks first value)', () => {
    const greeting = buildOnboardingGreeting(
      model({
        first_value_ready: true,
        entitlement_state: 'entitled',
        cloud_bearer_available: true,
        items: [
          item({ id: 'cloud-lane', state: 'ok' }),
          item({
            id: 'local-lane',
            state: 'blocked',
            reason_code: 'OLLAMA_MISSING',
            remediation_kind: 'external-link',
          }),
        ],
      })
    );
    // first_value_ready is the single truth — a blocked local lane does NOT
    // demote the greeting to a gap list.
    expect(greeting.ready).toBe(true);
    expect(greeting.gaps).toHaveLength(0);
  });

  it('lists ONLY blocked items as gaps; ok and skipped are filtered out', () => {
    const greeting = buildOnboardingGreeting(
      model({
        first_value_ready: false,
        entitlement_state: 'entitled',
        cloud_bearer_available: false,
        items: [
          item({ id: 'registration', state: 'ok' }),
          item({ id: 'license', state: 'ok' }),
          item({
            id: 'cloud-lane',
            state: 'blocked',
            plain_meaning: 'Cloud-Zugang fehlt.',
            reason_code: 'EVE_INFERENCE_NO_BEARER',
          }),
          item({ id: 'local-lane', state: 'skipped' }),
          item({ id: 'identity', state: 'skipped' }),
        ],
      })
    );
    expect(greeting.ready).toBe(false);
    expect(greeting.gaps.map((g) => g.id)).toEqual(['cloud-lane']);
    expect(greeting.gaps[0].text).toBe('Cloud-Zugang fehlt.');
    expect(greeting.gaps[0].reason_code).toBe('EVE_INFERENCE_NO_BEARER');
  });

  it('routes link targets: cloud-lane → registration target, local-lane → runtime, identity → none', () => {
    const greeting = buildOnboardingGreeting(
      model({
        first_value_ready: false,
        items: [
          item({ id: 'cloud-lane', state: 'blocked' }),
          item({ id: 'local-lane', state: 'blocked', reason_code: 'OLLAMA_MISSING' }),
          item({ id: 'identity', state: 'blocked', reason_code: 'IDENTITY_NEEDS_CONFIRMATION' }),
        ],
      })
    );
    const byId = Object.fromEntries(greeting.gaps.map((g) => [g.id, g]));
    expect(byId['cloud-lane'].link_target).toBe('registration');
    expect(byId['cloud-lane'].link_label).toBe('klick hier');
    expect(byId['local-lane'].link_target).toBe('runtime');
    expect(byId['identity'].link_target).toBe('none');
    expect(byId['identity'].link_label).toBeUndefined();
  });

  it('greets by name ONLY when the identity is confirmed (verified + no pending confirmation)', () => {
    const confirmed = buildOnboardingGreeting(
      model({
        first_value_ready: true,
        identity: {
          founder_name: 'Alois',
          needs_confirmation: false,
          confidence: 'verified',
          source: 'registration',
        },
      })
    );
    expect(confirmed.headline).toContain('Alois');
  });

  it('does NOT assert a guessed name in the headline (honesty)', () => {
    const guessed = buildOnboardingGreeting(
      model({
        first_value_ready: true,
        identity: {
          founder_name: 'Alois',
          needs_confirmation: true,
          confidence: 'needs_confirmation',
          source: 'macos_full_name',
        },
      })
    );
    expect(guessed.headline).not.toContain('Alois');
    expect(guessed.headline).toContain('startklar');
  });

  it('never invents a gap when items is empty', () => {
    const greeting = buildOnboardingGreeting(model({ first_value_ready: false, items: [] }));
    expect(greeting.ready).toBe(false);
    expect(greeting.gaps).toHaveLength(0);
  });
});
