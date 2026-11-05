/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';

/** Routing phase for planner/worker Auto (Phase 2 switches between these). */
export type AutoModelPhase = 'planner' | 'worker' | 'utility';

/** Cost/quality bias when a slot is set to Automatic. */
export type AutoModelPreference = 'cost' | 'balance' | 'quality';

/** One bound model, or automatic heuristic fill. */
export type AutoModelSlotBinding = { mode: 'automatic' } | { mode: 'fixed'; provider_id: string; model: string };

export type AutoModelSlots = {
  planner: AutoModelSlotBinding;
  worker: AutoModelSlotBinding;
  utility: AutoModelSlotBinding;
};

/** Persisted user-level Auto settings (`configService` / client preferences). */
export type AutoModelSettings = {
  preference: AutoModelPreference;
  slots: AutoModelSlots;
};

/** Conversation.extra.auto_model — UI flag + last resolve metadata. */
export type AutoModelConversationExtra = {
  enabled: boolean;
  preference?: AutoModelPreference;
  /** Active phase used for the last concrete resolve (Phase 1 defaults to worker). */
  phase?: AutoModelPhase;
  last_resolved?: {
    provider_id: string;
    model: string;
    slot: AutoModelPhase;
  };
};

export type ResolveAutoModelInput = {
  phase: AutoModelPhase;
  settings: AutoModelSettings;
  providers: IProvider[];
  getAvailableModels: (provider: IProvider) => string[];
  requireVision?: boolean;
};

export type ResolveAutoModelResult = {
  model: TProviderWithModel;
  slot: AutoModelPhase;
  reason: string;
};
