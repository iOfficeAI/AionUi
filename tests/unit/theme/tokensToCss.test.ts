/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { tokensToCss } from '@/renderer/utils/theme/tokensToCss';

describe('tokensToCss', () => {
  it('returns null for undefined or empty tokens', () => {
    expect(tokensToCss(undefined)).toBeNull();
    expect(tokensToCss({})).toBeNull();
    expect(tokensToCss({ root: {}, light: {}, dark: {} })).toBeNull();
  });

  it('treats a flat token map as :root overrides', () => {
    const css = tokensToCss({ '--primary': '#0a7ea4' });
    expect(css).toBe(':root {\n  --primary: #0a7ea4;\n}');
  });

  it('scopes light/dark layers with :root[data-theme] specificity', () => {
    const css = tokensToCss({
      light: { '--primary': '#0a7ea4' },
      dark: { '--primary': '#38bdf8' },
    });
    expect(css).toBe(
      ":root[data-theme='light'] {\n  --primary: #0a7ea4;\n}\n:root[data-theme='dark'] {\n  --primary: #38bdf8;\n}"
    );
  });

  it('emits root, light and dark blocks together in order', () => {
    const css = tokensToCss({
      root: { '--brand': '#0a7ea4' },
      light: { '--primary': '#0a7ea4' },
      dark: { '--primary': '#38bdf8' },
    });
    expect(css).toBe(
      ":root {\n  --brand: #0a7ea4;\n}\n:root[data-theme='light'] {\n  --primary: #0a7ea4;\n}\n:root[data-theme='dark'] {\n  --primary: #38bdf8;\n}"
    );
  });

  it('drops keys that are not part of the token contract', () => {
    const css = tokensToCss({
      root: { '--primary': '#0a7ea4', '--not-a-real-token': 'red' },
    });
    expect(css).toBe(':root {\n  --primary: #0a7ea4;\n}');
  });

  it('returns null when every key is outside the contract', () => {
    expect(tokensToCss({ root: { '--nope': 'red' } })).toBeNull();
  });
});
