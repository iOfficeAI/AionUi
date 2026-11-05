/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AutoModelPhase } from './types';

export type DecideAutoModelPhaseInput = {
  /** True when the conversation already has at least one user turn. */
  hasPriorUserTurns: boolean;
  userInput: string;
  /** Worker turns that failed in a row; ≥2 escalates to planner. */
  consecutiveWorkerFailures?: number;
};

const REPLAN_PATTERNS: RegExp[] = [
  /\breplan\b/i,
  /\bre-?plan\b/i,
  /\brethink\b/i,
  /\bstart over\b/i,
  /\btry a different (approach|plan|strategy)\b/i,
  /\bchange (the )?plan\b/i,
  /重新规划/,
  /换个方案/,
  /换个思路/,
  /从头再来/,
  /重新设计/,
];

export const looksLikeReplanRequest = (userInput: string): boolean => {
  const text = userInput.trim();
  if (!text) return false;
  return REPLAN_PATTERNS.some((pattern) => pattern.test(text));
};

/**
 * Phase-2 Auto routing: prefer planner for first turn / replan / worker failure
 * escalation; otherwise worker. Utility is reserved for later subagent work.
 */
export const decideAutoModelPhase = (input: DecideAutoModelPhaseInput): AutoModelPhase => {
  if (!input.hasPriorUserTurns) return 'planner';
  if ((input.consecutiveWorkerFailures ?? 0) >= 2) return 'planner';
  if (looksLikeReplanRequest(input.userInput)) return 'planner';
  return 'worker';
};
