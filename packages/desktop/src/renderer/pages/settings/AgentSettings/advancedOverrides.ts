/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Serialization for the custom agent editor's advanced JSON panel.
 *
 * Extracted from `InlineAgentEditor` so the round-trip can be unit-tested: the panel accepts
 * free-form JSON but only keeps a known set of keys, and a key silently dropped here is
 * indistinguishable — to the user — from one that was saved.
 */
import type { CustomAgentAdvancedOverrides } from '@/common/types/platform/acpTypes';

type BehaviorPolicy = NonNullable<CustomAgentAdvancedOverrides['behavior_policy']>;

/**
 * Canonical shape shown when the user has not filled anything yet.
 *
 * Every supported key appears, including the booleans at `false`: the panel is the only place these
 * are documented, so an absent key reads as "unsupported" rather than "unset".
 */
export function buildAdvancedJson(advanced: CustomAgentAdvancedOverrides): string {
  const skeleton: CustomAgentAdvancedOverrides = {
    yolo_id: advanced.yolo_id ?? '',
    native_skills_dirs: advanced.native_skills_dirs ?? [],
    behavior_policy: advanced.behavior_policy ?? { supports_side_question: false, supports_team: false },
    description: advanced.description ?? '',
  };
  return JSON.stringify(skeleton, null, 2);
}

/**
 * Outcome of parsing the panel. The three cases are distinct on purpose:
 *   - `invalid`  — not JSON at all; the editor shows "Invalid JSON";
 *   - `ignored`  — valid JSON but not an object (`"s"`, `null`, a number); the editor clears the
 *                  error and keeps the previous bag. Preserved verbatim from the original inline
 *                  logic. Note an array is NOT ignored: `typeof [] === 'object'`, so it has always
 *                  parsed as an object with no known keys, i.e. it empties the bag;
 *   - `ok`       — a usable override bag.
 */
export type AdvancedParseResult =
  | { kind: 'ignored' }
  | { kind: 'invalid' }
  | { kind: 'ok'; value: CustomAgentAdvancedOverrides };

/**
 * Parse the panel's contents into the override bag.
 *
 * Unknown keys are ignored on purpose (the bag maps onto specific backend columns), and empty
 * values are omitted so an untouched panel does not send a payload of blanks.
 */
export function parseAdvancedOverrides(value: string): AdvancedParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { kind: 'invalid' };
  }
  if (!parsed || typeof parsed !== 'object') return { kind: 'ignored' };

  const p = parsed as Record<string, unknown>;
  const next: CustomAgentAdvancedOverrides = {};

  if (typeof p.yolo_id === 'string' && p.yolo_id.trim()) next.yolo_id = p.yolo_id;

  if (Array.isArray(p.native_skills_dirs)) {
    const dirs = p.native_skills_dirs.filter((x): x is string => typeof x === 'string');
    if (dirs.length > 0) next.native_skills_dirs = dirs;
  }

  if (p.behavior_policy && typeof p.behavior_policy === 'object') {
    const policy = parseBehaviorPolicy(p.behavior_policy as Record<string, unknown>);
    if (policy) next.behavior_policy = policy;
  }

  if (typeof p.description === 'string' && p.description.trim()) next.description = p.description;

  return { kind: 'ok', value: next };
}

/**
 * Known policy flags, accumulated rather than assigned as a fresh object per key: the previous
 * inline shape kept only `supports_side_question`, so `supports_team` was discarded even though the
 * backend reads it and `/api/agents/custom` accepts it.
 *
 * `undefined` when no known flag is present, so an unrecognised policy does not send an empty object.
 */
function parseBehaviorPolicy(bp: Record<string, unknown>): BehaviorPolicy | undefined {
  const policy: BehaviorPolicy = {};
  if (typeof bp.supports_side_question === 'boolean') policy.supports_side_question = bp.supports_side_question;
  if (typeof bp.supports_team === 'boolean') policy.supports_team = bp.supports_team;
  return Object.keys(policy).length > 0 ? policy : undefined;
}
