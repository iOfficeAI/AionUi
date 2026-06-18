/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE — "Dein Team" controls core (PURE).
 *
 * This module is the dependency-light, framework-free brain behind the team
 * panel's two rhythm-correct controls and the non-empty-floor guard. It holds
 * NO React, NO config bridge, NO IO — just the rules the UI and the tests both
 * rely on. The renderer maps these decisions onto buttons; persistence rides the
 * existing config service.
 *
 * TWO DISTINCT CONTROLS (the pre-mortem distinction). A single "feuern" verb for
 * everything is dishonest — you do not "fire" your permanent staff when you
 * simply want them quiet for a while. So the control is keyed off the role's
 * {@link EveTeamRole.rhythm}:
 *
 *   - always-on → PAUSE / DROSSELN. The worker stays a member of the company;
 *     you pause it (off) or throttle it (paused) and resume it later.
 *   - burst     → EINSTELLEN-FÜR-SPRINT / ENTLASSEN. The worker is engaged for a
 *     push; you hire it for a sprint (active) and let it go (off) when done.
 *
 * NON-EMPTY FLOOR (P0 #2). The base always keeps at least one free, local,
 * always-on worker running (the Hauspförtner / FAQ, G0). Before the action that
 * would deactivate the LAST active worker, the guard WARNS and refuses to let
 * the company go empty — it keeps (or restores) the free floor instead. The
 * company is never empty.
 */

import { EVE_TEAM_ROSTER, type EveTeamRole, type EveTeamRoleRhythm } from './eveTeamRoster';

/**
 * The persisted status of a single worker.
 *   - 'active' : on and working.
 *   - 'paused' : throttled — kept on the team but dialed down (always-on only).
 *   - 'off'    : not running (always-on: paused-to-off; burst: let go / not hired).
 */
export type EveTeamWorkerStatus = 'active' | 'paused' | 'off';

/** The persisted map of agent_id → status. Absent ids fall back to their default. */
export type EveTeamWorkerStatusMap = Readonly<Record<string, EveTeamWorkerStatus>>;

/**
 * The user-facing control a role exposes. Keyed off the role rhythm so the verb
 * is honest:
 *   - 'pause-throttle' : always-on → Pause / Drosseln (NEVER "feuern").
 *   - 'hire-fire'      : burst     → Einstellen für Sprint / Entlassen.
 */
export type EveTeamControlKind = 'pause-throttle' | 'hire-fire';

/** Map a role rhythm to the single correct control kind. The whole point. */
export function controlKindForRhythm(rhythm: EveTeamRoleRhythm): EveTeamControlKind {
  return rhythm === 'always-on' ? 'pause-throttle' : 'hire-fire';
}

/** Convenience: the control kind for a role (keyed off its rhythm). */
export function controlKindForRole(role: Pick<EveTeamRole, 'rhythm'>): EveTeamControlKind {
  return controlKindForRhythm(role.rhythm);
}

/**
 * The default status of a role before the user has touched anything. Every role
 * starts active — the curated team is "your company, already staffed". The
 * persisted map only ever overrides this default.
 */
export function defaultStatusForRole(_role: EveTeamRole): EveTeamWorkerStatus {
  return 'active';
}

/** Resolve a role's effective status: persisted value if present, else the default. */
export function statusForRole(role: EveTeamRole, statuses: EveTeamWorkerStatusMap): EveTeamWorkerStatus {
  const persisted = statuses[role.agent_id];
  return persisted ?? defaultStatusForRole(role);
}

/** A worker counts as "active" iff its effective status is 'active'. Paused/off do not count. */
export function isWorkerActive(role: EveTeamRole, statuses: EveTeamWorkerStatusMap): boolean {
  return statusForRole(role, statuses) === 'active';
}

/** Count the currently-active workers across the roster. */
export function countActiveWorkers(statuses: EveTeamWorkerStatusMap, roster: readonly EveTeamRole[] = EVE_TEAM_ROSTER): number {
  let n = 0;
  for (const role of roster) {
    if (isWorkerActive(role, statuses)) n += 1;
  }
  return n;
}

/**
 * The free, local, always-on worker that anchors the non-empty floor. Returns
 * the first such role in roster order, or undefined if (defensively) none is
 * curated. This is the worker the company falls back to so it is never empty.
 */
export function findFreeFloorWorker(roster: readonly EveTeamRole[] = EVE_TEAM_ROSTER): EveTeamRole | undefined {
  return roster.find((r) => r.free === true && r.rhythm === 'always-on');
}

/** True iff `role` is the free local always-on floor worker. */
export function isFreeFloorWorker(role: Pick<EveTeamRole, 'free' | 'rhythm'>): boolean {
  return role.free === true && role.rhythm === 'always-on';
}

/**
 * The intent behind a control action. The renderer translates a button press to
 * one of these; the guard below interprets it against the floor rule.
 *   - 'pause'   : always-on → throttle to 'paused'.
 *   - 'resume'  : either    → back to 'active'.
 *   - 'stop'    : always-on → 'off' (fully off, still a team member).
 *   - 'release' : burst     → 'off' (let go / not hired for the sprint).
 *   - 'hire'    : burst     → 'active' (engage for a sprint).
 */
export type EveTeamControlAction = 'pause' | 'resume' | 'stop' | 'release' | 'hire';

/** The status an action targets, before the floor guard is applied. */
export function targetStatusForAction(action: EveTeamControlAction): EveTeamWorkerStatus {
  switch (action) {
    case 'resume':
    case 'hire':
      return 'active';
    case 'pause':
      return 'paused';
    case 'stop':
    case 'release':
      return 'off';
  }
}

/** An action that would take a worker OUT of the active set (the ones the floor guards). */
export function isDeactivatingAction(action: EveTeamControlAction): boolean {
  return targetStatusForAction(action) !== 'active';
}

/** The outcome of evaluating a control action against the non-empty-floor rule. */
export interface FloorGuardDecision {
  /** Whether the action may proceed as-is (true) or is blocked / redirected (false). */
  allowed: boolean;
  /** True iff the UI must show the "last worker" warning before this can proceed. */
  requiresWarning: boolean;
  /**
   * What to do instead when the floor would be undercut:
   *   - 'proceed'         : apply the requested status; the floor is safe.
   *   - 'keep-floor'      : refuse to deactivate the last/free worker; keep it on.
   *   - 'restore-floor'   : apply the requested status BUT force the free floor
   *                         worker back to 'active' so the company is not empty.
   */
  resolution: 'proceed' | 'keep-floor' | 'restore-floor';
  /** A stable reason code for the decision (UI copy + tests key off this). */
  reason:
    | 'ok'
    | 'would-empty-company'
    | 'is-free-floor-worker'
    | 'last-active-is-floor';
}

/**
 * Evaluate a deactivating control action against the non-empty-floor rule.
 *
 * Rules (the company is NEVER empty):
 *  1. You may never take the free local always-on floor worker (G0) out of the
 *     active set if it is the only thing keeping the floor — it stays on.
 *  2. If the action would drop the active count to zero, warn and keep a free
 *     floor worker active instead (restore-floor): deactivating the last paid
 *     worker silently re-activates the free local G0 so the company keeps a
 *     free, local, always-on worker.
 *  3. Otherwise the action proceeds unchanged.
 *
 * Activating actions (hire/resume) always proceed — they can only grow the team.
 */
export function evaluateFloorGuard(
  role: EveTeamRole,
  action: EveTeamControlAction,
  statuses: EveTeamWorkerStatusMap,
  roster: readonly EveTeamRole[] = EVE_TEAM_ROSTER
): FloorGuardDecision {
  // Activating actions can never empty the company — always fine.
  if (!isDeactivatingAction(action)) {
    return { allowed: true, requiresWarning: false, resolution: 'proceed', reason: 'ok' };
  }

  const floor = findFreeFloorWorker(roster);
  const activeBefore = countActiveWorkers(statuses, roster);
  const roleIsActive = isWorkerActive(role, statuses);
  // How many workers would be active AFTER this action (only changes if the
  // role was active and is being deactivated).
  const activeAfter = roleIsActive ? activeBefore - 1 : activeBefore;

  // Rule 1: never deactivate the free floor worker when it is the last guard of
  // the floor. If this IS the free floor worker and removing it would leave the
  // company empty, keep it on.
  if (floor && role.agent_id === floor.agent_id && activeAfter <= 0) {
    return {
      allowed: false,
      requiresWarning: true,
      resolution: 'keep-floor',
      reason: 'is-free-floor-worker',
    };
  }

  // Rule 2: the action would empty the company. Warn, and restore the free floor
  // worker to active so a free, local, always-on worker remains.
  if (activeAfter <= 0) {
    return {
      allowed: floor != null,
      requiresWarning: true,
      resolution: floor != null ? 'restore-floor' : 'keep-floor',
      reason: floor != null ? 'would-empty-company' : 'last-active-is-floor',
    };
  }

  // Rule 3: floor is safe, proceed unchanged.
  return { allowed: true, requiresWarning: false, resolution: 'proceed', reason: 'ok' };
}

/**
 * Apply a control action to the status map, ENFORCING the non-empty-floor rule.
 * Returns the next status map (a new object; never mutates the input). This is
 * the single reducer the renderer calls so the persisted state can never reach
 * an empty-company state regardless of how the UI calls it.
 *
 * The `confirmedWarning` flag mirrors the UI: when the guard requires a warning,
 * the renderer surfaces it first; once the user confirms, it calls again with
 * `confirmedWarning = true`. A 'keep-floor' decision is honored either way — the
 * free floor worker is never removed — but the rest of the action only applies
 * after confirmation when a warning is required.
 */
export function applyControlAction(
  role: EveTeamRole,
  action: EveTeamControlAction,
  statuses: EveTeamWorkerStatusMap,
  options: { confirmedWarning?: boolean } = {},
  roster: readonly EveTeamRole[] = EVE_TEAM_ROSTER
): { next: EveTeamWorkerStatusMap; decision: FloorGuardDecision; applied: boolean } {
  const decision = evaluateFloorGuard(role, action, statuses, roster);

  // A required warning that has not been confirmed: no state change yet.
  if (decision.requiresWarning && !options.confirmedWarning) {
    return { next: statuses, decision, applied: false };
  }

  // keep-floor: refuse the deactivation outright — the free floor worker stays on.
  if (decision.resolution === 'keep-floor') {
    // Ensure the role (the floor worker) is active in the persisted map.
    const next: Record<string, EveTeamWorkerStatus> = { ...statuses };
    next[role.agent_id] = 'active';
    return { next, decision, applied: false };
  }

  const target = targetStatusForAction(action);
  const next: Record<string, EveTeamWorkerStatus> = { ...statuses, [role.agent_id]: target };

  // restore-floor: also force the free floor worker back to active so the
  // company keeps a free, local, always-on worker after this deactivation.
  if (decision.resolution === 'restore-floor') {
    const floor = findFreeFloorWorker(roster);
    if (floor) next[floor.agent_id] = 'active';
  }

  return { next, decision, applied: true };
}
