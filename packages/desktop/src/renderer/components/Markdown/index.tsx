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
import { downloadFileFromPath, downloadFileFromUrl } from '@/renderer/utils/file/download';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import { Download } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { convertLatexDelimiters } from '@renderer/utils/chat/latexDelimiters';
import LocalImageView from '@renderer/components/media/LocalImageView';
import CodeBlock from './CodeBlock';
import LocalFileLink from './LocalFileLink';
import ShadowView from './ShadowView';
import { resolveLocalFileLinkPath, resolveLocalFileLinkReference, resolveMarkdownLocalFilePath } from './markdownUtils';
import type { LocalFileLinkReference } from './markdownUtils';

const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkBreaks];

const isLocalFilePath = (src: string): boolean => {
  if (src.startsWith('http://') || src.startsWith('https://')) return false;
  if (src.startsWith('data:')) return false;
  return true;
};

const getImageFileName = (src: string): string => {
  const path = src.startsWith('data:') ? '' : src.split(/[?#]/, 1)[0];
  const encodedName = path.split(/[/\\]/).pop();
  if (!encodedName) return 'image.png';
  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
};

const MarkdownImage: React.FC<
  React.ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
    alt: string;
    local: boolean;
    workspace?: string;
  }
> = ({ src, alt, className, local, workspace, ...imageProps }) => {
  const { t } = useTranslation();
  const handleDownload = useCallback(async () => {
    try {
      const fileName = getImageFileName(src);
      if (local) {
        await downloadFileFromPath(src, fileName, workspace);
      } else {
        await downloadFileFromUrl(src, fileName);
      }
      Message.success(t('acp.image.download_success'));
    } catch (error) {
      console.error('[MarkdownImage] Failed to download image:', error);
      Message.error(t('acp.image.download_error'));
    }
  }, [local, src, t, workspace]);

  return (
    <span className='markdown-image'>
      {local ? (
        <LocalImageView src={src} alt={alt} className={className} />
      ) : (
        <img {...imageProps} src={src} alt={alt} className={className} />
      )}
      <Tooltip content={t('acp.image.download')}>
        <Button
          aria-label={t('acp.image.download_aria')}
          className='markdown-image-download'
          type='secondary'
          size='mini'
          shape='circle'
          icon={<Download theme='outline' size='14' />}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handleDownload();
          }}
        />
      </Tooltip>
    </span>
  );
};

const normalizeLocalFileLinkDestinations = (
  markdown: string,
  aliases?: Readonly<Record<string, string>>,
  basePath?: string
): string => {
  const normalizeDestination = (destination: string): string | null => {
    const trimmedDestination = destination.trim();
    if (!resolveMarkdownLocalFilePath(trimmedDestination, aliases, basePath)) return null;

    // CommonMark treats a backslash before ASCII punctuation as an escape.
    // Normalize Windows separators before parsing so paths such as `\.codex`
    // do not become `.codex` and point at a different file.
    return encodeURI(trimmedDestination.replace(/\\/g, '/'));
  };

  const angleWrappedNormalized = markdown.replace(
    /(!?\[[^\]\n]*\]\(<)([^>\n]+)(>)([ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?(\))/g,
    (match, prefix: string, destination: string, closingAngle: string, title: string = '', suffix: string) => {
      const normalizedDestination = normalizeDestination(destination);
      if (!normalizedDestination) return match;
      return `${prefix}${normalizedDestination}${closingAngle}${title}${suffix}`;
    }
  );

  return angleWrappedNormalized.replace(
    /(!?\[[^\]\n]*\]\()([^)\n]+)(\))/g,
    (match, prefix: string, destinationWithTitle: string, suffix: string) => {
      const titleMatch = /^(.*?)([ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))$/.exec(destinationWithTitle);
      const destination = titleMatch?.[1] ?? destinationWithTitle;
      const title = titleMatch?.[2] ?? '';
      const normalizedDestination = normalizeDestination(destination);
      if (!normalizedDestination) return match;
      return `${prefix}${normalizedDestination}${title}${suffix}`;
    }
  );
};

type MarkdownViewProps = {
  children: string;
  hiddenCodeCopyButton?: boolean;
  codeStyle?: React.CSSProperties;
  className?: string;
  onRef?: (el?: HTMLDivElement | null) => void;
  onLocalFileLink?: (path: string, reference?: LocalFileLinkReference) => void | Promise<void>;
  localFileAliases?: Readonly<Record<string, string>>;
  localFileBasePath?: string;
  /** Enable raw HTML rendering in markdown content. Use with caution — only for trusted sources. */
  allowHtml?: boolean;
};

const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({
    hiddenCodeCopyButton,
    codeStyle,
    className,
    onRef,
    onLocalFileLink,
    localFileAliases,
    localFileBasePath,
    allowHtml,
    children: childrenProp,
  }) => {
    const { t } = useTranslation();

    const normalizedChildren = useMemo(() => {
      if (typeof childrenProp === 'string') {
        let text = childrenProp.replace(/file:\/\//g, '');
        text = normalizeLocalFileLinkDestinations(text, localFileAliases, localFileBasePath);
        text = convertLatexDelimiters(text);
        return text;
      }
      return childrenProp;
    }, [childrenProp, localFileAliases, localFileBasePath]);

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
          const resolvedLocalPath = resolveMarkdownLocalFilePath(rawHref, localFileAliases, localFileBasePath);
          const localFileReference = resolveLocalFileLinkReference(resolvedLocalPath ?? rawHref);
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
            const rawSrc = imgProps.src || '';
            const src = resolveMarkdownLocalFilePath(rawSrc, localFileAliases, localFileBasePath) ?? rawSrc;
            return (
              <MarkdownImage
                src={src}
                alt={imgProps.alt || ''}
                className={imgProps.className}
                local
                workspace={localFileBasePath}
              />
            );
          }
          return <MarkdownImage {...imgProps} src={imgProps.src || ''} alt={imgProps.alt || ''} local={false} />;
        },
      }),
      [codeStyle, hiddenCodeCopyButton, handleLinkClick, localFileAliases, localFileBasePath, onLocalFileLink]
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
