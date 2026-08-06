/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Guards the SCM status-letter colours at the layer that actually matters: **the
 * CSS UnoCSS generates**, not the class strings the component emits.
 *
 * Why this file exists separately from `scmPanelActions.dom.test.tsx`: that suite
 * asserts the component puts different classes on `deleted` vs `conflicted`, which
 * is necessary but **not sufficient** — two different class names can both resolve
 * to nothing. A class that UnoCSS never emits a rule for, or one whose CSS variable
 * is undefined, renders as inherited text with no error anywhere. The DOM suite
 * would stay green while the badges were visually identical.
 *
 * jsdom cannot close that gap: the dom test environment loads no stylesheets at
 * all (`tests/vitest.dom.setup.ts` imports no CSS), so `getComputedStyle` there
 * returns empty for *every* class and would "pass" regardless. Running the real
 * generator is the cheapest way to assert the rules exist without a browser.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createGenerator } from 'unocss';
import { beforeAll, describe, expect, it } from 'vitest';

import unoConfig from '../../../uno.config';

/** Classes used by the SCM row: the `BADGE_CLASS` map + the filename colour. */
const BADGE_CLASSES = [
  'text-success', // created + renamed
  'text-warning', // modified
  'text-danger', // deleted (and conflicted/failed filename)
  'text-t-tertiary', // unknown
  'text-t-primary', // ordinary filename — must follow the theme, not inherit
  // conflicted — a filled chip, deliberately structural rather than another shade
  'bg-danger-light-1',
  'border-danger-4',
  'text-danger-6',
];

let css = '';

beforeAll(async () => {
  const uno = await createGenerator(unoConfig);
  const generated = await uno.generate(BADGE_CLASSES.join(' '), { preflights: false });
  css = generated.css;
});

/** The declaration UnoCSS emitted for one class, or undefined if it emitted none. */
const ruleFor = (cls: string): string | undefined => {
  const escaped = cls.replaceAll('-', '\\-');
  const match = css.match(new RegExp(`\\.${escaped.replaceAll('\\-', '-')}\\{([^}]+)\\}`));
  return match?.[1];
};

describe('every badge class actually produces a CSS rule', () => {
  it.each(BADGE_CLASSES)('%s emits a declaration', (cls) => {
    // A missing rule is the failure mode the DOM suite cannot see: the component
    // still renders the class name, the browser ignores it, and the badge silently
    // inherits the surrounding text colour.
    expect(ruleFor(cls), `UnoCSS emitted no rule for .${cls}`).toBeTruthy();
  });

  it('routes the three A/M/D colours through theme variables, never a literal hex', () => {
    // The point of using tokens is that light and dark each get their own value
    // (`styles/themes/default-color-scheme.css`). A hex here would satisfy the DOM
    // assertions and then be wrong in one of the two themes.
    expect(ruleFor('text-success')).toBe('color:var(--success);');
    expect(ruleFor('text-warning')).toBe('color:var(--warning);');
    expect(ruleFor('text-danger')).toBe('color:var(--danger);');
    for (const cls of ['text-success', 'text-warning', 'text-danger']) {
      expect(ruleFor(cls)).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it('routes the ordinary filename through --text-primary, which flips per theme', () => {
    // The dark-mode bug this guards: a filename with no colour class inherited a
    // value that does not follow the theme (real-browser check: it stayed rgb(0,0,0)
    // under the dark scheme). `--text-primary` is #000 light / #fff dark, so the token
    // is what makes the name legible in both.
    //
    // Two halves make the title true, not just plausible:
    //  1. the class resolves to the token (not a literal hex), so it can follow theme;
    expect(ruleFor('text-t-primary')).toBe('color:var(--text-primary);');
    expect(ruleFor('text-t-primary')).not.toMatch(/#[0-9a-f]{3,8}/i);

    //  2. the token itself actually flips: #000 under the light selector, #fff under
    //     the dark one. Without this the token could be defined once (no flip) and the
    //     name would be legible in one theme only — the exact bug, one level down.
    const scheme = readFileSync(
      path.join(__dirname, '../../../packages/desktop/src/renderer/styles/themes/default-color-scheme.css'),
      'utf8'
    );
    const darkAt = scheme.indexOf("[data-color-scheme='default'][data-theme='dark']");
    expect(darkAt, 'dark theme selector must exist').toBeGreaterThan(-1);
    const light = scheme.slice(0, darkAt); // everything before the dark block = the :root/light scope
    const dark = scheme.slice(darkAt);
    expect(light).toMatch(/--text-primary:\s*#000000/i); // light → black
    expect(dark).toMatch(/--text-primary:\s*#ffffff/i); //  dark  → white
  });

  it('resolves the conflicted chip variables down to real RGB components', () => {
    // `border-danger-4` compiles to `rgb(var(--danger-4))`. If `--danger-4` were
    // undefined — or defined as a colour rather than bare `R,G,B` components — the
    // whole declaration would be invalid and the border would simply not paint.
    // So follow the chain in Arco's stylesheet to its end and require numbers.
    const arco = readFileSync(
      path.join(__dirname, '../../../node_modules/@arco-design/web-react/dist/css/arco.css'),
      'utf8'
    );
    const define = (name: string): string | undefined => arco.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
    const resolve = (expr: string | undefined, depth = 0): string | undefined => {
      if (!expr || depth > 6) return expr;
      const ref = expr.match(/var\(--([a-z0-9-]+)\)/i);
      return ref ? resolve(expr.replace(ref[0], define(ref[1]) ?? 'UNDEFINED'), depth + 1) : expr;
    };

    expect(ruleFor('border-danger-4')).toBe('border-color:rgb(var(--danger-4));');
    expect(ruleFor('text-danger-6')).toBe('color:rgb(var(--danger-6));');
    // Bare `R,G,B` — that is what makes `rgb(var(…))` legal.
    expect(resolve(define('danger-4'))).toMatch(/^\d+\s*,\s*\d+\s*,\s*\d+$/);
    expect(resolve(define('danger-6'))).toMatch(/^\d+\s*,\s*\d+\s*,\s*\d+$/);
  });

  /**
   * ⚠️ **This test guards a property that is NOT SCM-specific — do not move or delete
   * it as part of an SCM refactor without relocating it first.**
   *
   * It happens to live in the SCM suite because the conflicted chip is what led us to
   * discover the coupling, but what it actually protects is app-wide: **every** class
   * built on Arco's colour scale (`text-danger-6`, `border-success-4`, `bg-warning-1`,
   * … — used by `CronStatusTag` and others) depends on the same two attributes being
   * written together. At the time of writing this is the only test anywhere that
   * asserts that pairing.
   *
   * So the position of this test is not arbitrary either: if an SCM cleanup decides
   * "this has nothing to do with SCM" and drops it, the coupling becomes unguarded
   * app-wide — and its failure mode is silent (see below). The right move is to
   * relocate it next to `applyTheme`'s own tests, not to remove it.
   */
  it('resolves the conflicted chip under BOTH theme selectors, not just the light one', () => {
    // Verified against a real Chromium (Electron) via `getComputedStyle`, which is what
    // exposed the subtlety this test now locks in:
    //
    //   light:  bg rgb(255,236,232)        border rgb(249,137,129)   ← Arco `body` block
    //   dark:   bg rgba(247,105,101,.2)    border rgb(203,46,52)     ← `body[arco-theme='dark']`
    //
    // The two scales live under DIFFERENT selectors than our own tokens: our
    // `--success/--warning/--danger` switch on `html[data-theme='dark']`
    // (`styles/themes/default-color-scheme.css`), while Arco's `--danger-N` scale
    // switches on `body[arco-theme='dark']`. Both are set together by `applyTheme`
    // (it writes `data-theme` on documentElement AND `arco-theme` on body), so the
    // chip does follow the theme — but ONLY because that second attribute is set.
    //
    // If someone ever drops the `arco-theme` write, A/M/D would still flip to their
    // dark values while this chip silently kept its light-pink background on a dark
    // panel. Hence this assertion is on the pairing, not on one selector.
    const arco = readFileSync(
      path.join(__dirname, '../../../node_modules/@arco-design/web-react/dist/css/arco.css'),
      'utf8'
    );
    // Arco defines the scale twice: once under `body`, once under `body[arco-theme='dark']`.
    const occurrences = (name: string): number => arco.match(new RegExp(`--${name}:`, 'g'))?.length ?? 0;
    expect(occurrences('danger-4'), 'Arco must define --danger-4 for light AND dark').toBeGreaterThanOrEqual(2);
    expect(occurrences('danger-6')).toBeGreaterThanOrEqual(2);
    expect(arco).toContain("body[arco-theme='dark']");

    // …and the app must actually set that attribute, or the dark scale never applies.
    //
    // ⚠️ Note the asymmetry in `applyTheme`: `data-theme` is written on
    // `root.documentElement` unguarded, while `arco-theme` is written on `root.body?.`
    // — **optional-chained**. So the second write can silently no-op (a `root` whose
    // body is not ready yet, or a Document without one; the signature accepts a custom
    // `root`) while the first succeeds. The result needs nobody to delete any code:
    // our own tokens flip to dark, Arco's scale stays light, and the chip renders a
    // pale-pink background on a dark panel with no error anywhere.
    //
    // This assertion cannot catch that runtime case — it only pins that both writes
    // exist in the source. It is the cheapest guard available from a unit test; the
    // runtime half belongs in a real-browser check (see `pr5-live-plan.md`).
    const applyTheme = readFileSync(
      path.join(__dirname, '../../../packages/desktop/src/renderer/utils/theme/applyTheme.ts'),
      'utf8'
    );
    expect(applyTheme).toContain("setAttribute('arco-theme'");
    expect(applyTheme).toContain("setAttribute('data-theme'");
  });

  it('gives the conflicted chip a different painted result from deleted, not just a different class', () => {
    // The reverse assertion in the DOM suite compares class strings. This one
    // compares what those classes actually paint: `deleted` sets only a colour,
    // while `conflicted` also sets a background and a border. Two classes that
    // both emitted nothing would pass there and fail here.
    const deletedDecls = [ruleFor('text-danger')].filter(Boolean).join(' ');
    const conflictedDecls = ['bg-danger-light-1', 'border-danger-4', 'text-danger-6']
      .map(ruleFor)
      .filter(Boolean)
      .join(' ');

    expect(conflictedDecls).not.toBe(deletedDecls);
    expect(conflictedDecls).toContain('background-color');
    expect(conflictedDecls).toContain('border-color');
    expect(deletedDecls).not.toContain('background-color');
  });
});
