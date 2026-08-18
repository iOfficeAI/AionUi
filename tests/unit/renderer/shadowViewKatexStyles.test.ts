/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { collectKatexCssRules } from '@renderer/components/Markdown/ShadowView';

/**
 * Build a minimal CSSStyleSheet-like stub. `collectKatexCssRules` only reads
 * `sheet.cssRules` and each `rule.cssText`, so a plain object is enough — and it
 * avoids the constructable-stylesheet / adoptedStyleSheets APIs that jsdom lacks.
 */
const sheet = (...cssTexts: string[]): CSSStyleSheet =>
  ({ cssRules: cssTexts.map((cssText) => ({ cssText })) as unknown as CSSRuleList }) as CSSStyleSheet;

// The accessibility-hide rule that KaTeX ships to keep the MathML annotation out
// of view; missing it is exactly what makes the formula render twice in chat.
const KATEX_MATHML_HIDE =
  '.katex .katex-mathml { position: absolute; clip: rect(1px, 1px, 1px, 1px); height: 1px; overflow: hidden; }';
const KATEX_FONT_FACE = '@font-face { font-family: KaTeX_Main; src: url(fonts/KaTeX_Main.woff2); }';
// A sheet that only *references* `.katex` (mirrors the preview `.aionui-markdown` theme).
const PARTIAL_THEME_RULE = '.aionui-markdown :where(.katex, .katex *) { line-height: normal; }';

describe('collectKatexCssRules', () => {
  it('includes the real KaTeX hide rule even when a partial theme sheet appears first', () => {
    // Regression: the old "first sheet mentioning .katex wins" logic grabbed the
    // partial theme sheet and dropped the essential .katex-mathml hide rule.
    const styleSheets = [
      sheet('.unrelated { color: red; }', PARTIAL_THEME_RULE),
      sheet(KATEX_MATHML_HIDE, KATEX_FONT_FACE),
    ];

    const rules = collectKatexCssRules(styleSheets);

    expect(rules).toContain(KATEX_MATHML_HIDE);
    expect(rules).toContain(KATEX_FONT_FACE);
    // The partial theme rule is katex-related too, so it is still collected.
    expect(rules).toContain(PARTIAL_THEME_RULE);
  });

  it('excludes rules that do not reference KaTeX', () => {
    const rules = collectKatexCssRules([sheet('.unrelated { color: red; }', KATEX_MATHML_HIDE)]);

    expect(rules).toEqual([KATEX_MATHML_HIDE]);
  });

  it('skips stylesheets whose cssRules throw (cross-origin) without losing later sheets', () => {
    const corsSheet = {
      get cssRules(): CSSRuleList {
        throw new DOMException('insecure operation', 'SecurityError');
      },
    } as CSSStyleSheet;

    const rules = collectKatexCssRules([corsSheet, sheet(KATEX_MATHML_HIDE)]);

    expect(rules).toEqual([KATEX_MATHML_HIDE]);
  });

  it('returns an empty array when no stylesheet mentions KaTeX', () => {
    const rules = collectKatexCssRules([sheet('.a { color: red; }'), sheet('.b { color: blue; }')]);

    expect(rules).toEqual([]);
  });
});
