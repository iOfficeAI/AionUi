/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Legacy Japanese fonts whose JIS-derived glyph tables draw U+005C (backslash)
// as a yen sign on Windows. Built-in skin presets must never reference them,
// otherwise pasted Windows paths render their separators as "¥".
const YEN_GLYPH_FONTS = [
  'Meiryo',
  'Yu Gothic',
  'Hiragino Kaku Gothic',
  'MS Gothic',
  'MS PGothic',
  'MS UI Gothic',
  'MS Mincho',
  'Yu Mincho',
];

const PRESETS_DIR = resolve(
  __dirname,
  '../../../packages/desktop/src/renderer/pages/settings/AppearanceSettings/presets'
);

describe('appearance preset font guard', () => {
  const cssFiles = readdirSync(PRESETS_DIR).filter((name) => name.endsWith('.css'));

  it('collects the built-in preset css files', () => {
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  it.each(cssFiles)('%s does not reference yen-glyph legacy Japanese fonts', (file) => {
    const content = readFileSync(resolve(PRESETS_DIR, file), 'utf8').toLowerCase();
    for (const font of YEN_GLYPH_FONTS) {
      expect(content, `preset "${file}" must not reference font "${font}"`).not.toContain(font.toLowerCase());
    }
  });
});
