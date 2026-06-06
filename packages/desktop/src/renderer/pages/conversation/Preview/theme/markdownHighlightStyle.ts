/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * A prominent markdown highlight style for the source editor. CodeMirror's
 * default highlight style barely colors markdown tokens (mostly bold), so we
 * define explicit, GitHub-flavored colors per theme. Embedded fenced-code
 * blocks are intentionally not colorized here.
 */
const LIGHT = HighlightStyle.define([
  {
    tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
    color: '#0550ae',
    fontWeight: 'bold',
  },
  { tag: t.strong, color: '#1f2328', fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: '#0969da', textDecoration: 'underline' },
  { tag: t.monospace, color: '#0d9488' },
  { tag: t.quote, color: '#6e7781', fontStyle: 'italic' },
  { tag: t.list, color: '#0550ae' },
  { tag: [t.meta, t.processingInstruction], color: '#8c959f' },
  { tag: t.contentSeparator, color: '#8c959f' },
]);

const DARK = HighlightStyle.define([
  {
    tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
    color: '#79c0ff',
    fontWeight: 'bold',
  },
  { tag: t.strong, color: '#e6edf3', fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: '#79c0ff', textDecoration: 'underline' },
  { tag: t.monospace, color: '#4ec9b0' },
  { tag: t.quote, color: '#8b949e', fontStyle: 'italic' },
  { tag: t.list, color: '#79c0ff' },
  { tag: [t.meta, t.processingInstruction], color: '#8b949e' },
  { tag: t.contentSeparator, color: '#8b949e' },
]);

/** Returns the markdown source HighlightStyle for the given app theme mode. */
export const getMarkdownHighlightStyle = (mode: 'light' | 'dark'): HighlightStyle => (mode === 'dark' ? DARK : LIGHT);
