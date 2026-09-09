/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import JSON5 from 'json5';

/**
 * Strips JS variable assignment wrappers (e.g. `option = {...};` or `const option = {...}; export default option;`)
 */
export const stripEChartsAssignment = (raw: string): string => {
  let text = raw.trim();

  // Remove leading/trailing markdown code fence markers if passed
  text = text.replace(/^```(?:echarts?|chart)?\s*/i, '').replace(/\s*```$/, '');

  // Strip leading comments or export/variable assignment prefixes
  // e.g. // some comments \n const option = { ... }
  text = text.replace(/^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/\s*)*(?:const|let|var)?\s*\w+\s*=\s*/m, '');

  // Strip trailing export statements or semicolons
  text = text.replace(/export\s+default\s+\w+\s*;?$/, '');
  text = text.trim().replace(/;+$/, '');

  return text;
};

/**
 * Checks whether the parsed object resembles an ECharts configuration.
 */
export const isEChartsOptionObject = (obj: unknown): obj is Record<string, unknown> => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }

  const chartKeys = [
    'series',
    'xAxis',
    'yAxis',
    'dataset',
    'options',
    'geo',
    'radar',
    'polar',
    'angleAxis',
    'radiusAxis',
    'grid',
    'timeline',
    'title',
    'legend',
    'tooltip',
  ];

  return chartKeys.some((k) => k in (obj as Record<string, unknown>));
};

/**
 * Safely parses ECharts configuration string using JSON5 (with fallback).
 */
export const parseEChartsOption = (code: string): Record<string, unknown> | null => {
  if (!code || typeof code !== 'string') return null;

  const cleaned = stripEChartsAssignment(code);

  try {
    const parsed = JSON5.parse(cleaned);
    if (isEChartsOptionObject(parsed)) {
      return parsed;
    }
  } catch {
    // If strict JSON5 fails, try to extract first object literal or evaluate safely
    try {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const objectSubstring = cleaned.slice(firstBrace, lastBrace + 1);
        try {
          const parsedSub = JSON5.parse(objectSubstring);
          if (isEChartsOptionObject(parsedSub)) {
            return parsedSub;
          }
        } catch {
          const fn = new Function(`"use strict"; return (${objectSubstring});`);
          const evaluated = fn();
          if (isEChartsOptionObject(evaluated)) {
            return evaluated;
          }
        }
      }
    } catch {
      return null;
    }
  }

  return null;
};
