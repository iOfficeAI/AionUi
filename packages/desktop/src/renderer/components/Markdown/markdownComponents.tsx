/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

/**
 * Shared remark plugin set for every markdown surface: GFM tables/strikethrough,
 * `$...$` / `$$...$$` math, and hard line breaks. Kept as a single module-level
 * constant so all renderers stay in sync and React sees a stable reference.
 */
export const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath, remarkBreaks];

/**
 * Rehype pipeline for surfaces that render raw HTML embedded in semi-trusted
 * document content (the file preview panel reads arbitrary local/agent-authored
 * markdown). Order is load-bearing:
 *   1. rehype-raw      — parse embedded HTML strings into real HAST nodes
 *   2. rehype-sanitize — drop dangerous nodes/attributes (`<script>`, `<iframe>`,
 *                        `srcdoc`, inline `on*` handlers, `javascript:` URLs)
 *   3. rehype-katex    — runs AFTER sanitize, so KaTeX's own markup is never
 *                        stripped. The default sanitize schema already preserves
 *                        the `language-*` / `math-inline` / `math-display` classes
 *                        that remark-math emits, so formulas still render.
 *
 * Sanitizing before KaTeX (not after) is what lets raw HTML be shown safely while
 * math keeps working — this is the behaviour that must not regress.
 */
export const SANITIZED_HTML_REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize, rehypeKatex];

/** Table override shared by the chat and preview renderers: horizontal scroll + collapsed borders. */
export const MarkdownTable = ({ node: _node, ...rest }: Record<string, unknown>) => (
  <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
    <table
      {...(rest as React.TableHTMLAttributes<HTMLTableElement>)}
      style={{
        ...(rest as { style?: React.CSSProperties }).style,
        borderCollapse: 'collapse',
        border: '1px solid var(--bg-3)',
        minWidth: '100%',
      }}
    />
  </div>
);

/** Table-cell override shared by the chat and preview renderers: consistent padding + borders. */
export const MarkdownTd = ({ node: _node, ...rest }: Record<string, unknown>) => (
  <td
    {...(rest as React.TdHTMLAttributes<HTMLTableCellElement>)}
    style={{
      ...(rest as { style?: React.CSSProperties }).style,
      padding: '8px',
      border: '1px solid var(--bg-3)',
      minWidth: '120px',
    }}
  />
);
