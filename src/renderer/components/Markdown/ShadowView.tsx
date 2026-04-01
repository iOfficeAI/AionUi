/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { theme } from '@office-ai/platform';
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { addImportantToAll } from '@renderer/utils/theme/customCssProcessor';

/**
 * Create the base style element for Shadow DOM with CSS variables, theme styles, and optional custom CSS.
 */
const createInitStyle = (currentTheme = 'light', cssVars?: Record<string, string>, customCss?: string) => {
  const style = document.createElement('style');
  // Inject external CSS variables into Shadow DOM for dark mode support
  const cssVarsDeclaration = cssVars
    ? Object.entries(cssVars)
        .map(([key, value]) => `${key}: ${value};`)
        .join('\n    ')
    : '';

  style.innerHTML = `
  /* Shadow DOM CSS variable definitions */
  :host {
    ${cssVarsDeclaration}
  }

  * {
    line-height:26px;
    font-size:16px;
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
  h1,h2,h3,h4,h5,h6,p,pre{
    margin-block-start:0px;
    margin-block-end:0px;
  }
  a{
    color:${theme.Color.PrimaryColor};
    text-decoration: none;
    cursor: pointer;
    word-break: break-all;
    overflow-wrap: anywhere;
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
    margin-top: 8px;
    margin-bottom: 8px;
  }
  code span{
    font-size:13px;
    line-height:20px;
  }

  .markdown-shadow-body>p:last-child{
    margin-bottom:0px;
  }
  ol, ul {
    padding-inline-start:20px;
  }
  pre {
    max-width: 100%;
    overflow-x: auto;
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
 * Get or create a shared KaTeX CSSStyleSheet for Shadow DOM adoption.
 * This extracts KaTeX styles from the document and creates a constructable stylesheet.
 */
const getKatexStyleSheet = (): CSSStyleSheet | null => {
  if (katexStyleSheet) return katexStyleSheet;

  try {
    // Find the KaTeX stylesheet in the document
    const katexSheet = [...document.styleSheets].find(
      (sheet) => sheet.href?.includes('katex') || (sheet.ownerNode as HTMLElement)?.dataset?.katex
    );

    if (katexSheet) {
      const cssRules = [...katexSheet.cssRules].map((rule) => rule.cssText).join('\n');
      katexStyleSheet = new CSSStyleSheet();
      katexStyleSheet.replaceSync(cssRules);
      return katexStyleSheet;
    }

    // Fallback: try to find KaTeX styles by checking style tags
    const styleSheets = [...document.styleSheets];
    for (const sheet of styleSheets) {
      try {
        const rules = [...sheet.cssRules];
        // Check if this stylesheet contains KaTeX rules
        const hasKatexRules = rules.some((rule) => rule.cssText.includes('.katex'));
        if (hasKatexRules) {
          const cssRules = rules.map((rule) => rule.cssText).join('\n');
          katexStyleSheet = new CSSStyleSheet();
          katexStyleSheet.replaceSync(cssRules);
          return katexStyleSheet;
        }
      } catch {
        // CORS may block access to cssRules for external stylesheets
        continue;
      }
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

  // Load custom CSS from ConfigStorage
  React.useEffect(() => {
    void import('@/common/config/storage').then(({ ConfigStorage }) => {
      ConfigStorage.get('customCss')
        .then((css) => {
          if (css) {
            // Use unified utility to auto-add !important
            const processedCss = addImportantToAll(css);
            setCustomCss(processedCss);
          } else {
            setCustomCss('');
          }
        })
        .catch((error: unknown) => {
          console.error('Failed to load custom CSS:', error);
        });
    });

    // Listen to custom CSS update events
    const handleCustomCssUpdate = (e: CustomEvent) => {
      if (e.detail?.customCss !== undefined) {
        const css = e.detail.customCss || '';
        // Use unified utility to auto-add !important
        const processedCss = addImportantToAll(css);
        setCustomCss(processedCss);
      }
    };

    window.addEventListener('custom-css-updated', handleCustomCssUpdate as EventListener);

    return () => {
      window.removeEventListener('custom-css-updated', handleCustomCssUpdate as EventListener);
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
      };

      // Remove old style and add new style
      if (styleRef.current) {
        styleRef.current.remove();
      }
      const newStyle = createInitStyle(currentTheme, cssVars, customCss);
      styleRef.current = newStyle;
      shadowRoot.appendChild(newStyle);

      // Inject KaTeX styles into Shadow DOM using adoptedStyleSheets
      // This allows math expressions to render correctly
      const katexSheet = getKatexStyleSheet();
      if (katexSheet && !shadowRoot.adoptedStyleSheets.includes(katexSheet)) {
        shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, katexSheet];
      }
    },
    [customCss]
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
      attributeFilter: ['data-theme', 'class'],
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
