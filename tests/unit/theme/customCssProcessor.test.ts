/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'postcss';
import { describe, expect, it } from 'vitest';
import { addImportantToAll, processCustomCss } from '@/renderer/utils/theme/customCssProcessor';

const presetDir = path.resolve(
  process.cwd(),
  'packages/desktop/src/renderer/pages/settings/AppearanceSettings/presets'
);

const presetFiles = fs.readdirSync(presetDir).filter((f) => f.endsWith('.css'));

/** Collect every rule selector in declaration order. */
const selectorsOf = (css: string): string[] => {
  const out: string[] = [];
  parse(css).walkRules((rule) => out.push(rule.selector));
  return out;
};

/** Collect `${prop}:${important}` for every declaration, in order. */
const declImportanceOf = (css: string): string[] => {
  const out: string[] = [];
  parse(css).walkDecls((decl) => out.push(`${decl.prop}:${decl.important === true}`));
  return out;
};

describe('addImportantToAll', () => {
  it('returns empty string for empty / whitespace input', () => {
    expect(addImportantToAll('')).toBe('');
    expect(addImportantToAll('   \n\t ')).toBe('');
  });

  it('adds !important to a simple declaration', () => {
    const out = addImportantToAll('.a { color: red; }');
    expect(out).toContain('color: red !important');
  });

  it('preserves pseudo-class selectors and does not treat them as declarations', () => {
    const out = addImportantToAll('.btn:hover { color: red; }');
    // Selector must survive intact (the old regex corrupted `:hover`).
    expect(selectorsOf(out)).toEqual(['.btn:hover']);
    expect(out).toContain('color: red !important');
    // Guard against the old-regex failure: no bogus `.btn: hover ...` declaration.
    expect(declImportanceOf(out)).toEqual(['color:true']);
  });

  it('preserves pseudo-element and complex selectors', () => {
    const cases = [
      '::before { content: "x"; }',
      '.y::before { content: "x"; }',
      ':not(.f) { padding: 1px; }',
      '::-webkit-scrollbar-thumb:hover { background: blue; }',
      'a:hover::after { color: red; }',
    ];
    for (const css of cases) {
      const original = selectorsOf(css);
      const processed = selectorsOf(addImportantToAll(css));
      expect(processed).toEqual(original);
    }
  });

  it('adds !important to the last declaration even without a trailing semicolon', () => {
    const out = addImportantToAll('.a { color: red; margin: 0 }');
    expect(declImportanceOf(out)).toEqual(['color:true', 'margin:true']);
  });

  it('does not double up an already-!important declaration', () => {
    const out = addImportantToAll('.b { color: red !important; }');
    expect(out).toContain('color: red !important');
    expect(out).not.toContain('!important !important');
  });

  it('recurses into @media / nested at-rules and keeps their selectors', () => {
    const out = addImportantToAll('@media (max-width: 600px) { .c:hover { display: none } }');
    expect(selectorsOf(out)).toEqual(['.c:hover']);
    expect(declImportanceOf(out)).toEqual(['display:true']);
  });

  it('handles values containing colons and semicolons (url(), quoted strings)', () => {
    const out = addImportantToAll('.d::before { content: "a; b: c"; background: url(http://x/y.png); }');
    expect(selectorsOf(out)).toEqual(['.d::before']);
    expect(declImportanceOf(out)).toEqual(['content:true', 'background:true']);
    expect(out).toContain('url(http://x/y.png) !important');
  });

  it('returns input unchanged when CSS is unparseable (no throw)', () => {
    const broken = '.a { color: red; '; // unterminated block + string-free but invalid
    // Must not throw; result is a string (either processed or the original fallback).
    expect(() => addImportantToAll(broken)).not.toThrow();
    expect(typeof addImportantToAll(broken)).toBe('string');
  });
});

describe('addImportantToAll — real preset regression guard (F1)', () => {
  it('found preset css files to test', () => {
    expect(presetFiles.length).toBeGreaterThan(0);
  });

  for (const file of presetFiles) {
    it(`does not corrupt any selector in ${file} and marks every declaration !important`, () => {
      const css = fs.readFileSync(path.join(presetDir, file), 'utf8');
      const processed = addImportantToAll(css);

      // 1. Output must still be valid CSS (re-parses without throwing).
      expect(() => parse(processed)).not.toThrow();

      // 2. Selectors must be byte-identical before and after — the direct F1 guard.
      expect(selectorsOf(processed)).toEqual(selectorsOf(css));

      // 3. Every declaration must be !important in the output.
      const notImportant = declImportanceOf(processed).filter((d) => d.endsWith(':false'));
      expect(notImportant).toEqual([]);
    });
  }
});

describe('processCustomCss', () => {
  it('wraps processed css with the explanatory comment and keeps !important', () => {
    const out = processCustomCss('.a:hover { color: red; }');
    expect(out).toContain('User Custom Styles');
    expect(out).toContain('.a:hover');
    expect(out).toContain('color: red !important');
  });

  it('returns empty string for empty input', () => {
    expect(processCustomCss('')).toBe('');
  });
});
