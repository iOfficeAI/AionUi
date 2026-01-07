/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ReactMarkdown from 'react-markdown';

import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs2015, vs } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { ipcBridge } from '@/common';
import { Copy, Down, Up } from '@icon-park/react';
import { Message } from '@arco-design/web-react';
import { theme } from '@office-ai/platform';
import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import LocalImageView from './LocalImageView';
import { addImportantToAll } from '../utils/customCssProcessor';
import classNames from 'classnames';

const formatCode = (code: string) => {
  const content = String(code).replace(/\n$/, '');
  try {
    //@todo 可以再美化
    return JSON.stringify(
      JSON.parse(content),
      (_key, value) => {
        return value;
      },
      2
    );
  } catch (error) {
    return content;
  }
};

const logicRender = <T, F>(condition: boolean, trueComponent: T, falseComponent?: F): T | F => {
  return condition ? trueComponent : falseComponent;
};

function CodeBlock(props: any) {
  const [fold, setFlow] = useState(false);
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

  return useMemo(() => {
    const { children, className, node: _node, hiddenCodeCopyButton: _hiddenCodeCopyButton, codeStyle: _codeStyle, ...rest } = props;
    const match = /language-(\w+)/.exec(className || '');
    const language = match?.[1] || 'text';
    const codeTheme = currentTheme === 'dark' ? vs2015 : vs;
    if (!String(children).includes('\n')) {
      return (
        <code
          {...rest}
          className={className}
          style={{
            backgroundColor: 'var(--bg-1)',
            padding: '2px 4px',
            margin: '0 4px',
            borderRadius: '4px',
            border: '1px solid',
            borderColor: 'var(--bg-3)',
            display: 'inline-block',
            maxWidth: '100%',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            whiteSpace: 'break-spaces',
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <div style={{ width: '100%', ...(props.codeStyle || {}) }}>
        <div
          style={{
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
              borderTopLeftRadius: '0.3rem',
              borderTopRightRadius: '0.3rem',
              borderBottomLeftRadius: fold ? '0.3rem' : '0',
              borderBottomRightRadius: fold ? '0.3rem' : '0',
              padding: '6px 10px',
              borderBottom: !fold ? '1px solid var(--bg-3)' : undefined,
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
              {/* 复制代码按钮 / Copy code button */}
              <Copy
                theme='outline'
                size='18'
                style={{ cursor: 'pointer' }}
                fill='var(--text-secondary)'
                onClick={() => {
                  void navigator.clipboard.writeText(formatCode(children)).then(() => {
                    Message.success('复制成功');
                  });
                }}
              />
              {/* 折叠/展开按钮 / Fold/unfold button */}
              {logicRender(!fold, <Up theme='outline' size='20' style={{ cursor: 'pointer' }} fill='var(--text-secondary)' onClick={() => setFlow(true)} />, <Down theme='outline' size='20' style={{ cursor: 'pointer' }} fill='var(--text-secondary)' onClick={() => setFlow(false)} />)}
            </div>
          </div>
          {logicRender(
            !fold,
            <SyntaxHighlighter
              children={formatCode(children)}
              language={language}
              style={codeTheme}
              PreTag='div'
              customStyle={{
                marginTop: '0',
                margin: '0',
                borderTopLeftRadius: '0',
                borderTopRightRadius: '0',
                borderBottomLeftRadius: '0.3rem',
                borderBottomRightRadius: '0.3rem',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
              }}
              codeTagProps={{
                style: {
                  color: 'var(--text-primary)',
                },
              }}
            />
          )}
        </div>
      </div>
    );
  }, [props, currentTheme, fold]);
}

const createInitStyle = (currentTheme = 'light', cssVars?: Record<string, string>, customCss?: string) => {
  const style = document.createElement('style');
  // 将外部 CSS 变量注入到 Shadow DOM 中，支持深色模式 Inject external CSS variables into Shadow DOM for dark mode support
  const cssVarsDeclaration = cssVars
    ? Object.entries(cssVars)
        .map(([key, value]) => `${key}: ${value};`)
        .join('\n    ')
    : '';

  style.innerHTML = `
  /* Shadow DOM CSS 变量定义 Shadow DOM CSS variable definitions */
  :host {
    ${cssVarsDeclaration}
  }

  * {
    line-height:26px;
    font-size:14px;
  }

  .markdown-shadow-body {
    word-break: break-word;
    overflow-wrap: anywhere;
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
 
  .markdown-shadow-body>p:last-child{
    margin-bottom:0px;
  }
  ol {
    padding-inline-start:20px;
  }
  img {
    max-width: 100%;
  }
   /* 给整个表格添加边框 */
  table {
    border-collapse: collapse;  /* 表格边框合并为单一边框 */
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

  /* 用户自定义 CSS（注入到 Shadow DOM）User Custom CSS (injected into Shadow DOM) */
  ${customCss || ''}
  `;
  return style;
};

const ShadowView = ({ children }: { children: React.ReactNode }) => {
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const styleRef = React.useRef<HTMLStyleElement | null>(null);
  const [customCss, setCustomCss] = useState<string>('');

  // 从 ConfigStorage 加载自定义 CSS / Load custom CSS from ConfigStorage
  React.useEffect(() => {
    void import('@/common/storage').then(({ ConfigStorage }) => {
      ConfigStorage.get('customCss')
        .then((css) => {
          if (css) {
            // 使用统一的工具函数自动添加 !important
            const processedCss = addImportantToAll(css);
            setCustomCss(processedCss);
          } else {
            setCustomCss('');
          }
        })
        .catch((error) => {
          console.error('Failed to load custom CSS:', error);
        });
    });

    // 监听自定义 CSS 更新事件 / Listen to custom CSS update events
    const handleCustomCssUpdate = (e: CustomEvent) => {
      if (e.detail?.customCss !== undefined) {
        const css = e.detail.customCss || '';
        // 使用统一的工具函数自动添加 !important
        const processedCss = addImportantToAll(css);
        setCustomCss(processedCss);
      }
    };

    window.addEventListener('custom-css-updated', handleCustomCssUpdate as EventListener);

    return () => {
      window.removeEventListener('custom-css-updated', handleCustomCssUpdate as EventListener);
    };
  }, []);

  // 更新 Shadow DOM 中的 CSS 变量和自定义样式 Update CSS variables and custom styles in Shadow DOM
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
      };

      // 移除旧样式并添加新样式 Remove old style and add new style
      if (styleRef.current) {
        styleRef.current.remove();
      }
      const newStyle = createInitStyle(currentTheme, cssVars, customCss);
      styleRef.current = newStyle;
      shadowRoot.appendChild(newStyle);
    },
    [customCss]
  );

  React.useEffect(() => {
    if (!root) return;

    // 当自定义 CSS 变化时，更新样式 Update styles when custom CSS changes
    updateStyles(root);
  }, [root, customCss, updateStyles]);

  React.useEffect(() => {
    if (!root) return;

    // 监听主题变化 Listen for theme changes
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
      ref={(el: any) => {
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

interface MarkdownViewProps {
  children: string;
  hiddenCodeCopyButton?: boolean;
  codeStyle?: React.CSSProperties;
  className?: string;
  onRef?: (el?: HTMLDivElement | null) => void;
}

const MarkdownView: React.FC<MarkdownViewProps> = ({ hiddenCodeCopyButton, codeStyle, className, onRef, children: childrenProp }) => {
  const { t } = useTranslation();

  const normalizedChildren = useMemo(() => {
    if (typeof childrenProp === 'string') {
      return childrenProp.replace(/file:\/\//g, '');
    }
    return childrenProp;
  }, [childrenProp]);

  const isLocalFilePath = (src: string): boolean => {
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return false;
    }
    if (src.startsWith('data:')) {
      return false;
    }
    return true;
  };

  return (
    <div className={classNames('relative w-full', className)}>
      <ShadowView>
        <div ref={onRef} className='markdown-shadow-body'>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
            rehypePlugins={[rehypeKatex]}
            components={{
              code: (props: any) => CodeBlock({ ...props, codeStyle, hiddenCodeCopyButton }),
              a: ({ node: _node, ...props }) => (
                <a
                  {...props}
                  target='_blank'
                  rel='noreferrer'
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!props.href) return;
                    try {
                      ipcBridge.shell.openExternal.invoke(props.href).catch((error) => {
                        console.error(t('messages.openLinkFailed'), error);
                      });
                    } catch (error) {
                      console.error(t('messages.openLinkFailed'), error);
                    }
                  }}
                />
              ),
              table: ({ node: _node, ...props }) => (
                <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                  <table
                    {...props}
                    style={{
                      ...props.style,
                      borderCollapse: 'collapse',
                      border: '1px solid var(--bg-3)',
                      minWidth: '100%',
                    }}
                  />
                </div>
              ),
              td: ({ node: _node, ...props }) => (
                <td
                  {...props}
                  style={{
                    ...props.style,
                    padding: '8px',
                    border: '1px solid var(--bg-3)',
                    minWidth: '120px',
                  }}
                />
              ),
              img: ({ node: _node, ...props }) => {
                if (isLocalFilePath(props.src || '')) {
                  const src = decodeURIComponent(props.src || '');
                  return <LocalImageView src={src} alt={props.alt || ''} className={props.className} />;
                }
                return <img {...props} />;
              },
            }}
          >
            {normalizedChildren}
          </ReactMarkdown>
        </div>
      </ShadowView>
    </div>
  );
};

export default MarkdownView;
