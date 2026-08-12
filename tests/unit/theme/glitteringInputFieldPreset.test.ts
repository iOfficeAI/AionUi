/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'postcss';
import { describe, expect, it } from 'vitest';

const PRESET_PATH = resolve(
  __dirname,
  '../../../packages/desktop/src/renderer/pages/settings/AppearanceSettings/presets/glittering-input-field.css'
);
const presetCss = readFileSync(PRESET_PATH, 'utf8');

const SHADOW_MARKDOWN_SCOPE =
  /\.markdown-shadow-body(?![\w-])|\[\s*class\s*\*=\s*(?:['"]markdown['"]|markdown)\s*(?:[is]\s*)?\]/i;
const CHIP_TOKEN = /var\(--hl-chip-(?:bg|text|border)\)/;

const shadowMarkdownChipSelectors: string[] = [];
const auroraFocusDeclarations = new Map<string, string>();
parse(presetCss).walkRules((rule) => {
  const appliesChipStyle = rule.nodes.some((node) => node.type === 'decl' && CHIP_TOKEN.test(node.value));
  for (const selector of rule.selectors) {
    if (appliesChipStyle && SHADOW_MARKDOWN_SCOPE.test(selector)) {
      shadowMarkdownChipSelectors.push(selector);
    }
  }
  if (rule.selectors.includes('.guidContainer .guidInputCard:focus-within')) {
    rule.walkDecls((declaration) => auroraFocusDeclarations.set(declaration.prop, declaration.value));
  }
});

describe('glittering input field preset markdown isolation', () => {
  it('does not apply chip styles to ShadowView inline content or its descendants', () => {
    expect(shadowMarkdownChipSelectors).toEqual([]);
  });

  it('keeps the aurora gradient and glow on the focused input field', () => {
    expect(auroraFocusDeclarations.get('background-image')).toContain('var(--retroma-aurora-input-gradient)');
    expect(auroraFocusDeclarations.get('box-shadow')).toContain('var(--retroma-aurora-input-shadow)');
  });

  it('keeps both focus animations on the input field', () => {
    expect(auroraFocusDeclarations.get('animation')).toMatch(/\belegantFlow\b/);
    expect(auroraFocusDeclarations.get('animation')).toMatch(/\bsoftGlow\b/);
  });
});
