/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';

import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

// Import KaTeX CSS to make it available in the document
import 'katex/dist/katex.min.css';

import { openExternalUrl } from '@/renderer/utils/platform';
import { iconColors } from '@/renderer/styles/colors';
import { copyText } from '@/renderer/utils/ui/clipboard';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import { Copy } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { convertLatexDelimiters } from '@renderer/utils/chat/latexDelimiters';
import LocalImageView from '@renderer/components/media/LocalImageView';
import CodeBlock from './CodeBlock';
import ShadowView from './ShadowView';
import { resolveLocalFileLinkPath, resolveLocalFileLinkReference } from './markdownUtils';
import type { LocalFileLinkReference } from './markdownUtils';

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkBreaks];

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
  onLocalFileLink?: (path: string, reference?: LocalFileLinkReference) => void | Promise<void>;
  /** Enable raw HTML rendering in markdown content. Use with caution — only for trusted sources. */
  allowHtml?: boolean;
};

const LocalFileLink: React.FC<{
  reference: LocalFileLinkReference;
  children?: React.ReactNode;
  onOpen?: (path: string, reference?: LocalFileLinkReference) => void | Promise<void>;
}> = ({ reference, children, onOpen }) => {
  const { t } = useTranslation();
  const { filePath, line, rawReference } = reference;
  const fallbackLabel = filePath.split(/[\\/]/).pop() || filePath;
  const label = children || fallbackLabel;
  const textLabel =
    React.Children.toArray(children)
      .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
      .join('') || fallbackLabel;
  const locationLabel = line == null ? null : `L${line}${reference.column == null ? '' : `:${reference.column}`}`;
  const canOpen = Boolean(onOpen);

  const handleOpen = useCallback(
    (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if (onOpen) {
        void onOpen(filePath, reference);
      }
    },
    [filePath, onOpen, reference]
  );

  const handleCopy = useCallback(
    (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      copyText(rawReference).catch(() => {
        Message.error(t('common.copyFailed'));
      });
    },
    [rawReference, t]
  );

  return (
    <span
      className='inline-flex items-center gap-2px max-w-full align-baseline'
      data-local-file-path={filePath}
      data-local-file-line={line}
      title={rawReference}
    >
      {canOpen ? (
        <Button
          type='text'
          size='mini'
          aria-label={locationLabel ? `${textLabel} ${locationLabel}` : textLabel}
          className='markdown-local-file-link !px-6px !py-2px !h-auto !leading-normal !align-baseline max-w-full !rd-6px'
          onClick={handleOpen}
        >
          <span className='inline-flex items-center gap-4px max-w-full'>
            <span className='truncate'>{label}</span>
            {locationLabel && (
              <span className='markdown-local-file-line flex-shrink-0 text-11px font-mono'>{locationLabel}</span>
            )}
          </span>
        </Button>
      ) : (
        <span className='markdown-local-file-link inline-flex items-center gap-4px max-w-full'>
          <span className='truncate'>{label}</span>
          {locationLabel && (
            <span className='markdown-local-file-line flex-shrink-0 text-11px font-mono'>{locationLabel}</span>
          )}
        </span>
      )}
      <Tooltip content={t('common.copy', { defaultValue: 'Copy' })}>
        <Button
          aria-label={t('common.copy', { defaultValue: 'Copy' })}
          type='text'
          size='mini'
          className='markdown-local-file-copy !p-1px !w-20px !h-20px flex-shrink-0'
          icon={<Copy theme='outline' size='14' fill={iconColors.secondary} />}
          onClick={handleCopy}
        />
      </Tooltip>
    </span>
  );
};

const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({ hiddenCodeCopyButton, codeStyle, className, onRef, onLocalFileLink, allowHtml, children: childrenProp }) => {
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
        a: ({ node: _node, ...rest }: Record<string, unknown>) => {
          const anchorProps = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
          const rawHref = typeof anchorProps.href === 'string' ? anchorProps.href : '';
          const localFileReference = resolveLocalFileLinkReference(rawHref);
          if (localFileReference) {
            return (
              <LocalFileLink reference={localFileReference} onOpen={onLocalFileLink}>
                {anchorProps.children}
              </LocalFileLink>
            );
          }
          return (
            <a {...anchorProps} href={anchorProps.href} target='_blank' rel='noreferrer' onClick={handleLinkClick} />
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
          return <img {...imgProps} />;
        },
      }),
      [codeStyle, hiddenCodeCopyButton, handleLinkClick, onLocalFileLink]
    );

    const rehypePlugins = useMemo(() => (allowHtml ? [rehypeRaw, rehypeKatex] : [rehypeKatex]), [allowHtml]);

    return (
      <div className={classNames('relative w-full', className)}>
        <ShadowView>
          <div ref={onRef} className='markdown-shadow-body'>
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              rehypePlugins={rehypePlugins}
              components={components}
              urlTransform={(url) => (resolveLocalFileLinkPath(url) ? url : defaultUrlTransform(url))}
            >
              {normalizedChildren}
            </ReactMarkdown>
          </div>
        </ShadowView>
      </div>
    );
  }
);

MarkdownView.displayName = 'MarkdownView';

export default MarkdownView;
