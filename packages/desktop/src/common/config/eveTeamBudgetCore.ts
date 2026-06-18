/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE — PRE-VISIBLE projected-budget core (P0 #1, PURE).
 *
 * The founder mandate is "nothing confusing" + "no surprise bill". So BEFORE a
 * user hires / activates a worker, the desktop must show the PROJECTED month-end
 * spend = the sum of the expected EUR/mo "salaries" of every ACTIVE worker, and
 * whether that still fits the included ~60€ base hull. The guardrail is
 * cap-and-ask: the wall warns BEFORE the budget line is crossed (not after the
 * bill arrives).
 *
 * This module is PURE (no React, no config bridge, no IO) — the budget MATH and
 * the fits-hull DECISION live here so they are trivially unit-testable in plain
 * Node (vitest), mirroring `creditsCore.ts` / `videoCostCore.ts` /
 * `eveTeamControlsCore.ts`. The renderer (`ProjectedSpendMeter.tsx`) is the
 * presentation + the activate-time confirm wiring on top of this.
 *
 *   - `projectMonthlySpend(statuses)`  : sum of ACTIVE roles' salaries (€/mo).
 *   - `projectAfterActivating(role, …)`: the projection if `role` becomes active.
 *   - `evaluateBudgetGate(role, …)`    : the cap-and-ask decision for a HIRE —
 *                                        warns/blocks AT the hull line, BEFORE it
 *                                        is exceeded.
 *
 * The expected per-role salary comes from {@link roleSalaryEur} (the Founder-
 * locked grade table). This module never re-prices a role — it only sums.
 */

import {
  EVE_TEAM_ROSTER,
  roleSalaryEur,
  type EveTeamRole,
} from './eveTeamRoster';
import {
  isWorkerActive,
  targetStatusForAction,
  type EveTeamControlAction,
  type EveTeamWorkerStatusMap,
} from './eveTeamControlsCore';

/**
 * The included monthly base "hull" in EUR — the all-inclusive subscription floor
 * the projected hire-spend should fit inside before a top-up is needed. Mirrors
 * the §3 Starter allowance (~60€-at-cost) used by creditsCore; kept as its own
 * constant here so the budget core stays dependency-light and the meaning is
 * explicit at the call-site ("does the team fit the base?").
 */
export const BASE_HULL_EUR = 60;

/** A single role's contribution to the projected spend (only when active). */
export interface RoleSpendLine {
  role: EveTeamRole;
  /** The role's expected EUR/mo salary (0 for the free local floor / seats). */
  salaryEur: number;
  /** Whether this role is currently in the active set (only active roles count). */
  active: boolean;
}

/** The projected month-end spend view-model the meter renders. */
export interface ProjectedSpend {
  /** Per-role spend lines (every roster role, with its active flag + salary). */
  lines: readonly RoleSpendLine[];
  /** The sum of ACTIVE roles' salaries — the projected month-end spend (€/mo). */
  totalEur: number;
  /** The included base hull this projection is measured against (€/mo). */
  hullEur: number;
  /** True iff the projected spend still fits within the base hull. */
  fitsHull: boolean;
  /** How much head-room is left under the hull (€, never negative). */
  remainingEur: number;
  /** How much the projection exceeds the hull (€, 0 when it fits). */
  overageEur: number;
}

/**
 * Build the projected-spend view-model from the persisted worker-status map.
 * Sums the expected EUR/mo salary of every ACTIVE role (free local floor + the
 * governance seats contribute €0 by grade, so they never inflate the figure).
 */
export function projectMonthlySpend(
  statuses: EveTeamWorkerStatusMap,
  roster: readonly EveTeamRole[] = EVE_TEAM_ROSTER,
  hullEur: number = BASE_HULL_EUR
): ProjectedSpend {
  const lines: RoleSpendLine[] = roster.map((role) => {
    const active = isWorkerActive(role, statuses);
    return { role, salaryEur: roleSalaryEur(role), active };
  });
  const totalEur = lines.reduce((sum, line) => (line.active ? sum + line.salaryEur : sum), 0);
  const fitsHull = totalEur <= hullEur;
  return {
    lines,
    totalEur,
    hullEur,
    fitsHull,
    remainingEur: Math.max(0, hullEur - totalEur),
    overageEur: Math.max(0, totalEur - hullEur),
  };
}

/**
 * The projected spend AFTER applying a control action to `role` — used to show
 * the user what hiring / activating (or releasing) this worker would do to the
 * month-end total BEFORE they commit. Deactivating actions subtract; activating
 * actions add; a no-op (already in that state) returns the current projection.
 *
 * Pure: it computes the would-be status map locally (never mutates the input).
 */
export function projectAfterAction(
  role: EveTeamRole,
  action: EveTeamControlAction,
  statuses: EveTeamWorkerStatusMap,
  roster: readonly EveTeamRole[] = EVE_TEAM_ROSTER,
  hullEur: number = BASE_HULL_EUR
): ProjectedSpend {
  const nextStatus = targetStatusForAction(action);
  const projected: Record<string, typeof nextStatus> = { ...statuses, [role.agent_id]: nextStatus };
  return projectMonthlySpend(projected, roster, hullEur);
}

/**
 * The outcome of evaluating a HIRE/activate against the base-hull budget line.
 * Cap-and-ask STOPS AT the line: it warns BEFORE the spend would exceed the
 * hull, so the user confirms the overage knowingly (it never silently lets the
 * bill grow past the base, and never blocks a hire that still fits).
 */
export interface BudgetGateDecision {
  /** Whether the activate may proceed without a confirm (true iff it still fits). */
  allowed: boolean;
  /** True iff the UI must surface the over-budget warning before this proceeds. */
  requiresWarning: boolean;
  /** The projected month-end spend if this activate is applied (€/mo). */
  projectedEur: number;
  /** The base hull the projection is measured against (€/mo). */
  hullEur: number;
  /** By how much the activate would push the projection over the hull (€, 0 if it fits). */
  overageEur: number;
  /** A stable reason code (UI copy + tests key off this). */
  reason: 'fits-hull' | 'would-exceed-hull' | 'not-activating' | 'free-no-cost';
}

/**
 * Evaluate a control action against the pre-visible budget hull. Only ACTIVATING
 * actions (hire / resume) can grow the spend, so deactivations and no-cost (free
 * local) roles always pass without a warning. For an activating PAID role, the
 * gate warns IFF the resulting projection would exceed the base hull — the
 * cap-and-ask line — so the warning fires BEFORE the budget is crossed, never
 * after.
 */
export function evaluateBudgetGate(
  role: EveTeamRole,
  action: EveTeamControlAction,
  statuses: EveTeamWorkerStatusMap,
  roster: readonly EveTeamRole[] = EVE_TEAM_ROSTER,
  hullEur: number = BASE_HULL_EUR
): BudgetGateDecision {
  const target = targetStatusForAction(action);

  // Deactivating actions can only shrink the spend — never gated by the budget.
  if (target !== 'active') {
    const after = projectAfterAction(role, action, statuses, roster, hullEur);
    return {
      allowed: true,
      requiresWarning: false,
      projectedEur: after.totalEur,
      hullEur,
      overageEur: after.overageEur,
      reason: 'not-activating',
    };
  }

  // The free local floor (and the €0 governance seats) cost nothing to activate.
  if (roleSalaryEur(role) <= 0) {
    const after = projectAfterAction(role, action, statuses, roster, hullEur);
    return {
      allowed: true,
      requiresWarning: false,
      projectedEur: after.totalEur,
      hullEur,
      overageEur: after.overageEur,
      reason: 'free-no-cost',
    };
  }

  const after = projectAfterAction(role, action, statuses, roster, hullEur);
  const wouldExceed = after.totalEur > hullEur;
  return {
    allowed: !wouldExceed,
    requiresWarning: wouldExceed,
    projectedEur: after.totalEur,
    hullEur,
    overageEur: after.overageEur,
    reason: wouldExceed ? 'would-exceed-hull' : 'fits-hull',
  };
}
