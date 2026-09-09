/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AutoModelSettings, AutoModelSlotBinding, AutoModelSlots } from './types';

export const AUTO_MODEL_CONFIG_KEY = 'autoModel' as const;

export const AUTO_MODEL_COMPOSITE_ID = '__aionui_auto__::auto';

export const defaultSlotBinding = (): AutoModelSlotBinding => ({ mode: 'automatic' });

export const defaultAutoModelSlots = (): AutoModelSlots => ({
  planner: defaultSlotBinding(),
  worker: defaultSlotBinding(),
  utility: defaultSlotBinding(),
});

export const defaultAutoModelSettings = (): AutoModelSettings => ({
  preference: 'balance',
  slots: defaultAutoModelSlots(),
});

/** Composite id used in model pickers for the Auto row. */
export const isAutoCompositeId = (id: string | null | undefined): boolean => id === AUTO_MODEL_COMPOSITE_ID;
