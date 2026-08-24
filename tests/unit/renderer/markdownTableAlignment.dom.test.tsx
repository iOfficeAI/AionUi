/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression: markdown tables rendered with a centred header row above
 * start-aligned body rows.
 *
 * Neither markdown surface declared `text-align` on `th`, so the UA default
 * (`th { text-align: center }`) applied to the header while `td` fell through to
 * `start`. Every table written without GFM alignment markers — `|---|---|` — came
 * out visually inconsistent.
 *
 * The fix adds `text-align: start` to `th` on both surfaces. It is only safe
 * because remark-gfm emits explicit alignment as an **inline style**, which
 * outranks any stylesheet rule; this file pins both halves of that argument:
 *   1. the `text-align: start` default exists on the chat and preview surfaces
 *   2. `:---` / `:---:` / `---:` still reach the DOM as inline styles, and a
 *      table without markers emits none (so the CSS default is what applies)
 *
 * jsdom loads no stylesheets, so `getComputedStyle` cannot verify (1) — the CSS
 * is parsed directly instead, the same approach `scmBadgeCss.test.ts` takes.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render } from '@testing-library/react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';

import { MARKDOWN_REMARK_PLUGINS } from '@renderer/components/Markdown/markdownComponents';
import { createInitStyle } from '@renderer/components/Markdown/ShadowView';

const PREVIEW_CSS_PATH = path.resolve(__dirname, '../../../packages/desktop/src/renderer/styles/markdown.css');

/** Parse a stylesheet string through jsdom's CSSOM and return its top-level rules. */
const parseRules = (css: string): CSSRule[] => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const rules = [...(style.sheet?.cssRules ?? [])];
  style.remove();
  return rules;
};

const selectorOf = (rule: CSSRule): string => (rule as CSSStyleRule).selectorText ?? '';

/** Collapse whitespace so `:where(th)` matches regardless of authored spacing. */
const normalize = (selector: string): string => selector.replace(/\s+/g, ' ').trim();

/** jsdom reports nested rules with an explicit `&` prefix (`th{}` → `& th`). */
const nestedSelectorOf = (rule: CSSRule): string => normalize(selectorOf(rule).replace(/^&\s*/, ''));

describe('chat surface (ShadowView) table header alignment', () => {
  it('declares text-align: start on th so the header matches the body rows', () => {
    const style = createInitStyle('light');
    document.head.appendChild(style);
    const rules = [...(style.sheet?.cssRules ?? [])];
    style.remove();

    const table = rules.find((rule) => selectorOf(rule) === 'table') as CSSStyleRule | undefined;
    expect(table, 'the shadow stylesheet must still carry a `table` rule').toBeDefined();

    const nested = [...(table?.cssRules ?? [])] as CSSStyleRule[];
    const th = nested.find((rule) => nestedSelectorOf(rule) === 'th');
    const td = nested.find((rule) => nestedSelectorOf(rule) === 'td');

    expect(th, 'the nested `th` rule must exist').toBeDefined();
    expect(th?.style.getPropertyValue('text-align')).toBe('start');
    // `td` deliberately stays untouched: its UA default is already `start`.
    expect(td?.style.getPropertyValue('text-align')).toBe('');
  });
});

describe('preview surface (markdown.css) table header alignment', () => {
  it('declares text-align: start on th so the header matches the body rows', () => {
    const rules = parseRules(readFileSync(PREVIEW_CSS_PATH, 'utf8'));

    const th = rules.find((rule) => normalize(selectorOf(rule)) === '.aionui-markdown :where(th)') as
      | CSSStyleRule
      | undefined;

    expect(th, 'markdown.css must still carry a `.aionui-markdown :where(th)` rule').toBeDefined();
    expect(th?.style.getPropertyValue('text-align')).toBe('start');
  });
});

describe('GFM alignment markers survive the new default', () => {
  const renderTable = (md: string) => {
    const { container } = render(<ReactMarkdown remarkPlugins={MARKDOWN_REMARK_PLUGINS}>{md}</ReactMarkdown>);
    return container;
  };

  it('emits inline text-align for :--- / :---: / ---: (inline style outranks the CSS default)', () => {
    const container = renderTable(['| A | B | C |', '|:--|:-:|--:|', '| a | b | c |'].join('\n'));

    const headers = [...container.querySelectorAll('th')].map((cell) => cell.style.textAlign);
    const cells = [...container.querySelectorAll('td')].map((cell) => cell.style.textAlign);

    expect(headers).toEqual(['left', 'center', 'right']);
    expect(cells).toEqual(['left', 'center', 'right']);
  });

  it('emits no inline text-align without markers, leaving the CSS default in charge', () => {
    const container = renderTable(['| A | B |', '|---|---|', '| a | b |'].join('\n'));

    const headers = [...container.querySelectorAll('th')].map((cell) => cell.style.textAlign);
    expect(headers).toEqual(['', '']);
  });
});
