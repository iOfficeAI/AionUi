/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const isDefaultModel = (value?: string | null, label?: string | null): boolean => {
  const text = `${value || ''} ${label || ''}`.toLowerCase();
  return text.includes('default') || text.includes('recommended') || text.includes('默认');
};

export const getModelDisplayLabel = ({ selectedValue, selectedLabel, defaultModelLabel, fallbackLabel }: { selectedValue?: string | null; selectedLabel?: string | null; defaultModelLabel: string; fallbackLabel: string }): string => {
  if (!selectedLabel) return fallbackLabel;
  return isDefaultModel(selectedValue, selectedLabel) ? defaultModelLabel : selectedLabel;
};
