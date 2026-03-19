/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Theme color configuration based on Figma design tokens
 * This file provides TypeScript types and helper functions for the color system
 *
 * Usage:
 * - CSS: use CSS variables directly: var(--color-bg-0)
 * - UnoCSS: use atomic classes: bg-bg-0, text-text, border-border
 * - TypeScript: use this file for type safety and constants
 */

/**
 * CSS variable names for all theme colors
 */
export const cssVars = {
  // AOU colors
  aou: {
    1: '--color-aou-1',
    2: {
      disabled: '--color-aou-2-disabled',
    },
    3: {
      specialDisabled: '--color-aou-3-special-disabled',
    },
    4: {
      hover: '--color-aou-4-hover',
    },
    5: '--color-aou-5',
    6: {
      brand: '--color-aou-6-brand',
    },
    7: '--color-aou-7',
    8: {
      selected: '--color-aou-8-selected',
    },
    9: '--color-aou-9',
    10: '--color-aou-10',
  },
  // Background colors
  bg: {
    0: '--color-bg-0',
    1: '--color-bg-1',
    2: '--color-bg-2',
    3: '--color-bg-3',
    4: '--color-bg-4',
    5: '--color-bg-5',
    6: '--color-bg-6',
    8: '--color-bg-8',
    9: '--color-bg-9',
    10: '--color-bg-10',
  },
  // Semantic colors
  text: '--color-text',
  primary: '--color-primary',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  fill: '--color-fill',
  border: '--color-border',
  // Brand colors
  brand: {
    fill: '--color-brand-fill',
    bg: '--color-brand-bg',
  },
  // Special colors
  whiteToBlack: '--color-white-to-black',
  // Gray scale
  gray: {
    0: '--color-gray-0',
    1: '--color-gray-1',
    2: '--color-gray-2',
    3: '--color-gray-3',
    4: '--color-gray-4',
  },
} as const;

/**
 * Helper function to get CSS variable value
 * @param varName - CSS variable name (with or without --)
 * @returns The computed color value
 */
export const getCSSVar = (varName: string): string => {
  const name = varName.startsWith('--') ? varName : `--${varName}`;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

/**
 * Helper function to create inline style with CSS variable
 * @param property - CSS property name
 * @param varName - CSS variable name
 * @returns Style object
 */
export const cssVar = (property: string, varName: string) => ({
  [property]: `var(${varName})`,
});

/**
 * Common icon colors as CSS variable strings for use in fill/stroke props
 */
export const iconColors = {
  primary: 'var(--text-primary)',
  secondary: 'var(--text-secondary)',
  disabled: 'var(--text-disabled)',
  brand: 'var(--brand)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  success: 'var(--success)',
} as const;

/**
 * Diff/change colors for file change indicators
 * Used in FileChangesPanel, Markdown diff highlighting, etc.
 */
export const diffColors = {
  /** Green for additions / insertions */
  addition: '#52c41a',
  /** Red for deletions / removals */
  deletion: '#ff4d4f',
  /** Addition background (dark mode) */
  additionBgDark: 'rgba(46,160,67,0.15)',
  /** Addition background (light mode) */
  additionBgLight: '#e6ffec',
  /** Deletion background (dark mode) */
  deletionBgDark: 'rgba(248,81,73,0.15)',
  /** Deletion background (light mode) */
  deletionBgLight: '#ffebe9',
  /** Hunk header background (dark mode) */
  hunkBgDark: 'rgba(56,139,253,0.15)',
  /** Hunk header background (light mode) */
  hunkBgLight: '#ddf4ff',
} as const;

/**
 * Color mapping reference for migration
 * Maps common hex values to their theme variable names
 */
export const colorMapping: Record<string, string> = {
  // AOU colors
  '#EFF0F6': 'var(--color-aou-1)',
  '#eff0f6': 'var(--color-aou-1)',
  '#E5E7F0': 'var(--color-aou-2-disabled)',
  '#e5e7f0': 'var(--color-aou-2-disabled)',
  '#7583B2': 'var(--color-aou-6-brand)',
  '#7583b2': 'var(--color-aou-6-brand)',

  // Background colors
  '#FFFFFF': 'var(--color-bg-0)',
  '#ffffff': 'var(--color-bg-0)',
  '#F7F8FA': 'var(--color-bg-1)',
  '#f7f8fa': 'var(--color-bg-1)',
  '#F2F3F5': 'var(--color-bg-2)',
  '#f2f3f5': 'var(--color-bg-2)',
  '#E5E6EB': 'var(--color-bg-3)',
  '#e5e6eb': 'var(--color-bg-3)',
  '#86909C': 'var(--color-bg-6)',
  '#86909c': 'var(--color-bg-6)',
  '#1D2129': 'var(--color-bg-9)',
  '#1d2129': 'var(--color-bg-9)',

  // Semantic colors
  '#165DFF': 'var(--color-primary)',
  '#165dff': 'var(--color-primary)',
};
