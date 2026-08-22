/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type {
  AutoModelConversationExtra,
  AutoModelPhase,
  AutoModelPreference,
  AutoModelSettings,
  AutoModelSlotBinding,
  AutoModelSlots,
  ResolveAutoModelInput,
  ResolveAutoModelResult,
} from './types';
export {
  AUTO_MODEL_COMPOSITE_ID,
  AUTO_MODEL_CONFIG_KEY,
  defaultAutoModelSettings,
  defaultAutoModelSlots,
  defaultSlotBinding,
  isAutoCompositeId,
} from './constants';
export { resolveAutoModel } from './resolveAutoModel';
export { decideAutoModelPhase, looksLikeReplanRequest } from './decideAutoModelPhase';
export { applyAutoModelForTurn, persistAutoModelConversationState } from './applyAutoModelForTurn';
export type { ApplyAutoModelForTurnInput, ApplyAutoModelForTurnResult } from './applyAutoModelForTurn';
export type { DecideAutoModelPhaseInput } from './decideAutoModelPhase';
export { normalizeAutoModelSettings, readAutoModelSettings, writeAutoModelSettings } from './settings';
export { preferenceWeight, scoreModelForSlots } from './tierHeuristics';
