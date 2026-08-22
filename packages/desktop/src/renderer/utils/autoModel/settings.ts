/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { AUTO_MODEL_CONFIG_KEY, defaultAutoModelSettings } from './constants';
import type { AutoModelSettings, AutoModelSlotBinding, AutoModelSlots } from './types';

const isSlotBinding = (value: unknown): value is AutoModelSlotBinding => {
  if (!value || typeof value !== 'object') return false;
  const mode = (value as { mode?: unknown }).mode;
  if (mode === 'automatic') return true;
  if (mode !== 'fixed') return false;
  const fixed = value as { provider_id?: unknown; model?: unknown };
  return typeof fixed.provider_id === 'string' && typeof fixed.model === 'string';
};

const normalizeSlots = (raw: unknown): AutoModelSlots => {
  const defaults = defaultAutoModelSettings().slots;
  if (!raw || typeof raw !== 'object') return defaults;
  const slots = raw as Partial<Record<keyof AutoModelSlots, unknown>>;
  return {
    planner: isSlotBinding(slots.planner) ? slots.planner : defaults.planner,
    worker: isSlotBinding(slots.worker) ? slots.worker : defaults.worker,
    utility: isSlotBinding(slots.utility) ? slots.utility : defaults.utility,
  };
};

export const normalizeAutoModelSettings = (raw: unknown): AutoModelSettings => {
  const defaults = defaultAutoModelSettings();
  if (!raw || typeof raw !== 'object') return defaults;
  const value = raw as Partial<AutoModelSettings>;
  const preference =
    value.preference === 'cost' || value.preference === 'balance' || value.preference === 'quality'
      ? value.preference
      : defaults.preference;
  return {
    preference,
    slots: normalizeSlots(value.slots),
  };
};

export const readAutoModelSettings = (): AutoModelSettings => {
  return normalizeAutoModelSettings(configService.get(AUTO_MODEL_CONFIG_KEY));
};

export const writeAutoModelSettings = async (settings: AutoModelSettings): Promise<void> => {
  await configService.set(AUTO_MODEL_CONFIG_KEY, normalizeAutoModelSettings(settings));
};
