/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ReactMarkdown, { type Options as ReactMarkdownOptions } from 'react-markdown';

type PluggableList = NonNullable<ReactMarkdownOptions['rehypePlugins']>;

import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

// Import KaTeX CSS to make it available in the document
import 'katex/dist/katex.min.css';

import { openExternalUrl } from '@/renderer/utils/platform';
import classNames from 'classnames';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { convertLatexDelimiters } from '@renderer/utils/chat/latexDelimiters';
import LocalImageView from '@renderer/components/media/LocalImageView';
import CodeBlock from './CodeBlock';
import ShadowView from './ShadowView';
import { splitMarkdownBlocks } from './splitMarkdownBlocks';

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkBreaks];

type MarkdownComponents = Record<string, React.ComponentType<Record<string, unknown>>>;

/**
 * Lightweight code renderer used for the actively streaming tail block.
 * Skips react-syntax-highlighter tokenization (which re-tokenizes the whole
 * block on every chunk); the real CodeBlock takes over when the block
 * stabilizes or the stream finishes.
 */
const StreamingCode: React.FC<Record<string, unknown>> = (props) => {
  const { children, className } = props as { children?: React.ReactNode; className?: string };
  const text = String(children ?? '');
  if (!text.includes('\n')) {
    return (
      <code className={className} style={{ fontWeight: 'bold' }}>
        {text}
      </code>
    );
  }
  return (
    <pre
      style={{
        background: 'var(--bg-2)',
        borderRadius: '8px',
        borderLeft: '3px solid var(--brand)',
        padding: '8px 12px',
        margin: 0,
        overflowX: 'auto',
        maxWidth: '100%',
      }}
    >
      <code style={{ background: 'transparent', color: 'var(--text-primary)' }}>{text}</code>
    </pre>
  );
};

/**
 * One markdown block rendered through ReactMarkdown and memoized by content.
 * During streaming only the final (growing) block re-renders; completed
 * blocks — including code blocks and KaTeX math — are skipped entirely.
 *
 * `streaming` marks the in-flight tail block: expensive work (KaTeX,
 * syntax highlighting) is deferred until the block completes, since the
 * content is incomplete anyway (unclosed `$$`/fences would render garbage).
 */
const MarkdownBlock: React.FC<{
  content: string;
  components: MarkdownComponents;
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
  streaming: boolean;
}> = React.memo(({ content, components, remarkPlugins, rehypePlugins, streaming }) => {
  const effectiveComponents = useMemo(
    () => (streaming ? { ...components, code: StreamingCode } : components),
    [components, streaming]
  );
  const effectiveRehypePlugins = useMemo(
    () => (streaming ? rehypePlugins.filter((plugin) => plugin !== rehypeKatex) : rehypePlugins),
    [rehypePlugins, streaming]
  );
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={effectiveRehypePlugins}
      components={effectiveComponents}
    >
      {content}
    </ReactMarkdown>
  );
});

MarkdownBlock.displayName = 'MarkdownBlock';

const isLocalFilePath = (src: string): boolean => {
  if (src.startsWith('http://') || src.startsWith('https://')) return false;
  if (src.startsWith('data:')) return false;
  return true;
};

type MarkdownViewProps = {
  children: string;
  hiddenCodeCopyButton?: boolean;
  codeStyle?: React.CSSProperties;
  className?: string;
  onRef?: (el?: HTMLDivElement | null) => void;
  /** Enable raw HTML rendering in markdown content. Use with caution — only for trusted sources. */
  allowHtml?: boolean;
  /**
   * Content is still streaming in. The final block renders in a cheap mode
   * (plain code, no KaTeX) until the stream finishes.
   */
  isStreaming?: boolean;
};

const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({ hiddenCodeCopyButton, codeStyle, className, onRef, allowHtml, isStreaming, children: childrenProp }) => {
    const { t } = useTranslation();

    const normalizedChildren = useMemo(() => {
      if (typeof childrenProp === 'string') {
        let text = childrenProp.replace(/file:\/\//g, '');
        text = convertLatexDelimiters(text);
        return text;
      }
      return childrenProp;
    }, [childrenProp]);

    const handleLinkClick = useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const href = (e.currentTarget as HTMLAnchorElement).href;
        if (!href) return;
        openExternalUrl(href).catch((error: unknown) => {
          console.error(t('messages.openLinkFailed'), error);
        });
      },
      [t]
    );

    // Memoize components so React preserves component identity across re-renders.
    // Without this, every streaming update creates new function references → React
    // unmounts/remounts all custom components → hooks & DOM state are lost.
    const components = useMemo(
      () => ({
        span: ({ node: _node, className: cn, children: ch, ...rest }: Record<string, unknown>) => (
          <span {...(rest as React.HTMLAttributes<HTMLSpanElement>)} className={cn as string}>
            {ch as React.ReactNode}
          </span>
        ),
        code: (props: Record<string, unknown>) => (
          <CodeBlock
            {...(props as Parameters<typeof CodeBlock>[0])}
            codeStyle={codeStyle}
            hiddenCodeCopyButton={hiddenCodeCopyButton}
          />
        ),
        a: ({ node: _node, ...rest }: Record<string, unknown>) => (
          <a
            {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
            target='_blank'
            rel='noreferrer'
            onClick={handleLinkClick}
          />
        ),
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
          return <img {...imgProps} />;
        },
      }),
      [codeStyle, hiddenCodeCopyButton, handleLinkClick]
    );

    const rehypePlugins = useMemo(() => (allowHtml ? [rehypeRaw, rehypeKatex] : [rehypeKatex]), [allowHtml]);

    // Block-level memoization: completed blocks render once and stay inert
    // while the tail block grows. Only active during streaming — splitting
    // changes semantics for constructs whose definition lives in another
    // block (footnotes, reference-style links), so settled/static content
    // keeps the original single-pass render (where memoization wouldn't help
    // anyway). Raw HTML can span blank lines (a single element split across
    // blocks would produce broken markup), so allowHtml also stays
    // single-pass.
    const blocks = useMemo(() => {
      if (!isStreaming || allowHtml || typeof normalizedChildren !== 'string') {
        return [normalizedChildren];
      }
      return splitMarkdownBlocks(normalizedChildren);
    }, [allowHtml, isStreaming, normalizedChildren]);

    return (
      <div className={classNames('relative w-full', className)}>
        <ShadowView>
          <div ref={onRef} className='markdown-shadow-body'>
            {/* Index keys are safe because splitMarkdownBlocks is prefix-stable:
                appending streamed content never moves earlier block boundaries,
                so a given index always maps to the same (frozen) block. */}
            {blocks.map((block, index) => (
              <MarkdownBlock
                key={index}
                content={block}
                components={components as MarkdownComponents}
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={rehypePlugins}
                streaming={Boolean(isStreaming) && index === blocks.length - 1}
              />
            ))}
          </div>
        </ShadowView>
      </div>
    );
  }
);

MarkdownView.displayName = 'MarkdownView';

export default MarkdownView;
