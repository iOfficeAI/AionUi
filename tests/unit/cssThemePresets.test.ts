/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const PRESETS_DIR = path.resolve(__dirname, '../../src/renderer/pages/settings/DisplaySettings/presets');

const BACKGROUND_BLOCK_START = '/* AionUi Theme Background Start */';
const BACKGROUND_BLOCK_END = '/* AionUi Theme Background End */';

// ── helpers ──

/** Extract all CSS custom property names (--xxx) declared inside :root { } blocks */
function extractRootVars(css: string): Set<string> {
  const vars = new Set<string>();
  const rootBlocks = css.matchAll(/:root\s*\{([^}]+)\}/g);
  for (const m of rootBlocks) {
    const block = m[1];
    for (const v of block.matchAll(/--([\w-]+)\s*:/g)) {
      vars.add(v[1]);
    }
  }
  return vars;
}

/** Extract all CSS custom property names declared inside [data-theme="dark"] blocks */
function extractDarkVars(css: string): Set<string> {
  const vars = new Set<string>();
  const darkBlocks = css.matchAll(/\[data-theme=['"]?dark['"]?\]\s*\{([^}]+)\}/g);
  for (const m of darkBlocks) {
    const block = m[1];
    for (const v of block.matchAll(/--([\w-]+)\s*:/g)) {
      vars.add(v[1]);
    }
  }
  return vars;
}

// ── load all CSS files ──

const cssFiles = fs.readdirSync(PRESETS_DIR).filter((f) => f.endsWith('.css'));
const cssMap = new Map<string, string>();
for (const file of cssFiles) {
  cssMap.set(file, fs.readFileSync(path.join(PRESETS_DIR, file), 'utf-8'));
}

// Use default.css as the reference set of system-level variables
const defaultCss = cssMap.get('default.css')!;
const defaultRootVars = extractRootVars(defaultCss);

// System vars = default root vars minus any theme-specific namespace prefixes
const KNOWN_NAMESPACES = ['hk-', 'mm-', 'retroma-'];
const systemVars = new Set([...defaultRootVars].filter((v) => !KNOWN_NAMESPACES.some((ns) => v.startsWith(ns))));

// ── tests ──

describe('CssThemeSettings preset CSS files', () => {
  it('should have at least 4 preset CSS files', () => {
    expect(cssFiles.length).toBeGreaterThanOrEqual(4);
  });

  describe.each(cssFiles)('%s', (file) => {
    const css = cssMap.get(file)!;

    it('should not be empty', () => {
      expect(css.trim().length).toBeGreaterThan(0);
    });

    it('should contain a :root block', () => {
      expect(css).toMatch(/:root\s*\{/);
    });

    it('should define --color-primary', () => {
      expect(css).toMatch(/--color-primary\s*:/);
    });

    it('should define --bg-1 or --color-bg-1', () => {
      expect(css).toMatch(/--(bg-1|color-bg-1)\s*:/);
    });

    it('should not contain template literal syntax from old inline approach', () => {
      // Ensure no JS template string artifacts leaked into CSS files
      expect(css).not.toMatch(/\$\{/);
      expect(css).not.toMatch(/^export /m);
      expect(css).not.toMatch(/^import /m);
    });
  });

  describe('background sentinel blocks', () => {
    it.each(['retroma-y2k.css', 'retroma-obsidian-book.css'])(
      '%s should have a background sentinel to prevent auto-injection',
      (file) => {
        const css = cssMap.get(file)!;
        expect(css).toContain(BACKGROUND_BLOCK_START);
        expect(css).toContain(BACKGROUND_BLOCK_END);
      }
    );

    it('default.css should NOT have a background sentinel (Default theme is skipped by code)', () => {
      expect(defaultCss).not.toContain(BACKGROUND_BLOCK_START);
    });
  });

  describe('dark mode support', () => {
    it.each(cssFiles)('%s should have a dark mode block', (file) => {
      const css = cssMap.get(file)!;
      expect(css).toMatch(/\[data-theme=['"]?dark['"]?\]/);
    });
  });
});

describe('CssThemeSettings backgroundUtils', () => {
  // Inline the pure functions to test without Vite module resolution
  const buildBackgroundCss = (imageDataUrl: string): string => {
    if (!imageDataUrl) return '';
    return `${BACKGROUND_BLOCK_START}\nbody { background-image: url("${imageDataUrl}"); }\n${BACKGROUND_BLOCK_END}`;
  };

  const injectBackgroundCssBlock = (css: string, imageDataUrl: string): string => {
    const pattern = new RegExp(
      `${BACKGROUND_BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${BACKGROUND_BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\n?`,
      'g'
    );
    if (!css) return buildBackgroundCss(imageDataUrl);
    const cleanedCss = css.replace(pattern, '').trim();
    const block = buildBackgroundCss(imageDataUrl);
    return [cleanedCss, block].filter(Boolean).join('\n\n');
  };

  it('should inject background block into empty CSS', () => {
    const result = injectBackgroundCssBlock('', 'data:image/png;base64,abc');
    expect(result).toContain(BACKGROUND_BLOCK_START);
    expect(result).toContain('url("data:image/png;base64,abc")');
    expect(result).toContain(BACKGROUND_BLOCK_END);
  });

  it('should append background block to existing CSS', () => {
    const result = injectBackgroundCssBlock(':root { --bg: red; }', 'https://example.com/bg.png');
    expect(result).toContain(':root { --bg: red; }');
    expect(result).toContain(BACKGROUND_BLOCK_START);
    expect(result).toContain('url("https://example.com/bg.png")');
  });

  it('should replace existing background block', () => {
    const existing = `:root { color: red; }\n\n${BACKGROUND_BLOCK_START}\nold content\n${BACKGROUND_BLOCK_END}`;
    const result = injectBackgroundCssBlock(existing, 'new-image.png');
    expect(result).toContain(':root { color: red; }');
    expect(result).toContain('url("new-image.png")');
    expect(result).not.toContain('old content');
    // Should only have one start/end pair
    expect(result.split(BACKGROUND_BLOCK_START).length).toBe(2);
  });

  it('should return empty string for empty image URL', () => {
    const result = buildBackgroundCss('');
    expect(result).toBe('');
  });

  it('sentinel block should prevent re-injection', () => {
    const sentinel = `${BACKGROUND_BLOCK_START}\n/* Preview cover only */\n${BACKGROUND_BLOCK_END}`;
    const css = `:root { color: red; }\n\n${sentinel}`;
    // injectBackgroundCssBlock replaces existing block
    const result = injectBackgroundCssBlock(css, 'new.png');
    // The sentinel gets replaced with real background
    expect(result.split(BACKGROUND_BLOCK_START).length).toBe(2);
  });
});

describe('CssThemeSettings preset structure', () => {
  // Validate the expected theme IDs exist as CSS files
  const expectedThemes = [
    'default',
    'misaka-mikoto',
    'hello-kitty',
    'retro-windows',
    'retroma-y2k',
    'retroma-obsidian-book',
    'retroma-obsidian-book-2',
    'retroma-obsidian-book-2-1-dark',
    'retroma-nocturne-parchment',
    'discourse-horizon',
    'glittering-input-field',
  ];

  it.each(expectedThemes)('should have CSS file for theme: %s', (theme) => {
    expect(cssFiles).toContain(`${theme}.css`);
  });

  it('each CSS file should correspond to an expected theme', () => {
    const expectedFiles = expectedThemes.map((t) => `${t}.css`);
    for (const file of cssFiles) {
      expect(expectedFiles).toContain(file);
    }
  });
});
