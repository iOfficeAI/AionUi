/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE — "Dein Team" curated A-roster (HONEST-A) unit tests.
 *
 * The roster is curated DATA only (no schema/assembler/marketplace). These
 * tests pin the data invariants the backend ledger + UI depend on, and the
 * three pure helpers:
 *
 *  (0) Roster shape: a small, opinionated, OUTCOME-named team with stable
 *      kebab agent_ids, the governance seats (CEO + Chief of Staff) and the
 *      growth/content/eval operators. Each role carries displayName, title,
 *      outcome, a known tier and at least one skill.
 *
 *  (1) agent_id discipline: ids are unique, kebab-case, never collide with the
 *      reserved system default `eve`, and are membership-checkable.
 *
 *  (2) resolveAttributionAgentId: a known roster id passes through verbatim
 *      (so spend is attributed to the character); an unknown/absent value
 *      falls back to the system default `eve`.
 *
 *  (3) eveTeamWorkerLabel: a known id renders "displayName · title"; the system
 *      default renders "EVE"; an unknown non-empty id renders verbatim; an
 *      empty/absent value renders "EVE".
 */

import { describe, expect, it } from 'vitest';

import {
  EVE_SYSTEM_AGENT_ID,
  EVE_TEAM_ROSTER,
  eveTeamWorkerLabel,
  findEveTeamRole,
  isEveTeamAgentId,
  resolveAttributionAgentId,
  type EveTeamRoleTier,
} from '@/common/config/eveTeamRoster';

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const KNOWN_TIERS: ReadonlySet<EveTeamRoleTier> = new Set(['standard', 'high', 'max', 'maximum']);

describe('eveTeamRoster — curated A-roster shape', () => {
  it('is a small, non-empty, opinionated team', () => {
    expect(EVE_TEAM_ROSTER.length).toBeGreaterThanOrEqual(6);
    // Honest-A: a curated team, not a sprawling marketplace.
    expect(EVE_TEAM_ROSTER.length).toBeLessThanOrEqual(12);
  });

  it('includes the governance seats CEO + Chief of Staff', () => {
    const ceo = findEveTeamRole('ceo');
    const cos = findEveTeamRole('chief-of-staff');
    expect(ceo?.kind).toBe('governance');
    expect(cos?.kind).toBe('governance');
  });

  it('includes the outcome-named growth/content operators', () => {
    for (const id of ['growth-lead', 'seo-lead', 'content-writer', 'reddit-lead', 'video-marketer']) {
      const role = findEveTeamRole(id);
      expect(role, `missing operator ${id}`).toBeDefined();
      expect(role?.kind).toBe('work');
    }
  });

  it('includes an eval/research support role', () => {
    expect(findEveTeamRole('eval-research')?.kind).toBe('work');
  });

  it('every role carries the full data shape', () => {
    for (const role of EVE_TEAM_ROSTER) {
      expect(role.agent_id, 'agent_id present').toBeTruthy();
      expect(role.displayName, `displayName for ${role.agent_id}`).toBeTruthy();
      expect(role.title, `title for ${role.agent_id}`).toBeTruthy();
      // Outcome must be a meaningful plain-language line, not a stub.
      expect(role.outcome.length, `outcome for ${role.agent_id}`).toBeGreaterThan(10);
      expect(KNOWN_TIERS.has(role.tier), `known tier for ${role.agent_id}`).toBe(true);
      expect(role.skills.length, `skills for ${role.agent_id}`).toBeGreaterThan(0);
      expect(role.kind === 'work' || role.kind === 'governance').toBe(true);
      // Every role declares a rhythm — it drives which control the UI shows.
      expect(role.rhythm === 'always-on' || role.rhythm === 'burst', `rhythm for ${role.agent_id}`).toBe(true);
    }
  });

  it('governance seats are always-on (leadership is never let go)', () => {
    for (const id of ['ceo', 'chief-of-staff']) {
      expect(findEveTeamRole(id)?.rhythm, `${id} rhythm`).toBe('always-on');
    }
  });

  it('includes the free local always-on floor worker (Hauspförtner / G0)', () => {
    const floor = findEveTeamRole('house-keeper');
    expect(floor, 'floor worker present').toBeDefined();
    expect(floor?.kind).toBe('work');
    expect(floor?.free).toBe(true);
    expect(floor?.rhythm).toBe('always-on');
    // It is the bundled local tier — the no-credits floor.
    expect(floor?.tier).toBe('standard');
  });

  it('exactly one role is the free always-on floor (the non-empty-floor anchor)', () => {
    const floors = EVE_TEAM_ROSTER.filter((r) => r.free === true && r.rhythm === 'always-on');
    expect(floors.length).toBe(1);
    expect(floors[0].agent_id).toBe('house-keeper');
  });
});

describe('eveTeamRoster — agent_id discipline', () => {
  it('agent_ids are unique kebab-case and never the reserved system default', () => {
    const seen = new Set<string>();
    for (const role of EVE_TEAM_ROSTER) {
      expect(KEBAB.test(role.agent_id), `kebab ${role.agent_id}`).toBe(true);
      expect(role.agent_id).not.toBe(EVE_SYSTEM_AGENT_ID);
      expect(seen.has(role.agent_id), `duplicate ${role.agent_id}`).toBe(false);
      seen.add(role.agent_id);
    }
  });

  it('isEveTeamAgentId membership: roster ids true, system default + unknown false', () => {
    expect(isEveTeamAgentId('growth-lead')).toBe(true);
    expect(isEveTeamAgentId(EVE_SYSTEM_AGENT_ID)).toBe(false);
    expect(isEveTeamAgentId('not-a-role')).toBe(false);
    expect(isEveTeamAgentId(undefined)).toBe(false);
    expect(isEveTeamAgentId(null)).toBe(false);
    expect(isEveTeamAgentId('')).toBe(false);
  });

  it('findEveTeamRole returns undefined for unknown/absent ids', () => {
    expect(findEveTeamRole('not-a-role')).toBeUndefined();
    expect(findEveTeamRole(undefined)).toBeUndefined();
    expect(findEveTeamRole(null)).toBeUndefined();
  });
});

describe('eveTeamRoster — resolveAttributionAgentId (ledger attribution)', () => {
  it('passes a known roster id through verbatim', () => {
    expect(resolveAttributionAgentId('seo-lead')).toBe('seo-lead');
    expect(resolveAttributionAgentId('eval-research')).toBe('eval-research');
  });

  it('falls back to the system default for unknown/absent/empty values', () => {
    expect(resolveAttributionAgentId('not-a-role')).toBe(EVE_SYSTEM_AGENT_ID);
    expect(resolveAttributionAgentId(undefined)).toBe(EVE_SYSTEM_AGENT_ID);
    expect(resolveAttributionAgentId(null)).toBe(EVE_SYSTEM_AGENT_ID);
    expect(resolveAttributionAgentId('')).toBe(EVE_SYSTEM_AGENT_ID);
    // The literal system default also resolves to itself (it is not a roster role).
    expect(resolveAttributionAgentId(EVE_SYSTEM_AGENT_ID)).toBe(EVE_SYSTEM_AGENT_ID);
  });
});

describe('eveTeamRoster — eveTeamWorkerLabel (Dein Team verteilt die Arbeit)', () => {
  it('renders "displayName · title" for a known role', () => {
    const role = findEveTeamRole('growth-lead');
    expect(eveTeamWorkerLabel('growth-lead')).toBe(`${role?.displayName} · ${role?.title}`);
  });

  it('renders "EVE" for the system default and for empty/absent input', () => {
    expect(eveTeamWorkerLabel(EVE_SYSTEM_AGENT_ID)).toBe('EVE');
    expect(eveTeamWorkerLabel('')).toBe('EVE');
    expect(eveTeamWorkerLabel(undefined)).toBe('EVE');
    expect(eveTeamWorkerLabel(null)).toBe('EVE');
  });

  it('renders an unknown non-empty id verbatim (never hides the activity)', () => {
    expect(eveTeamWorkerLabel('some-future-worker')).toBe('some-future-worker');
  });
});
