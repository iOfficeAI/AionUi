/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBaseModelName } from '@/common/utils/modelCapabilities';
import type { AutoModelPhase, AutoModelPreference } from './types';

type TierScore = { planner: number; worker: number; utility: number };

const isUtilityModel = (name: string): boolean =>
  /haiku|nano|mini|flash-lite|small|instant|fast\b/i.test(name) || (/flash/i.test(name) && !/pro/i.test(name));

/**
 * Frontier reasoning models — mutually exclusive tiers to avoid double-counting
 * (e.g. `gemini-3-pro-preview` matching both `pro-preview` and `gemini.*pro`).
 */
const frontierPlannerScore = (name: string): number => {
  if (/opus/i.test(name)) return 10;
  if (/o3|o1\b/i.test(name)) return 9;
  if (/gpt-5/i.test(name)) return 8;
  if (/r1|reasoning/i.test(name)) return 7;
  if (/pro-preview/i.test(name)) return 6;
  return 0;
};

const midPlannerScore = (name: string): number => {
  if (/sonnet/i.test(name)) return 5;
  if (/qwen.*max/i.test(name)) return 4;
  if (/gemini-[\d.]+-pro/i.test(name)) return 4;
  return 0;
};

const workerScore = (name: string, planner: number, utility: boolean): number => {
  if (utility) return 2;
  if (/sonnet/i.test(name)) return 8;
  if (/gpt-4o(?!-mini)/i.test(name)) return 7;
  if (/gpt-4\.1(?!-mini)/i.test(name)) return 6;
  if (/deepseek-chat|deepseek-v3/i.test(name)) return 6;
  if (/qwen3-coder-plus/i.test(name)) return 5;
  if (/qwen.*plus/i.test(name)) return 5;
  if (/coder/i.test(name)) return 4;
  if (planner >= 6) return 3;
  return 3;
};

/**
 * Score a model name for planner / worker / utility seats.
 * Higher is better for that seat. Unknown names get a mild worker bias.
 */
export const scoreModelForSlots = (modelName: string): TierScore => {
  const name = getBaseModelName(modelName).toLowerCase();
  const utilityModel = isUtilityModel(name);
  const planner = Math.max(frontierPlannerScore(name), midPlannerScore(name), 1);
  const worker = Math.max(workerScore(name, planner, utilityModel), 1);
  const utility = utilityModel ? 8 : planner >= 8 ? 1 : 2;

  return { planner, worker, utility };
};

/** Preference biases which automatic candidate wins within a seat. */
export const preferenceWeight = (preference: AutoModelPreference, slot: AutoModelPhase, scores: TierScore): number => {
  const base = scores[slot];
  if (preference === 'cost') {
    return base + scores.utility * 2 - scores.planner * 0.5;
  }
  if (preference === 'quality') {
    return base + scores.planner * 1.5 - scores.utility * 0.5;
  }
  // balance — slight cost awareness without overriding seat fit
  return base + scores.utility * 0.3;
};
