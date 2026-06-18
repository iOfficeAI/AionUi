/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE — "Dein Team" controls core unit tests (PURE).
 *
 * Pins the two load-bearing pre-mortem rules:
 *
 *  (A) RHYTHM → CONTROL mapping. always-on roles expose Pause/Drosseln
 *      ('pause-throttle'); burst roles expose Einstellen/Entlassen
 *      ('hire-fire'). The verb is keyed off rhythm — never a universal "feuern".
 *
 *  (B) NON-EMPTY-FLOOR guard (P0 #2). The base always keeps >=1 free local
 *      always-on worker active. Deactivating the last worker warns and keeps /
 *      restores the free floor; the persisted map can never describe an empty
 *      company; activating actions always proceed.
 */

import { describe, expect, it } from 'vitest';

import { EVE_TEAM_ROSTER, findEveTeamRole, type EveTeamRole } from '@/common/config/eveTeamRoster';
import {
  applyControlAction,
  controlKindForRhythm,
  controlKindForRole,
  countActiveOperators,
  countActiveWorkers,
  defaultStatusForRole,
  evaluateFloorGuard,
  findFreeFloorWorker,
  isDeactivatingAction,
  isFreeFloorWorker,
  isWorkerActive,
  statusForRole,
  targetStatusForAction,
  type EveTeamWorkerStatusMap,
} from '@/common/config/eveTeamControlsCore';

// A tiny synthetic roster keeps the floor-guard tests deterministic and decoupled
// from the curated roster's exact size. Mirrors the real shape: one free local
// always-on floor worker, one paid always-on, one burst.
const FLOOR: EveTeamRole = {
  agent_id: 'house-keeper',
  displayName: 'Hauspförtner',
  title: 'Empfang / FAQ',
  outcome: 'Beantwortet einfache Fragen rund um die Uhr.',
  tier: 'standard',
  skills: ['faq'],
  kind: 'work',
  rhythm: 'always-on',
  free: true,
};
const PAID_ALWAYS_ON: EveTeamRole = {
  agent_id: 'seo-lead',
  displayName: 'SEO',
  title: 'SEO Lead',
  outcome: 'Macht dich bei Google sichtbar.',
  tier: 'high',
  skills: ['seo-audit'],
  kind: 'work',
  rhythm: 'always-on',
};
const BURST: EveTeamRole = {
  agent_id: 'video-marketer',
  displayName: 'Video',
  title: 'Videomarketer',
  outcome: 'Plant Kurzvideos und Hooks.',
  tier: 'max',
  skills: ['video-script'],
  kind: 'work',
  rhythm: 'burst',
};
const TEST_ROSTER: readonly EveTeamRole[] = [FLOOR, PAID_ALWAYS_ON, BURST];

describe('eveTeamControlsCore — (A) rhythm → control mapping', () => {
  it('always-on → pause-throttle, burst → hire-fire', () => {
    expect(controlKindForRhythm('always-on')).toBe('pause-throttle');
    expect(controlKindForRhythm('burst')).toBe('hire-fire');
  });

  it('controlKindForRole reads the role rhythm', () => {
    expect(controlKindForRole(FLOOR)).toBe('pause-throttle');
    expect(controlKindForRole(BURST)).toBe('hire-fire');
  });

  it('every curated always-on role maps to pause-throttle and every burst to hire-fire', () => {
    for (const role of EVE_TEAM_ROSTER) {
      const expected = role.rhythm === 'always-on' ? 'pause-throttle' : 'hire-fire';
      expect(controlKindForRole(role), `control for ${role.agent_id}`).toBe(expected);
    }
  });
});

describe('eveTeamControlsCore — action → target status', () => {
  it('maps each action to its pre-guard target status', () => {
    expect(targetStatusForAction('hire')).toBe('active');
    expect(targetStatusForAction('resume')).toBe('active');
    expect(targetStatusForAction('pause')).toBe('paused');
    expect(targetStatusForAction('stop')).toBe('off');
    expect(targetStatusForAction('release')).toBe('off');
  });

  it('classifies deactivating vs activating actions', () => {
    expect(isDeactivatingAction('pause')).toBe(true);
    expect(isDeactivatingAction('stop')).toBe(true);
    expect(isDeactivatingAction('release')).toBe(true);
    expect(isDeactivatingAction('hire')).toBe(false);
    expect(isDeactivatingAction('resume')).toBe(false);
  });
});

describe('eveTeamControlsCore — status resolution & defaults', () => {
  it('defaults to active and lets the persisted map override', () => {
    expect(defaultStatusForRole(PAID_ALWAYS_ON)).toBe('active');
    const statuses: EveTeamWorkerStatusMap = { 'seo-lead': 'paused' };
    expect(statusForRole(PAID_ALWAYS_ON, statuses)).toBe('paused');
    expect(statusForRole(BURST, statuses)).toBe('active'); // absent ⇒ default
  });

  it('isWorkerActive only counts active (paused/off do not count)', () => {
    expect(isWorkerActive(PAID_ALWAYS_ON, {})).toBe(true);
    expect(isWorkerActive(PAID_ALWAYS_ON, { 'seo-lead': 'paused' })).toBe(false);
    expect(isWorkerActive(PAID_ALWAYS_ON, { 'seo-lead': 'off' })).toBe(false);
  });

  it('countActiveWorkers counts across the roster', () => {
    expect(countActiveWorkers({}, TEST_ROSTER)).toBe(3);
    expect(countActiveWorkers({ 'seo-lead': 'off', 'video-marketer': 'off' }, TEST_ROSTER)).toBe(1);
  });

  it('countActiveOperators counts only work roles, never governance seats', () => {
    // The real roster has 2 governance seats; counting all vs operators differs.
    const all = countActiveWorkers({});
    const ops = countActiveOperators({});
    expect(all - ops).toBe(2); // exactly the two governance seats
    // On the synthetic (governance-free) roster the two agree.
    expect(countActiveOperators({}, TEST_ROSTER)).toBe(3);
  });
});

describe('eveTeamControlsCore — (B) the free local floor worker', () => {
  it('identifies the free local always-on floor worker', () => {
    expect(isFreeFloorWorker(FLOOR)).toBe(true);
    expect(isFreeFloorWorker(PAID_ALWAYS_ON)).toBe(false);
    expect(isFreeFloorWorker(BURST)).toBe(false);
    expect(findFreeFloorWorker(TEST_ROSTER)?.agent_id).toBe('house-keeper');
  });

  it('the real curated roster carries exactly one free always-on floor worker', () => {
    const floors = EVE_TEAM_ROSTER.filter((r) => r.free === true && r.rhythm === 'always-on');
    expect(floors.length).toBe(1);
    expect(findFreeFloorWorker()?.agent_id).toBe('house-keeper');
  });
});

describe('eveTeamControlsCore — (B) non-empty-floor guard', () => {
  it('a deactivation that leaves others active proceeds with no warning', () => {
    const decision = evaluateFloorGuard(BURST, 'release', {}, TEST_ROSTER);
    expect(decision.allowed).toBe(true);
    expect(decision.requiresWarning).toBe(false);
    expect(decision.resolution).toBe('proceed');
  });

  it('activating actions always proceed (cannot empty the company)', () => {
    const offEverywhere: EveTeamWorkerStatusMap = {
      'house-keeper': 'off',
      'seo-lead': 'off',
      'video-marketer': 'off',
    };
    const decision = evaluateFloorGuard(BURST, 'hire', offEverywhere, TEST_ROSTER);
    expect(decision.requiresWarning).toBe(false);
    expect(decision.resolution).toBe('proceed');
  });

  it('deactivating the LAST paid worker warns and restores the free floor', () => {
    // Only the paid always-on is active; floor + burst already off.
    const statuses: EveTeamWorkerStatusMap = { 'house-keeper': 'off', 'video-marketer': 'off' };
    const decision = evaluateFloorGuard(PAID_ALWAYS_ON, 'stop', statuses, TEST_ROSTER);
    expect(decision.requiresWarning).toBe(true);
    expect(decision.reason).toBe('would-empty-company');
    expect(decision.resolution).toBe('restore-floor');
  });

  it('deactivating the free floor worker when it is the last guard keeps it on', () => {
    const statuses: EveTeamWorkerStatusMap = { 'seo-lead': 'off', 'video-marketer': 'off' };
    const decision = evaluateFloorGuard(FLOOR, 'stop', statuses, TEST_ROSTER);
    expect(decision.requiresWarning).toBe(true);
    expect(decision.reason).toBe('is-free-floor-worker');
    expect(decision.resolution).toBe('keep-floor');
  });
});

describe('eveTeamControlsCore — applyControlAction reducer (never goes empty)', () => {
  it('an unconfirmed required warning makes no state change', () => {
    const statuses: EveTeamWorkerStatusMap = { 'house-keeper': 'off', 'video-marketer': 'off' };
    const { next, applied } = applyControlAction(PAID_ALWAYS_ON, 'stop', statuses, {}, TEST_ROSTER);
    expect(applied).toBe(false);
    expect(next).toBe(statuses); // unchanged reference
  });

  it('confirming the last-paid-worker deactivation restores the free floor to active', () => {
    const statuses: EveTeamWorkerStatusMap = { 'house-keeper': 'off', 'video-marketer': 'off' };
    const { next, applied, decision } = applyControlAction(
      PAID_ALWAYS_ON,
      'stop',
      statuses,
      { confirmedWarning: true },
      TEST_ROSTER
    );
    expect(applied).toBe(true);
    expect(decision.resolution).toBe('restore-floor');
    expect(next['seo-lead']).toBe('off');
    expect(next['house-keeper']).toBe('active'); // floor restored — company not empty
    expect(countActiveWorkers(next, TEST_ROSTER)).toBeGreaterThanOrEqual(1);
  });

  it('keep-floor keeps the free worker active and does not turn it off', () => {
    const statuses: EveTeamWorkerStatusMap = { 'seo-lead': 'off', 'video-marketer': 'off' };
    const { next, applied } = applyControlAction(
      FLOOR,
      'stop',
      statuses,
      { confirmedWarning: true },
      TEST_ROSTER
    );
    expect(applied).toBe(false);
    expect(next['house-keeper']).toBe('active');
    expect(countActiveWorkers(next, TEST_ROSTER)).toBeGreaterThanOrEqual(1);
  });

  it('a non-floor-emptying deactivation applies normally and never mutates input', () => {
    const statuses: EveTeamWorkerStatusMap = {};
    const { next, applied } = applyControlAction(BURST, 'release', statuses, {}, TEST_ROSTER);
    expect(applied).toBe(true);
    expect(next['video-marketer']).toBe('off');
    expect(next).not.toBe(statuses);
    expect(statuses).toEqual({}); // input untouched
    expect(countActiveWorkers(next, TEST_ROSTER)).toBe(2);
  });

  it('property: no sequence of deactivations against the real roster can empty the workforce', () => {
    let statuses: EveTeamWorkerStatusMap = {};
    // Try to turn every operator off, always confirming the warning.
    for (const role of EVE_TEAM_ROSTER) {
      if (role.kind === 'governance') continue; // governance has no off control
      const action = role.rhythm === 'always-on' ? 'stop' : 'release';
      const res = applyControlAction(role, action, statuses, { confirmedWarning: true });
      statuses = res.next;
    }
    // The floor guarantees at least one active OPERATOR remains — and it is the
    // free local worker. Governance seats stay up but do not satisfy the floor.
    expect(countActiveOperators(statuses)).toBeGreaterThanOrEqual(1);
    const floor = findEveTeamRole('house-keeper')!;
    expect(isWorkerActive(floor, statuses)).toBe(true);
  });

  it('governance seats do NOT mask an empty workforce (operator floor, not seat count)', () => {
    // Deactivate every operator EXCEPT the floor, in roster order, then try to
    // deactivate the floor itself — the guard must refuse / keep it on.
    let statuses: EveTeamWorkerStatusMap = {};
    for (const role of EVE_TEAM_ROSTER) {
      if (role.kind !== 'work') continue;
      if (role.agent_id === 'house-keeper') continue;
      const action = role.rhythm === 'always-on' ? 'stop' : 'release';
      statuses = applyControlAction(role, action, statuses, { confirmedWarning: true }).next;
    }
    // Now only governance seats + the floor are active. Try to stop the floor.
    const floor = findEveTeamRole('house-keeper')!;
    const decision = evaluateFloorGuard(floor, 'stop', statuses);
    expect(decision.requiresWarning).toBe(true);
    expect(decision.reason).toBe('is-free-floor-worker');
    const res = applyControlAction(floor, 'stop', statuses, { confirmedWarning: true });
    expect(isWorkerActive(floor, res.next)).toBe(true); // floor kept on
    expect(countActiveOperators(res.next)).toBeGreaterThanOrEqual(1);
  });
});
