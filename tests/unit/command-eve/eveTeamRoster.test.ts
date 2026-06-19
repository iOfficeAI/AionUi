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
  addressesVideoMarketer,
  EVE_CANONICAL_GRADE_CLASS,
  EVE_GRADE_SALARY_EUR,
  EVE_SYSTEM_AGENT_ID,
  EVE_TEAM_ROSTER,
  eveTeamWorkerLabel,
  findEveTeamRole,
  isEveTeamAgentId,
  resolveAttributionAgentId,
  roleSalaryEur,
  VIDEO_MARKETER_AGENT_ID,
  type EveTeamRoleGrade,
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

describe('eveTeamRoster — addressesVideoMarketer (DUX-6 fail-safe signal)', () => {
  it('exposes the videomarketer agent id and it matches the roster role', () => {
    expect(VIDEO_MARKETER_AGENT_ID).toBe('video-marketer');
    expect(findEveTeamRole(VIDEO_MARKETER_AGENT_ID)).toBeDefined();
  });

  it('detects the videomarketer addressed by name/role (DE + EN, @ + spacing)', () => {
    expect(addressesVideoMarketer('@Videomarketer mach ein Reel')).toBe(true);
    expect(addressesVideoMarketer('Videomarketer, plane Shorts')).toBe(true);
    expect(addressesVideoMarketer('lass den video-marketer ran')).toBe(true);
    expect(addressesVideoMarketer('hand this to the Video Marketer')).toBe(true);
    expect(addressesVideoMarketer('starte das Video-Marketing')).toBe(true);
  });

  it('does NOT fire for an unrelated message or empty input', () => {
    expect(addressesVideoMarketer('schreib einen Blogpost')).toBe(false);
    expect(addressesVideoMarketer('')).toBe(false);
    expect(addressesVideoMarketer(null)).toBe(false);
    expect(addressesVideoMarketer(undefined)).toBe(false);
  });
});

describe('eveTeamRoster — ME-3 canonical grade bands (G0–G6 doc parity)', () => {
  // The SEVEN canonical Company.OS bands. Pinned here so the band LETTERS can
  // never silently re-collapse to the old six-band map (which folded Ops/Sales
  // into G1 and put video at G4 / coder at G5).
  const CANONICAL_SALARY: Record<EveTeamRoleGrade, number> = {
    G0: 0,
    G1: 25, // Content
    G2: 35, // Creative
    G3: 40, // Research
    G4: 25, // Ops/Sales (own band)
    G5: 60, // Videomarketer
    G6: 100, // Coder
  };

  it('exposes all seven bands G0–G6 with the canonical euro values', () => {
    expect(Object.keys(EVE_GRADE_SALARY_EUR).sort()).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
    for (const grade of Object.keys(CANONICAL_SALARY) as EveTeamRoleGrade[]) {
      expect(EVE_GRADE_SALARY_EUR[grade], `salary for ${grade}`).toBe(CANONICAL_SALARY[grade]);
    }
  });

  it('G4 is the Ops/Sales band at €25 — NOT folded into G1, NOT the €60 video band', () => {
    // The regression this test exists to catch: a future Ops/Sales worker must
    // project €25, never €60 (the old enum collapsed Ops/Sales into another band).
    expect(EVE_GRADE_SALARY_EUR.G4).toBe(25);
    expect(EVE_GRADE_SALARY_EUR.G4).not.toBe(60);
    expect(EVE_CANONICAL_GRADE_CLASS.G4).toBe('Ops/Sales');
  });

  it('video is G5=€60 and coder is G6=€100 (shifted up from the old G4/G5)', () => {
    expect(EVE_CANONICAL_GRADE_CLASS.G5).toBe('Videomarketer');
    expect(EVE_GRADE_SALARY_EUR.G5).toBe(60);
    expect(EVE_CANONICAL_GRADE_CLASS.G6).toBe('Coder');
    expect(EVE_GRADE_SALARY_EUR.G6).toBe(100);
  });

  it('the class map covers exactly the seven bands', () => {
    expect(Object.keys(EVE_CANONICAL_GRADE_CLASS).sort()).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
  });

  it('every roster role carries a known canonical grade and its euro value', () => {
    for (const role of EVE_TEAM_ROSTER) {
      expect(EVE_CANONICAL_GRADE_CLASS[role.grade], `class for ${role.agent_id}`).toBeTruthy();
      expect(roleSalaryEur(role)).toBe(EVE_GRADE_SALARY_EUR[role.grade]);
    }
  });

  it('the videomarketer role keeps €60 (now via G5) and growth/reddit project €25 (now via G4 Ops/Sales)', () => {
    expect(roleSalaryEur(findEveTeamRole('video-marketer')!)).toBe(60);
    expect(findEveTeamRole('video-marketer')!.grade).toBe('G5');
    // Growth + community are Ops/Sales (G4) — €25, NOT the €60 video band.
    expect(findEveTeamRole('growth-lead')!.grade).toBe('G4');
    expect(roleSalaryEur(findEveTeamRole('growth-lead')!)).toBe(25);
    expect(findEveTeamRole('reddit-lead')!.grade).toBe('G4');
    expect(roleSalaryEur(findEveTeamRole('reddit-lead')!)).toBe(25);
    // Content/SEO/writer stay G1 Content (€25); research stays G3 (€40).
    expect(findEveTeamRole('seo-lead')!.grade).toBe('G1');
    expect(findEveTeamRole('content-writer')!.grade).toBe('G1');
    expect(roleSalaryEur(findEveTeamRole('eval-research')!)).toBe(40);
  });
});
