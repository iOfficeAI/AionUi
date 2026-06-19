/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE — PRE-VISIBLE projected-budget core (P0 #1) unit tests, all pure:
 *
 *  (0) GRADE → salary mapping is the seven canonical bands (G0=0 … G6=100)
 *      and every roster role carries a known grade.
 *  (1) projectMonthlySpend: sums ONLY active workers' grade salaries; the free
 *      local floor + the €0 governance seats never inflate the figure; fits-hull
 *      + remaining/overage are derived correctly.
 *  (2) projectAfterAction: the would-be projection if an action were applied
 *      (activating adds, deactivating subtracts) without mutating the input.
 *  (3) evaluateBudgetGate (cap-and-ask): warns BEFORE the spend crosses the base
 *      hull on an activating PAID hire; never gates deactivations or the free
 *      floor; allowed iff it still fits.
 *
 * No Electron/fs/network — same pattern as creditsCore.test.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  EVE_GRADE_SALARY_EUR,
  EVE_TEAM_ROSTER,
  findEveTeamRole,
  roleSalaryEur,
  type EveTeamRole,
} from '@/common/config/eveTeamRoster';
import {
  BASE_HULL_EUR,
  evaluateBudgetGate,
  projectAfterAction,
  projectMonthlySpend,
} from '@/common/config/eveTeamBudgetCore';
import type { EveTeamWorkerStatusMap } from '@/common/config/eveTeamControlsCore';

// ---------------------------------------------------------------------------
// (0) grade → salary table (Founder-locked §7)
// ---------------------------------------------------------------------------

describe('grade salary table — seven canonical G0–G6 bands', () => {
  it('maps each grade to the exact expected EUR/mo', () => {
    expect(EVE_GRADE_SALARY_EUR.G0).toBe(0);
    expect(EVE_GRADE_SALARY_EUR.G1).toBe(25); // Content
    expect(EVE_GRADE_SALARY_EUR.G2).toBe(35); // Creative
    expect(EVE_GRADE_SALARY_EUR.G3).toBe(40); // Research
    expect(EVE_GRADE_SALARY_EUR.G4).toBe(25); // Ops/Sales (own band — NOT €60)
    expect(EVE_GRADE_SALARY_EUR.G5).toBe(60); // Videomarketer
    expect(EVE_GRADE_SALARY_EUR.G6).toBe(100); // Coder
  });

  it('every roster role carries a known grade and resolves to a salary', () => {
    for (const role of EVE_TEAM_ROSTER) {
      expect(role.grade, `grade for ${role.agent_id}`).toBeTruthy();
      expect(EVE_GRADE_SALARY_EUR[role.grade], `salary for ${role.agent_id}`).toBeTypeOf('number');
      expect(roleSalaryEur(role)).toBe(EVE_GRADE_SALARY_EUR[role.grade]);
    }
  });

  it('the free local floor + governance seats cost €0', () => {
    expect(roleSalaryEur(findEveTeamRole('house-keeper')!)).toBe(0);
    expect(roleSalaryEur(findEveTeamRole('ceo')!)).toBe(0);
    expect(roleSalaryEur(findEveTeamRole('chief-of-staff')!)).toBe(0);
  });

  it('maps the operators onto the task-canonical bands', () => {
    expect(roleSalaryEur(findEveTeamRole('content-writer')!)).toBe(25); // content
    expect(roleSalaryEur(findEveTeamRole('seo-lead')!)).toBe(25); // content/ops
    expect(roleSalaryEur(findEveTeamRole('eval-research')!)).toBe(40); // research
    expect(roleSalaryEur(findEveTeamRole('video-marketer')!)).toBe(60); // videomarketer
  });
});

// ---------------------------------------------------------------------------
// (1) projectMonthlySpend — sum of ACTIVE salaries
// ---------------------------------------------------------------------------

describe('projectMonthlySpend — sum of ACTIVE worker salaries', () => {
  it('default (all roles active) sums only the paid salaries, fits the hull', () => {
    // No overrides ⇒ every role defaults to active. The paid operators are:
    // growth-lead 25 + seo-lead 25 + content-writer 25 + reddit-lead 25 +
    // video-marketer 60 + eval-research 40 = 200. Free floor + seats = 0.
    const projection = projectMonthlySpend({});
    expect(projection.totalEur).toBe(200);
    expect(projection.hullEur).toBe(BASE_HULL_EUR);
  });

  it('a quiet team (only the free floor active) projects €0 and fits', () => {
    // Turn every paid operator off; keep only the free local floor active.
    const statuses: EveTeamWorkerStatusMap = {
      'growth-lead': 'off',
      'seo-lead': 'off',
      'content-writer': 'off',
      'reddit-lead': 'off',
      'video-marketer': 'off',
      'eval-research': 'off',
    };
    const projection = projectMonthlySpend(statuses);
    expect(projection.totalEur).toBe(0);
    expect(projection.fitsHull).toBe(true);
    expect(projection.remainingEur).toBe(BASE_HULL_EUR);
    expect(projection.overageEur).toBe(0);
  });

  it('a single €25 operator active (growth-lead, G4 Ops/Sales) projects exactly its salary, with head-room', () => {
    const statuses: EveTeamWorkerStatusMap = {
      'growth-lead': 'active',
      'seo-lead': 'off',
      'content-writer': 'off',
      'reddit-lead': 'off',
      'video-marketer': 'off',
      'eval-research': 'off',
    };
    const projection = projectMonthlySpend(statuses);
    expect(projection.totalEur).toBe(25);
    expect(projection.fitsHull).toBe(true);
    expect(projection.remainingEur).toBe(35);
    expect(projection.overageEur).toBe(0);
  });

  it('paused/off workers do NOT count toward the projected spend', () => {
    const base: EveTeamWorkerStatusMap = {
      'growth-lead': 'off',
      'seo-lead': 'off',
      'content-writer': 'off',
      'reddit-lead': 'off',
      'video-marketer': 'off',
      'eval-research': 'off',
    };
    expect(projectMonthlySpend({ ...base, 'growth-lead': 'paused' }).totalEur).toBe(0);
    expect(projectMonthlySpend({ ...base, 'growth-lead': 'off' }).totalEur).toBe(0);
    expect(projectMonthlySpend({ ...base, 'growth-lead': 'active' }).totalEur).toBe(25);
  });

  it('reports an overage when the active spend exceeds the hull', () => {
    // video-marketer (60) + eval-research (40) = 100 > 60 hull.
    const statuses: EveTeamWorkerStatusMap = {
      'growth-lead': 'off',
      'seo-lead': 'off',
      'content-writer': 'off',
      'reddit-lead': 'off',
      'video-marketer': 'active',
      'eval-research': 'active',
    };
    const projection = projectMonthlySpend(statuses);
    expect(projection.totalEur).toBe(100);
    expect(projection.fitsHull).toBe(false);
    expect(projection.overageEur).toBe(40);
    expect(projection.remainingEur).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (2) projectAfterAction — the would-be projection
// ---------------------------------------------------------------------------

describe('projectAfterAction — projection if an action were applied', () => {
  const onlyFloor: EveTeamWorkerStatusMap = {
    'growth-lead': 'off',
    'seo-lead': 'off',
    'content-writer': 'off',
    'reddit-lead': 'off',
    'video-marketer': 'off',
    'eval-research': 'off',
  };

  it('activating a paid worker adds its salary to the projection', () => {
    const role = findEveTeamRole('content-writer') as EveTeamRole;
    const after = projectAfterAction(role, 'resume', onlyFloor);
    expect(after.totalEur).toBe(25);
  });

  it('deactivating an active paid worker subtracts its salary', () => {
    const allActivePaidOnlyVideo: EveTeamWorkerStatusMap = { ...onlyFloor, 'video-marketer': 'active' };
    const role = findEveTeamRole('video-marketer') as EveTeamRole;
    const after = projectAfterAction(role, 'release', allActivePaidOnlyVideo);
    expect(after.totalEur).toBe(0);
  });

  it('does not mutate the input status map', () => {
    const role = findEveTeamRole('content-writer') as EveTeamRole;
    const snapshot = JSON.stringify(onlyFloor);
    projectAfterAction(role, 'hire', onlyFloor);
    expect(JSON.stringify(onlyFloor)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// (3) evaluateBudgetGate — cap-and-ask STOPS AT the budget line
// ---------------------------------------------------------------------------

describe('evaluateBudgetGate — cap-and-ask at the base-hull line', () => {
  const onlyFloor: EveTeamWorkerStatusMap = {
    'growth-lead': 'off',
    'seo-lead': 'off',
    'content-writer': 'off',
    'reddit-lead': 'off',
    'video-marketer': 'off',
    'eval-research': 'off',
  };

  it('allows an activating hire that still fits within the hull (no warning)', () => {
    const role = findEveTeamRole('content-writer') as EveTeamRole; // 25 ≤ 60
    const gate = evaluateBudgetGate(role, 'hire', onlyFloor);
    expect(gate.allowed).toBe(true);
    expect(gate.requiresWarning).toBe(false);
    expect(gate.reason).toBe('fits-hull');
    expect(gate.projectedEur).toBe(25);
  });

  it('warns BEFORE the budget is crossed when a hire would exceed the hull', () => {
    // Pre-load to 25; hiring the 60€ video-marketer → 85 > 60 hull.
    const statuses: EveTeamWorkerStatusMap = { ...onlyFloor, 'content-writer': 'active' };
    const role = findEveTeamRole('video-marketer') as EveTeamRole;
    const gate = evaluateBudgetGate(role, 'hire', statuses);
    expect(gate.requiresWarning).toBe(true);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('would-exceed-hull');
    expect(gate.projectedEur).toBe(85);
    expect(gate.overageEur).toBe(25);
  });

  it('treats a hire landing exactly ON the hull as still fitting (warns only when strictly OVER)', () => {
    // Only the floor active → hiring the 60€ video-marketer lands exactly on the
    // 60€ hull. Exactly-on-the-line is "fits" (cap-and-ask warns only when OVER).
    const role = findEveTeamRole('video-marketer') as EveTeamRole; // 60
    const gate = evaluateBudgetGate(role, 'hire', onlyFloor, EVE_TEAM_ROSTER, 60);
    expect(gate.projectedEur).toBe(60);
    expect(gate.requiresWarning).toBe(false);
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBe('fits-hull');
  });

  it('never gates a deactivation (it can only shrink the spend)', () => {
    const statuses: EveTeamWorkerStatusMap = { ...onlyFloor, 'video-marketer': 'active', 'eval-research': 'active' };
    const role = findEveTeamRole('video-marketer') as EveTeamRole;
    const gate = evaluateBudgetGate(role, 'release', statuses);
    expect(gate.requiresWarning).toBe(false);
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBe('not-activating');
  });

  it('never gates activating the free local floor (it costs €0)', () => {
    const role = findEveTeamRole('house-keeper') as EveTeamRole;
    // Even with a fully over-budget team, re-activating the free floor is free.
    const overBudget: EveTeamWorkerStatusMap = {
      'video-marketer': 'active',
      'eval-research': 'active',
      'house-keeper': 'off',
    };
    const gate = evaluateBudgetGate(role, 'resume', overBudget);
    expect(gate.requiresWarning).toBe(false);
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBe('free-no-cost');
  });
});
