/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMarkdownLinkHandler } from '@/renderer/hooks/file/useMarkdownLinkHandler';
import LocalImageView from '@renderer/components/media/LocalImageView';
import { convertLatexDelimiters } from '@renderer/utils/chat/latexDelimiters';
import classNames from 'classnames';
import rehypeKatex from 'rehype-katex';
import React, { useMemo } from 'react';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Streamdown } from 'streamdown';
import ShadowView from './ShadowView';

import 'katex/dist/katex.min.css';

type StreamingMarkdownViewProps = {
  children: string;
  className?: string;
  onRef?: (el?: HTMLDivElement | null) => void;
};

export const hasClosedFencedCodeBlocks = (content: string): boolean => {
  const lines = content.split(/\r?\n/);
  let openFence: { marker: '`' | '~'; length: number } | null = null;

  for (const line of lines) {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (!match) {
      continue;
    }

    const marker = match[1][0] as '`' | '~';
    const length = match[1].length;

    if (!openFence) {
      openFence = { marker, length };
      continue;
    }

    if (openFence.marker === marker && length >= openFence.length) {
      openFence = null;
    }
  }

  return openFence === null;
};

const isEscapedAt = (content: string, index: number): boolean => {
  let backslashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && content[cursor] === '\\'; cursor -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
};

export const hasClosedInlineCodeSpans = (content: string): boolean => {
  const lines = content.split(/\r?\n/);
  let openFence: { marker: '`' | '~'; length: number } | null = null;
  let openInlineCodeLength: number | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~';
      const length = fenceMatch[1].length;

      if (!openFence) {
        openFence = { marker, length };
        continue;
      }

      if (openFence.marker === marker && length >= openFence.length) {
        openFence = null;
      }

      continue;
    }

    if (openFence) {
      continue;
    }

    for (let cursor = 0; cursor < line.length; cursor += 1) {
      if (line[cursor] !== '`' || isEscapedAt(line, cursor)) {
        continue;
      }

      let runLength = 1;
      while (line[cursor + runLength] === '`') {
        runLength += 1;
      }

      if (openInlineCodeLength === null) {
        openInlineCodeLength = runLength;
      } else if (openInlineCodeLength === runLength) {
        openInlineCodeLength = null;
      }

      cursor += runLength - 1;
    }
  }

  return openInlineCodeLength === null;
};

const isLocalFilePath = (src: string): boolean => {
  if (src.startsWith('http://') || src.startsWith('https://')) return false;
  if (src.startsWith('data:')) return false;
  return true;
};

const getCodeLanguage = (className?: string): string => {
  const match = /language-(\w+)/.exec(className || '');
  return match?.[1]?.toLowerCase() || 'text';
};

const StreamingMarkdownView: React.FC<StreamingMarkdownViewProps> = ({ children: childrenProp, className, onRef }) => {
  const normalizedChildren = useMemo(() => {
    if (typeof childrenProp !== 'string') {
      return childrenProp;
    }
    return convertLatexDelimiters(childrenProp.replace(/file:\/\//g, ''));
  }, [childrenProp]);
  const shouldUseStreamdown = useMemo(
    () =>
      typeof normalizedChildren !== 'string' ||
      (hasClosedFencedCodeBlocks(normalizedChildren) && hasClosedInlineCodeSpans(normalizedChildren)),
    [normalizedChildren]
  );

  const handleLinkClick = useMarkdownLinkHandler();

  const components = useMemo(
    () => ({
      span: ({ node: _node, className: spanClassName, children, ...rest }: Record<string, unknown>) => (
        <span {...(rest as React.HTMLAttributes<HTMLSpanElement>)} className={spanClassName as string | undefined}>
          {children as React.ReactNode}
        </span>
      ),
      a: ({ node: _node, ...rest }: Record<string, unknown>) => (
        <a
          {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
          target='_blank'
          rel='noreferrer'
          onClick={handleLinkClick}
        />
      ),
      pre: ({ node: _node, children, ...rest }: Record<string, unknown>) => {
        const codeChild = React.Children.toArray(children as React.ReactNode)[0];
        const isCodeElement = React.isValidElement(codeChild);
        const codeClassName = isCodeElement ? (codeChild.props as { className?: string }).className : undefined;
        const language = getCodeLanguage(codeClassName);

        return (
          <div
            style={{
              width: '100%',
              minWidth: 0,
              maxWidth: '100%',
              border: '1px solid var(--bg-3)',
              borderRadius: '0.3rem',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-2)',
                padding: '6px 10px',
                borderBottom: '1px solid var(--bg-3)',
              }}
            >
              <span
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  lineHeight: '20px',
                }}
              >
                {'<' + language + '>'}
              </span>
            </div>
            <pre
              {...(rest as React.HTMLAttributes<HTMLPreElement>)}
              style={{
                ...(rest as { style?: React.CSSProperties }).style,
                margin: 0,
                maxWidth: '100%',
                overflowX: 'auto',
                padding: '12px 16px',
                backgroundColor: 'transparent',
              }}
            >
              {children as React.ReactNode}
            </pre>
          </div>
        );
      },
      code: ({ node: _node, className: codeClassName, children, ...rest }: Record<string, unknown>) => {
        const content = String(children ?? '').replace(/\n$/, '');
        const isInlineCode = !content.includes('\n');

        return (
          <code
            {...(rest as React.HTMLAttributes<HTMLElement>)}
            className={codeClassName as string | undefined}
            style={
              isInlineCode
                ? {
                    fontWeight: 'bold',
                  }
                : {
                    display: 'block',
                    color: 'var(--text-primary)',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
                    fontSize: '13px',
                    lineHeight: '20px',
                    whiteSpace: 'pre',
                    wordBreak: 'normal',
                    overflowWrap: 'normal',
                  }
            }
          >
            {content}
          </code>
        );
      },
      table: ({ node: _node, ...rest }: Record<string, unknown>) => (
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
      ),
      td: ({ node: _node, ...rest }: Record<string, unknown>) => (
        <td
          {...(rest as React.TdHTMLAttributes<HTMLTableCellElement>)}
          style={{
            ...(rest as { style?: React.CSSProperties }).style,
            padding: '8px',
            border: '1px solid var(--bg-3)',
            minWidth: '120px',
          }}
        />
      ),
      img: ({ node: _node, ...rest }: Record<string, unknown>) => {
        const imgProps = rest as React.ImgHTMLAttributes<HTMLImageElement>;
        if (isLocalFilePath(imgProps.src || '')) {
          const src = decodeURIComponent(imgProps.src || '');
          return <LocalImageView src={src} alt={imgProps.alt || ''} className={imgProps.className} />;
        }
        return (
          <img
            {...imgProps}
            style={{
              ...imgProps.style,
              maxWidth: '100%',
              height: 'auto',
            }}
          />
        );
      },
    }),
    [handleLinkClick]
  );

  return (
    <div className={classNames('relative w-full', className)} data-testid='streaming-markdown-view'>
      <ShadowView>
        <div ref={onRef} className='markdown-shadow-body'>
          {shouldUseStreamdown ? (
            <Streamdown
              parseIncompleteMarkdown={true}
              remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
              rehypePlugins={[rehypeKatex]}
              components={components}
            >
              {normalizedChildren}
            </Streamdown>
          ) : (
            <div className='whitespace-pre-wrap break-words'>{normalizedChildren}</div>
          )}
        </div>
      </ShadowView>
    </div>
  );
};

export default StreamingMarkdownView;
