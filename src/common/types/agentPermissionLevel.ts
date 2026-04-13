/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Team permission level abstraction.
 *
 * When the team leader switches permission mode, each member agent must be
 * mapped to the closest equivalent mode supported by its backend.
 *
 * Four canonical levels:
 *   L0 (Locked)    — read-only / planning, no actions
 *   L1 (Default)   — normal interactive mode
 *   L2 (AutoEdit)  — auto-approve edits, prompt for commands
 *   L3 (FullAuto)  — auto-approve everything (yolo / bypassPermissions)
 */

export type PermissionLevelValue = 0 | 1 | 2 | 3;

export const PermissionLevel = {
  L0_LOCKED: 0 as PermissionLevelValue,
  L1_DEFAULT: 1 as PermissionLevelValue,
  L2_AUTO_EDIT: 2 as PermissionLevelValue,
  L3_FULL_AUTO: 3 as PermissionLevelValue,
} as const;

// ── Flat mode → level table ──────────────────────────────────────────

/**
 * Global mapping from every known backend mode string to its permission level.
 * Unknown modes fall back to L1_DEFAULT via getModeLevel().
 */
const _modeToLevel: Record<string, PermissionLevelValue> = {
  // L0 — Locked / read-only
  plan: PermissionLevel.L0_LOCKED,
  ask: PermissionLevel.L0_LOCKED,

  // L1 — Default
  default: PermissionLevel.L1_DEFAULT,

  // L2 — Auto-edit
  acceptEdits: PermissionLevel.L2_AUTO_EDIT,
  autoEdit: PermissionLevel.L2_AUTO_EDIT,
  auto_edit: PermissionLevel.L2_AUTO_EDIT,
  smart: PermissionLevel.L2_AUTO_EDIT,
  build: PermissionLevel.L2_AUTO_EDIT,

  // L3 — Full auto
  yolo: PermissionLevel.L3_FULL_AUTO,
  bypassPermissions: PermissionLevel.L3_FULL_AUTO,
  dontAsk: PermissionLevel.L3_FULL_AUTO,
  agent: PermissionLevel.L3_FULL_AUTO,
  auto: PermissionLevel.L3_FULL_AUTO,
  yoloNoSandbox: PermissionLevel.L3_FULL_AUTO,
};

/**
 * Get the permission level for a mode string.
 * Returns L1_DEFAULT for unknown modes.
 */
export function getModeLevel(mode: string): PermissionLevelValue {
  return _modeToLevel[mode] ?? PermissionLevel.L1_DEFAULT;
}

// ── Backend mode lists ───────────────────────────────────────────────

/**
 * Available modes for each backend, used by getPermissionMap().
 *
 * ORDER MATTERS — for modes at the same level, `.find()` returns the first
 * match. For claude, `bypassPermissions` must precede `dontAsk` (both L3
 * but opposite behavior: bypass = allow all, dontAsk = block all).
 */
const _backendModes: Record<string, string[]> = {
  // ORDER MATTERS: bypassPermissions before dontAsk — canonical L3
  claude: ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'dontAsk'],
  qwen: ['default', 'yolo'],
  opencode: ['build', 'plan'],
  iflow: ['default', 'smart', 'plan', 'yolo'],
  gemini: ['default', 'autoEdit', 'yolo'],
  aionrs: ['default', 'auto_edit', 'yolo'],
  codex: ['default', 'autoEdit', 'yolo', 'yoloNoSandbox'],
  cursor: ['agent', 'plan', 'ask'],
  codebuddy: ['default', 'acceptEdits', 'bypassPermissions'],
};

/**
 * Get the available mode strings for a backend.
 * Returns empty array for unknown backends.
 */
export function getBackendModes(backend: string): string[] {
  return _backendModes[backend] ?? [];
}

// ── Permission mapping ───────────────────────────────────────────────

/**
 * Find the best matching mode in `permissionList` for the given `target` mode.
 *
 * Algorithm:
 * 1. Exact match → return it.
 * 2. Otherwise, find the closest level. On ties, prefer downgrade (safer).
 * 3. If target is L3 (FullAuto) but no L3 mode exists in the list → return null.
 *    The caller should use 'default' as a placeholder and rely on Manager-layer
 *    auto-approve (teamLeaderLevel) for runtime permission bypass.
 *
 * @param target - The leader's mode string
 * @param permissionList - Available modes for the member backend
 * @returns The best matching mode, or null if L3 target has no L3 option
 */
export function getPermissionMap(target: string, permissionList: string[]): string | null {
  if (permissionList.length === 0) return null;

  // Exact match
  if (permissionList.includes(target)) return target;

  const targetLevel = getModeLevel(target);

  // L3 target with no L3 option → null (Manager-layer fallback needed)
  if (targetLevel === PermissionLevel.L3_FULL_AUTO) {
    const hasL3 = permissionList.some((m) => getModeLevel(m) === PermissionLevel.L3_FULL_AUTO);
    if (!hasL3) return null;
  }

  // Closest match with directional tiebreak (prefer downgrade)
  let bestMode = permissionList[0];
  let bestDist = Math.abs(getModeLevel(bestMode) - targetLevel);
  let bestLevel = getModeLevel(bestMode);

  for (let i = 1; i < permissionList.length; i++) {
    const mode = permissionList[i];
    const level = getModeLevel(mode);
    const dist = Math.abs(level - targetLevel);

    if (dist < bestDist || (dist === bestDist && level < bestLevel)) {
      bestMode = mode;
      bestDist = dist;
      bestLevel = level;
    }
  }

  return bestMode;
}
