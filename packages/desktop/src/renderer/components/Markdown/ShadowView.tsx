/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { addImportantToAll } from '@renderer/utils/theme/customCssProcessor';
import { ipcBridge } from '@/common';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';

/**
 * Create the base style element for Shadow DOM with CSS variables, theme styles, and optional custom CSS.
 *
 * Exported for tests (heading inline-markup sizing regression).
 */
export const createInitStyle = (
  currentTheme = 'light',
  cssVars?: Record<string, string>,
  customCss?: string,
  isMobile?: boolean
) => {
  const style = document.createElement('style');
  // Inject external CSS variables into Shadow DOM for dark mode support
  const cssVarsDeclaration = cssVars
    ? Object.entries(cssVars)
        .map(([key, value]) => `${key}: ${value};`)
        .join('\n    ')
    : '';

  const lineHeight = isMobile ? '19.6px' : '24px';
  const fontSize = isMobile ? 'var(--chat-font-size, 14px)' : 'var(--chat-font-size, 16px)';
  // Desktop paragraph spacing trimmed from 16px to 12px (~0.85em) for a more
  // compact reply; mobile spacing is left untouched (tuned separately).
  const paragraphMargin = isMobile ? '16px' : '12px';

  style.innerHTML = `
  /* Shadow DOM CSS variable definitions */
  :host {
    ${cssVarsDeclaration}
  }

  * {
    line-height:${lineHeight};
    font-size:${fontSize};
    color: inherit;
  }

  .markdown-shadow-body {
    word-break: break-word;
    overflow-wrap: anywhere;
    color: var(--text-primary);
    max-width: 100%;
  }
  .markdown-shadow-body>p:first-child
  {
    margin-top:0px;
  }
  h1,h2,h3,h4,h5,h6{
    margin-block-start:0px;
    margin-block-end:0px;
  }
  .markdown-shadow-body p {
    margin-block-start: ${paragraphMargin};
    margin-block-end: ${paragraphMargin};
  }
  .markdown-shadow-body li {
    margin-block-start: 6px;
    margin-block-end: 6px;
  }
  a{
    color:var(--primary);
    text-decoration: none;
    cursor: pointer;
    word-break: break-all;
    overflow-wrap: anywhere;
  }
  .markdown-local-file-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-height: 22px;
    padding: 2px 6px;
    background: var(--bg-2);
    color: var(--text-primary);
    border: 1px solid transparent;
    border-radius: 6px;
    box-shadow: none;
    font: inherit;
    line-height: inherit;
    vertical-align: baseline;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }
  span.markdown-local-file-link {
    cursor: default;
  }
  .markdown-local-file-link:hover {
    background: var(--bg-3);
    color: var(--text-primary);
    text-decoration: none;
  }
  .markdown-local-file-link .truncate {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .markdown-local-file-line {
    padding: 0 4px;
    border-radius: 4px;
    background: var(--bg-3);
    color: var(--text-secondary);
  }
  .markdown-local-file-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    min-width: 20px;
    padding: 1px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .markdown-local-file-copy:hover {
    background: var(--bg-3);
    color: var(--text-primary);
  }
  h1{
    font-size: 24px;
    line-height: 32px;
    font-weight: bold;
  }
  h2,h3,h4,h5,h6{
    font-size: 16px;
    line-height: 24px;
    font-weight: bold;
    margin-top: 20px;
    margin-bottom: 12px;
  }
  code span{
    font-size:var(--code-font-size, 13px);
    line-height:20px;
    font-family: var(--font-mono);
  }

  .markdown-shadow-body>p:last-child{
    margin-bottom:0px;
  }
  ol, ul {
    padding-inline-start:24px;
  }
  hr {
    border: none;
    border-top: 1px solid var(--bg-3);
    margin: 28px 0;
  }
  strong {
    font-weight: 600;
    color: var(--text-primary);
  }
  /* Inline markup inside a heading must keep the heading's sizing. The
     universal flattener above pins font-size/line-height on EVERY element,
     and the h1/h2-h6 rules style only the heading element itself — so
     "# a **b** c" rendered b at body size in the middle of a 24px heading.
     :is() gives (0,0,1), outranking the (0,0,0) flattener; placed after
     the strong rule so its font-weight reset also defers to inherit here. */
  :is(h1, h2, h3, h4, h5, h6) * {
    font-size: inherit;
    line-height: inherit;
    font-weight: inherit;
  }
  .markdown-shadow-body code:not(pre code) {
    background: var(--bg-3);
    color: var(--text-primary);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.875em;
    font-family: var(--font-mono);
  }
  blockquote {
    border-left: 3px solid var(--bg-3);
    padding-left: 12px;
    color: var(--text-primary);
    margin: 16px 0;
  }
  pre {
    max-width: 100%;
    overflow-x: auto;
    margin-block-start: 8px;
    margin-block-end: 8px;
  }
  /* Code block horizontal scrollbar — blends with bg-2 */
  pre,
  .hljs {
    scrollbar-width: thin;
    scrollbar-color: ${currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)'} transparent;
  }
  pre::-webkit-scrollbar,
  .hljs::-webkit-scrollbar {
    height: 6px;
    background: transparent;
  }
  pre::-webkit-scrollbar-track,
  .hljs::-webkit-scrollbar-track,
  pre::-webkit-scrollbar-corner,
  .hljs::-webkit-scrollbar-corner {
    background: transparent;
  }
  pre::-webkit-scrollbar-thumb,
  .hljs::-webkit-scrollbar-thumb {
    background-color: ${currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.1)'};
    border-radius: 3px;
  }
  pre::-webkit-scrollbar-thumb:hover,
  .hljs::-webkit-scrollbar-thumb:hover {
    background-color: ${currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.2)'};
  }
  img {
    max-width: 100%;
    height: auto;
  }
   /* Table border styles */
  table {
    border-collapse: collapse;
    th{
      padding: 8px;
      border: 1px solid var(--bg-3);
      background-color: var(--bg-1);
      font-weight: bold;
    }
    td{
        padding: 8px;
        border: 1px solid var(--bg-3);
        min-width: 120px;
    }
  }
  /* Inline code should wrap on small screens to avoid horizontal overflow */
  .markdown-shadow-body code {
    word-break: break-word;
    overflow-wrap: anywhere;
    max-width: 100%;
  }
  /* Allow KaTeX to use its own line-height for proper fraction/superscript rendering */
  .katex,
  .katex * {
    line-height: normal;
  }

  /* Display math: only scroll horizontally when formula exceeds container width */
  .katex-display {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.5em 0;
  }

  .loading {
    animation: loading 1s linear infinite;
  }


  @keyframes loading {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  /* User Custom CSS (injected into Shadow DOM) */
  ${customCss || ''}
  `;
  return style;
};

// Cache for KaTeX stylesheet to share across Shadow DOM instances
let katexStyleSheet: CSSStyleSheet | null = null;

/**
 * Collect every KaTeX-related CSS rule from the given stylesheets.
 *
 * KaTeX ships as a single `katex.min.css`, but the bundler inlines it as an
 * anonymous `<style>` with no `href`/`data-katex` marker, so it cannot be located
 * by attribute. Other sheets (e.g. the preview `.aionui-markdown` theme) merely
 * *reference* `.katex` selectors — picking the first sheet that mentions `.katex`
 * can grab such a partial sheet, which lacks KaTeX's `.katex-mathml`
 * accessibility-hide rule and `@font-face` declarations. Adopting that partial
 * sheet into a Shadow DOM leaves the raw MathML annotation visible right next to
 * the rendered formula (the "formula shows twice" bug in chat). Aggregating every
 * katex-referencing rule across all sheets guarantees the hide rule and fonts are
 * always included regardless of how many sheets the rules are spread across.
 */
export const collectKatexCssRules = (styleSheets: Iterable<CSSStyleSheet>): string[] => {
  const collected: string[] = [];
  for (const sheet of styleSheets) {
    let rules: CSSRule[];
    try {
      rules = [...sheet.cssRules];
    } catch {
      // CORS may block access to cssRules for cross-origin stylesheets
      continue;
    }
    for (const rule of rules) {
      if (rule.cssText.toLowerCase().includes('katex')) {
        collected.push(rule.cssText);
      }
    }
  }
  return collected;
};

/**
 * Get or create a shared KaTeX CSSStyleSheet for Shadow DOM adoption.
 * This extracts KaTeX styles from the document and creates a constructable stylesheet.
 */
const getKatexStyleSheet = (): CSSStyleSheet | null => {
  if (katexStyleSheet) return katexStyleSheet;

  try {
    const cssRules = collectKatexCssRules([...document.styleSheets]);
    if (cssRules.length > 0) {
      katexStyleSheet = new CSSStyleSheet();
      katexStyleSheet.replaceSync(cssRules.join('\n'));
      return katexStyleSheet;
    }
  } catch (error) {
    console.warn('Failed to create KaTeX stylesheet for Shadow DOM:', error);
  }

  return null;
};

type ShadowDivElement = HTMLDivElement & { __init__shadow?: boolean };

const ShadowView = ({ children }: { children: React.ReactNode }) => {
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const styleRef = React.useRef<HTMLStyleElement | null>(null);
  const [customCss, setCustomCss] = useState<string>('');
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  React.useEffect(() => {
    let mounted = true;
    const applyCss = (t: { css?: string } | null) => {
      if (!mounted) return;
      setCustomCss(t?.css ? addImportantToAll(t.css) : '');
    };
    ipcBridge.theme.requestCurrent
      .invoke()
      .then(applyCss)
      .catch(() => {});
    const off = ipcBridge.theme.changed.on((t) => applyCss(t));
    return () => {
      mounted = false;
      off?.();
    };
  }, []);

  // Update CSS variables and custom styles in Shadow DOM
  const updateStyles = React.useCallback(
    (shadowRoot: ShadowRoot) => {
      const computedStyle = getComputedStyle(document.documentElement);
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const cssVars = {
        '--bg-1': computedStyle.getPropertyValue('--bg-1'),
        '--bg-2': computedStyle.getPropertyValue('--bg-2'),
        '--bg-3': computedStyle.getPropertyValue('--bg-3'),
        '--color-text-1': computedStyle.getPropertyValue('--color-text-1'),
        '--color-text-2': computedStyle.getPropertyValue('--color-text-2'),
        '--color-text-3': computedStyle.getPropertyValue('--color-text-3'),
        '--text-primary': computedStyle.getPropertyValue('--text-primary'),
        '--text-secondary': computedStyle.getPropertyValue('--text-secondary'),
        '--chat-font-size': computedStyle.getPropertyValue('--chat-font-size'),
        '--code-font-size': computedStyle.getPropertyValue('--code-font-size'),
      };

      // Remove old style and add new style
      if (styleRef.current) {
        styleRef.current.remove();
      }
      const newStyle = createInitStyle(currentTheme, cssVars, customCss, isMobile);
      styleRef.current = newStyle;
      shadowRoot.appendChild(newStyle);

      // Inject KaTeX styles into Shadow DOM using adoptedStyleSheets
      // This allows math expressions to render correctly
      const katexSheet = getKatexStyleSheet();
      if (katexSheet && !shadowRoot.adoptedStyleSheets.includes(katexSheet)) {
        shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, katexSheet];
      }
    },
    [customCss, isMobile]
  );

  React.useEffect(() => {
    if (!root) return;

    // Update styles when custom CSS changes
    updateStyles(root);
  }, [root, customCss, updateStyles]);

  React.useEffect(() => {
    if (!root) return;

    // Listen for theme changes
    const observer = new MutationObserver(() => {
      updateStyles(root);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });

    return () => observer.disconnect();
  }, [root, updateStyles]);

  return (
    <div
      ref={(el: ShadowDivElement | null) => {
        if (!el || el.__init__shadow) return;
        el.__init__shadow = true;
        const shadowRoot = el.attachShadow({ mode: 'open' });
        updateStyles(shadowRoot);
        setRoot(shadowRoot);
      }}
      className='markdown-shadow'
      style={{ width: '100%', flex: '1 1 auto', minWidth: 0 }}
    >
      {root && ReactDOM.createPortal(children, root)}
    </div>
  );
};

export default ShadowView;
