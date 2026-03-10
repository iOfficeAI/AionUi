/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const isZhLocale = (language?: string): boolean => {
  return (language || '').toLowerCase().startsWith('zh');
};

export const isDefaultModel = (value?: string | null, label?: string | null): boolean => {
  const text = `${value || ''} ${label || ''}`.toLowerCase();
  return text.includes('default') || text.includes('recommended') || text.includes('默认');
};

export const buildDefaultModelLabel = (isZh: boolean, defaultText: string, modelText: string): string => {
  return isZh ? `${defaultText}${modelText}` : `${defaultText} ${modelText}`;
};

export const getModelDisplayLabel = ({ selectedValue, selectedLabel, defaultModelLabel, fallbackLabel }: { selectedValue?: string | null; selectedLabel?: string | null; defaultModelLabel: string; fallbackLabel: string }): string => {
  if (!selectedLabel) return fallbackLabel;
  return isDefaultModel(selectedValue, selectedLabel) ? defaultModelLabel : selectedLabel;
};

export const formatModeDisplayLabel = (modeValue: string, modeLabel: string, isZh: boolean): string => {
  if (!isZh) return modeLabel;
  const map: Record<string, string> = {
    default: '默认',
    plan: '计划',
    yolo: '自动执行',
    bypassPermissions: '自动执行',
    autoEdit: '自动编辑',
    build: '构建',
    smart: '智能',
    'full auto': '全自动',
    'auto edit': '自动编辑',
    'auto-accept edits': '自动批准',
  };
  return map[modeValue] || map[modeLabel.toLowerCase()] || modeLabel;
};
