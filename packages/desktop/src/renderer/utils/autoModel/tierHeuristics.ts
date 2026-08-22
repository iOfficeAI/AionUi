/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBaseModelName } from '@/common/utils/modelCapabilities';
import type { AutoModelPhase, AutoModelPreference } from './types';

type TierScore = { planner: number; worker: number; utility: number };

/**
 * Score a model name for planner / worker / utility seats.
 * Higher is better for that seat. Unknown names get a mild worker bias.
 */
export const scoreModelForSlots = (modelName: string): TierScore => {
  const name = getBaseModelName(modelName);

  const utility =
    matchScore(name, [/haiku/i, /mini/i, /nano/i, /flash-lite/i, /lite/i, /small/i]) +
    (/(flash|instant|fast)/i.test(name) ? 2 : 0);

  const planner =
    matchScore(name, [/opus/i, /o3/i, /o1/i, /gpt-5/i, /r1/i, /reasoning/i, /fable/i, /pro-preview/i]) +
    (/(sonnet|gpt-4\.1(?!-mini)|qwen.*max|gemini.*pro)/i.test(name) ? 3 : 0);

  const worker =
    matchScore(name, [
      /sonnet/i,
      /gpt-4\.1(?!-mini)/i,
      /gpt-4o(?!-mini)/i,
      /qwen.*max/i,
      /qwen.*plus/i,
      /gemini.*pro/i,
      /deepseek-chat/i,
      /coder/i,
    ]) +
    (utility > 4 ? 1 : 0) +
    (planner > 6 ? 2 : 4);

  return { planner, worker: Math.max(worker, 1), utility: Math.max(utility, planner > 6 ? 0 : utility) };
};

const matchScore = (name: string, patterns: RegExp[]): number => {
  let score = 0;
  for (const pattern of patterns) {
    if (pattern.test(name)) score += 4;
  }
  return score;
};

/** Preference biases which automatic candidate wins within a seat. */
export const preferenceWeight = (preference: AutoModelPreference, slot: AutoModelPhase, scores: TierScore): number => {
  const base = scores[slot];
  if (preference === 'cost') {
    if (slot === 'planner') return base - scores.utility * 0.5;
    if (slot === 'worker') return base + scores.utility;
    return base + 2;
  }
  if (preference === 'quality') {
    if (slot === 'planner') return base + scores.planner;
    if (slot === 'worker') return base + scores.planner * 0.3;
    return base;
  }
  // balance
  return base;
};
