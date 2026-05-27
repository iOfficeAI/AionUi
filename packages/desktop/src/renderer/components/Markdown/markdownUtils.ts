/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';

import { diffColors } from '@/renderer/styles/colors';

/**
 * Format raw code string, attempting JSON pretty-print.
 * Falls back to stripped trailing newline if parsing fails.
 */
export const formatCode = (code: string): string => {
  const content = String(code).replace(/\n$/, '');
  try {
    return JSON.stringify(
      JSON.parse(content),
      (_key, value) => {
        return value;
      },
      2
    );
  } catch (_error) {
    return content;
  }
};

/**
 * Conditional render helper — returns trueComponent when condition is true,
 * falseComponent otherwise.
 */
export const logicRender = <T, F>(condition: boolean, trueComponent: T, falseComponent?: F): T | F => {
  return condition ? trueComponent : (falseComponent as F);
};

/**
 * Get line background style for diff rendering.
 * Highlights additions (green), deletions (red), and hunk headers (blue).
 */
export const getDiffLineStyle = (line: string, isDark: boolean): React.CSSProperties => {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return {
      backgroundColor: isDark ? diffColors.additionBgDark : diffColors.additionBgLight,
      borderLeft: '3px solid #b8bb26',
    };
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return {
      backgroundColor: isDark ? diffColors.deletionBgDark : diffColors.deletionBgLight,
      borderLeft: '3px solid #fb4934',
    };
  }
  if (line.startsWith('@@')) {
    return {
      backgroundColor: isDark ? diffColors.hunkBgDark : diffColors.hunkBgLight,
      borderLeft: '3px solid #83a598',
    };
  }
  return {};
};
