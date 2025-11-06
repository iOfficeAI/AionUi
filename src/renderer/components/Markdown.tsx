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
import { Down, Up } from '@icon-park/react';
import { theme } from '@office-ai/platform';
import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import LocalImageView from './LocalImageView';

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
    const { children, className, node: _node, hiddenCodeCopyButton: _hiddenCodeCopyButton, ...rest } = props;
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
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <div style={props.codeStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-2)',
            borderTopLeftRadius: '0.3rem',
            borderTopRightRadius: '0.3rem',
            borderBottomLeftRadius: '0',
            borderBottomRightRadius: '0',
            padding: '6px 10px',
            border: '1px solid var(--bg-3)',
            borderBottom: 'none',
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
          <div style={{ display: 'flex', alignItems: 'center' }}>{logicRender(!fold, <Up theme='outline' size='20' style={{ cursor: 'pointer' }} fill='var(--text-secondary)' onClick={() => setFlow(true)} />, <Down theme='outline' size='20' style={{ cursor: 'pointer' }} fill='var(--text-secondary)' onClick={() => setFlow(false)} />)}</div>
        </div>
        {logicRender(
          !fold,
          <div
            style={{
              backgroundColor: 'var(--bg-1)',
              borderBottomLeftRadius: '0.3rem',
              borderBottomRightRadius: '0.3rem',
              border: '1px solid var(--bg-3)',
              borderTop: 'none',
            }}
          >
            <SyntaxHighlighter
              children={formatCode(children)}
              language={language}
              style={codeTheme}
              PreTag='div'
              customStyle={{
                marginTop: '0',
                margin: '0',
                padding: '10px',
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
          </div>
        )}
      </div>
    );
  }, [props, currentTheme, fold]);
}

const createInitStyle = (currentTheme = 'light', cssVars?: Record<string, string>) => {
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

  .markdown-shadow-body>p:first-child
  {
    margin-top:0px;
  }
  h1,h2,h3,h4,h5,h6,p,pre{
    margin-block-start:0px;
    margin-block-end:0px;
  }
  pre > div {
    margin-left: 0 !important;
  }
  a{
    color:${theme.Color.PrimaryColor};
     text-decoration: none;
     cursor: pointer;
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
  `;
  return style;
};

const ShadowView = ({ children }: { children: React.ReactNode }) => {
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const styleRef = React.useRef<HTMLStyleElement | null>(null);

  // 更新 Shadow DOM 中的 CSS 变量 Update CSS variables in Shadow DOM
  const updateCSSVars = React.useCallback((shadowRoot: ShadowRoot) => {
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
    const newStyle = createInitStyle(currentTheme, cssVars);
    styleRef.current = newStyle;
    shadowRoot.appendChild(newStyle);
  }, []);

  React.useEffect(() => {
    if (!root) return;

    // 监听主题变化 Listen for theme changes
    const observer = new MutationObserver(() => {
      updateCSSVars(root);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

    return () => observer.disconnect();
  }, [root, updateCSSVars]);

  return (
    <div
      ref={(el: any) => {
        if (!el || el.__init__shadow) return;
        el.__init__shadow = true;
        const shadowRoot = el.attachShadow({ mode: 'open' });
        updateCSSVars(shadowRoot);
        setRoot(shadowRoot);
      }}
      className='markdown-shadow'
      style={{ width: '100%' }}
    >
      {root && ReactDOM.createPortal(children, root)}
    </div>
  );
};

const MarkdownView: React.FC<{
  children: string;
  hiddenCodeCopyButton?: boolean;
  codeStyle?: React.CSSProperties;
  className?: string;
  onRef?: (el?: HTMLDivElement | null) => void;
}> = ({ hiddenCodeCopyButton, codeStyle, ...props }) => {
  const { t } = useTranslation();
  const children = useMemo(() => {
    if (typeof props.children === 'string') {
      return props.children.replace(/file:\/\//g, '');
    }
    return props.children;
  }, [props.children]);

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
    <ShadowView>
      <div ref={props.onRef} className='markdown-shadow-body'>
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
              // 判断是否为本地文件路径
              if (isLocalFilePath(props.src || '')) {
                const src = decodeURIComponent(props.src || '');
                return <LocalImageView src={src} alt={props.alt || ''} className={props.className} />;
              }
              // 否则使用普通的 img 标签
              return <img {...props} />;
            },
          }}
        >
          {children}
        </ReactMarkdown>
      </div>
    </ShadowView>
  );
};

export default MarkdownView;
