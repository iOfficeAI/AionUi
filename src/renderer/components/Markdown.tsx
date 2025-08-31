/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ReactMarkdown from 'react-markdown';

import SyntaxHighlighter from 'react-syntax-highlighter';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
// import { coy } from "react-syntax-highlighter/dist/esm/styles/prism";

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
  return useMemo(() => {
    const { children, className, node: _node, hiddenCodeCopyButton: _hiddenCodeCopyButton, ...rest } = props;
    const match = /language-(\w+)/.exec(className || '');
    const language = match?.[1] || 'text';
    if (!String(children).includes('\n')) {
      return (
        <code
          {...rest}
          className={className}
          style={{
            backgroundColor: '#f1f1f1',
            padding: '2px 4px',
            margin: '0 4px',
            borderRadius: '4px',
            border: '1px solid',
            borderColor: '#ddd',
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
            width: '100%',
            alignItems: 'center',
            backgroundColor: '#dcdcdc', // "rgb(50, 50, 50)",
            borderTopLeftRadius: '0.3rem',
            borderTopRightRadius: '0.3rem',
            borderBottomLeftRadius: '0',
            borderBottomRightRadius: '0',
          }}
        >
          <span
            style={{
              textDecoration: 'none',
              color: 'gray',
              padding: '2px',
              margin: '2px 10px 0 10px',
            }}
          >
            {'<' + language.toLocaleLowerCase() + '>'}
          </span>
          <div style={{ marginRight: 10, paddingTop: 2 }}>{logicRender(!fold, <Up theme='outline' size='24' style={{ cursor: 'pointer' }} fill='gray' onClick={() => setFlow(true)} />, <Down theme='outline' size='24' style={{ cursor: 'pointer' }} fill='gray' onClick={() => setFlow(false)} />)}</div>
        </div>
        {logicRender(
          !fold,
          <SyntaxHighlighter
            children={formatCode(children)}
            language={language}
            // style={coy}
            PreTag='div'
            customStyle={{
              marginTop: '0',
              margin: '0',
              borderTopLeftRadius: '0',
              borderTopRightRadius: '0',
              borderBottomLeftRadius: '0.3rem',
              borderBottomRightRadius: '0.3rem',
              border: 'none',
            }}
          />
        )}
      </div>
    );
  }, [props]);
}

const createInitStyle = (currentTheme = 'light') => {
  const style = document.createElement('style');
  style.innerHTML = `
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
      border: 1px solid #ddd;
      background-color: #f5f5f5;
      font-weight: bold;
    }
    td{
        padding: 8px;
        border: 1px solid #ddd;
        min-width: 120px;
    }
  }
  
  /* 暗色主题下保护图片不被反转 */
  ${
    currentTheme === 'dark'
      ? `
    img, video, canvas, svg {
      filter: invert(1) hue-rotate(180deg);
    }
  `
      : ''
  }
  `;
  return style;
};

const ShadowView = ({ children }: { children: React.ReactNode }) => {
  const [root, setRoot] = useState(null);
  return (
    <div
      ref={(el: any) => {
        if (!el || el.__init__shadow) return;
        el.__init__shadow = true;
        const shadowRoot = el.attachShadow({ mode: 'open' });
        // 获取当前主题并传递给 Shadow DOM
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        shadowRoot.appendChild(createInitStyle(currentTheme));
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
  workspace?: string;
}> = ({ hiddenCodeCopyButton, codeStyle, workspace, ...props }) => {
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

  const isAbsolutePath = (path: string): boolean => {
    return path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path);
  };

  const joinPath = (basePath: string, relativePath: string): string => {
    // 安全的路径拼接，保持相对路径的语义
    const cleanBase = basePath.replace(/[/\\]+$/, ''); // 去掉末尾斜杠

    // 只去掉单个 ./ 开头，保留 ../ 的语义
    let cleanRelative = relativePath;
    if (cleanRelative.startsWith('./')) {
      cleanRelative = cleanRelative.slice(2);
    }

    return `${cleanBase}/${cleanRelative}`.replace(/\\/g, '/');
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
                    ipcBridge.shell.openExternal.invoke(props.href);
                  } catch (error) {
                    console.error(t('messages.openLinkFailed'), error);
                  }
                }}
              />
            ),
            table: ({ node: _node, ...props }) => (
              <div style={{ overflowX: 'auto', maxWidth: 'calc(100vw - 32px)' }}>
                <table
                  {...props}
                  style={{
                    ...props.style,
                    borderCollapse: 'collapse',
                    border: '1px solid #ddd',
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
                  border: '1px solid #ddd',
                  minWidth: '120px',
                }}
              />
            ),
            img: ({ node: _node, ...props }) => {
              // 判断是否为本地文件路径
              if (isLocalFilePath(props.src || '')) {
                const src = decodeURIComponent(props.src || '');
                // 如果是相对路径且有workspace，则拼接绝对路径
                const fullPath = workspace && src && !isAbsolutePath(src) ? joinPath(workspace, src) : src;
                return <LocalImageView src={fullPath} alt={props.alt || ''} className={props.className} />;
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
