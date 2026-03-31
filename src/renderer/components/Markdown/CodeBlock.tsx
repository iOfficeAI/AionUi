/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';

import katex from 'katex';

import { copyText } from '@/renderer/utils/ui/clipboard';
import { Message } from '@arco-design/web-react';
import { Copy, Down, Up } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCode, getDiffLineStyle } from './markdownUtils';

const PREVIEW_LINES = 3;
const EXPANDED_STATES_MAX_SIZE = 200;

// Persist expanded state across component remounts during streaming.
// Keyed by a fingerprint (language + first line) so state survives
// when ReactMarkdown recreates the component tree on each content update.
// Capped at EXPANDED_STATES_MAX_SIZE entries to prevent unbounded growth.
const expandedStates = new Map<string, boolean>();

function getBlockFingerprint(language: string, lines: string[]): string {
  const preview = lines.slice(0, PREVIEW_LINES).join('\n');
  const key = `${language}:${lines.length}:${preview}`;
  // Evict oldest entries when exceeding size limit
  if (!expandedStates.has(key) && expandedStates.size >= EXPANDED_STATES_MAX_SIZE) {
    const firstKey = expandedStates.keys().next().value;
    if (firstKey !== undefined) {
      expandedStates.delete(firstKey);
    }
  }
  return key;
}

type CodeBlockProps = {
  children: string;
  className?: string;
  node?: unknown;
  hiddenCodeCopyButton?: boolean;
  codeStyle?: React.CSSProperties;
  [key: string]: unknown;
};

function CodeBlock(props: CodeBlockProps) {
  const { t } = useTranslation();
  // Dummy counter to force re-render when expanded state changes in the Map
  const [, setRenderTick] = useState(0);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  React.useEffect(() => {
    const updateTheme = () => {
      const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setCurrentTheme(theme);
    };

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  const {
    children,
    className,
    node: _node,
    hiddenCodeCopyButton: _hiddenCodeCopyButton,
    codeStyle: _codeStyle,
    ...rest
  } = props;

  const match = /language-(\w+)/.exec(className || '');
  const language = match?.[1] || 'text';
  const codeTheme = currentTheme === 'dark' ? vs2015 : vs;

  // Render latex/math code blocks as KaTeX display math
  // Skip full LaTeX documents (with \documentclass, \begin{document}, etc.) — KaTeX only handles math
  if (language === 'latex' || language === 'math' || language === 'tex') {
    const latexSource = String(children).replace(/\n$/, '');
    const isFullDocument = /\\(documentclass|begin\{document\}|usepackage)\b/.test(latexSource);
    if (!isFullDocument) {
      try {
        const html = katex.renderToString(latexSource, {
          displayMode: true,
          throwOnError: false,
        });
        return <div className='katex-display' dangerouslySetInnerHTML={{ __html: html }} />;
      } catch {
        // Fall through to render as code block if KaTeX fails
      }
    }
  }

  if (!String(children).includes('\n')) {
    return (
      <code
        {...rest}
        className={className}
        style={{
          fontWeight: 'bold',
        }}
      >
        {children}
      </code>
    );
  }

  const isDiff = language === 'diff';
  const formattedContent = formatCode(children);
  const allLines = formattedContent.split('\n');
  const diffLines = isDiff ? allLines : [];
  const totalLines = allLines.length;
  const canCollapse = totalLines > PREVIEW_LINES;

  const blockKey = getBlockFingerprint(language, allLines);
  const expanded = expandedStates.get(blockKey) ?? false;
  const setExpanded = (val: boolean) => {
    expandedStates.set(blockKey, val);
    setRenderTick((n) => n + 1);
  };
  const displayContent = expanded || !canCollapse ? formattedContent : allLines.slice(0, PREVIEW_LINES).join('\n');

  const syntaxHighlighterStyle: React.CSSProperties = {
    margin: '0',
    borderRadius: '0',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    overflowX: 'auto',
    maxWidth: '100%',
  };

  return (
    <div style={{ width: '100%', minWidth: 0, maxWidth: '100%', ...props.codeStyle }}>
      <div
        style={{
          border: '1px solid var(--bg-3)',
          borderRadius: '0.3rem',
          overflow: 'hidden',
          overflowX: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-2)',
            borderTopLeftRadius: '0.3rem',
            borderTopRightRadius: '0.3rem',
            padding: '6px 10px',
            borderBottom: '1px solid var(--bg-3)',
          }}
        >
          <span
            style={{
              textDecoration: 'none',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              lineHeight: '20px',
            }}
          >
            {'<' + language.toLocaleLowerCase() + '>'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Copy
              theme='outline'
              size='18'
              style={{ cursor: 'pointer' }}
              fill='var(--text-secondary)'
              onClick={() => {
                void copyText(formatCode(children))
                  .then(() => {
                    Message.success(t('common.copySuccess'));
                  })
                  .catch(() => {
                    Message.error(t('common.copyFailed'));
                  });
              }}
            />
            {canCollapse && expanded && (
              <Up
                theme='outline'
                size='20'
                style={{ cursor: 'pointer' }}
                fill='var(--text-secondary)'
                onMouseDown={(e: React.MouseEvent) => {
                  if (e.button === 0) {
                    e.preventDefault();
                    setExpanded(false);
                  }
                }}
                title={t('common.collapse', 'Collapse')}
              />
            )}
          </div>
        </div>

        {/* Code content — always visible (preview or full) */}
        <SyntaxHighlighter
          children={displayContent}
          language={language}
          style={codeTheme}
          PreTag='div'
          wrapLines={isDiff}
          lineProps={
            isDiff
              ? (lineNumber: number) => ({
                  style: {
                    display: 'block',
                    ...getDiffLineStyle(diffLines[lineNumber - 1] || '', currentTheme === 'dark'),
                  },
                })
              : undefined
          }
          customStyle={syntaxHighlighterStyle}
          codeTagProps={{ style: { color: 'var(--text-primary)' } }}
        />

        {/* Footer: "View More" / collapse */}
        {canCollapse && (
          <div
            style={{
              display: 'flex',
              justifyContent: expanded ? 'flex-end' : 'center',
              alignItems: 'center',
              backgroundColor: 'var(--bg-2)',
              borderBottomLeftRadius: '0.3rem',
              borderBottomRightRadius: '0.3rem',
              padding: '4px 10px',
              borderTop: '1px solid var(--bg-3)',
              cursor: 'pointer',
            }}
            onMouseDown={(e) => {
              if (e.button === 0) {
                e.preventDefault();
                setExpanded(!expanded);
              }
            }}
          >
            {expanded ? (
              <Up theme='outline' size='20' fill='var(--text-secondary)' title={t('common.collapse', 'Collapse')} />
            ) : (
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '20px' }}>
                {t('common.viewMoreLines', { count: totalLines - PREVIEW_LINES })}{' '}
                <Down theme='outline' size='14' fill='var(--text-secondary)' />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CodeBlock;
