/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Message } from '@arco-design/web-react';
import { ArrowUp } from '@icon-park/react';
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCompositionInput } from '../hooks/useCompositionInput';
import { useDragUpload } from '../hooks/useDragUpload';
import { usePasteService } from '../hooks/usePasteService';
import type { FileMetadata } from '../services/FileService';
import { allSupportedExts } from '../services/FileService';

const constVoid = (): void => undefined;

const SendBox: React.FC<{
  value?: string;
  onChange?: (value: string) => void;
  onSend: (message: string) => Promise<void>;
  onStop?: () => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  tools?: React.ReactNode;
  prefix?: React.ReactNode;
  placeholder?: string;
  onFilesAdded?: (files: FileMetadata[]) => void;
  supportedExts?: string[];
}> = ({ onSend, onStop, prefix, className, loading, tools, disabled, placeholder, value: input = '', onChange: setInput = constVoid, onFilesAdded, supportedExts = allSupportedExts }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isSingleLine, setIsSingleLine] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const singleLineWidthRef = useRef<number>(0);

  // 初始化时获取单行输入框的可用宽度
  // Initialize and get the available width of single-line input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current && singleLineWidthRef.current === 0) {
        const textarea = containerRef.current.querySelector('textarea');
        if (textarea) {
          // 保存单行模式下的可用宽度作为固定基准
          // Save the available width in single-line mode as a fixed baseline
          singleLineWidthRef.current = textarea.offsetWidth;
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 检测是否单行
  // Detect whether to use single-line or multi-line mode
  useEffect(() => {
    // 有换行符直接多行
    // Switch to multi-line mode if newline character exists
    if (input.includes('\n')) {
      setIsSingleLine(false);
      return;
    }

    // 还没获取到基准宽度时不做判断
    // Skip detection if baseline width is not yet obtained
    if (singleLineWidthRef.current === 0) {
      return;
    }

    // 检测内容宽度
    // Detect content width
    const timer = setTimeout(() => {
      if (containerRef.current) {
        const textarea = containerRef.current.querySelector('textarea');
        if (textarea) {
          // 创建一个临时元素来测量文本真实宽度
          // Create a temporary element to measure the actual text width
          const span = document.createElement('span');
          span.style.cssText = `
            position: absolute;
            visibility: hidden;
            white-space: nowrap;
            font-size: 14px;
            font-family: ${getComputedStyle(textarea).fontFamily};
          `;
          span.textContent = input || '';
          document.body.appendChild(span);

          const textWidth = span.offsetWidth;
          document.body.removeChild(span);

          // 使用初始化时保存的固定宽度作为判断基准
          // Use the fixed baseline width saved during initialization
          const baseWidth = singleLineWidthRef.current;

          // 文本宽度超过基准宽度时切换到多行
          // Switch to multi-line when text width exceeds baseline width
          if (textWidth >= baseWidth) {
            setIsSingleLine(false);
          } else if (textWidth < baseWidth - 30) {
            // 文本宽度小于基准宽度减30px时切回单行，留出小缓冲区避免临界点抖动
            // Switch back to single-line when text width is less than baseline minus 30px, leaving a small buffer to avoid flickering at the threshold
            setIsSingleLine(true);
          }
          // 在 (baseWidth-30) 到 baseWidth 之间保持当前状态
          // Maintain current state between (baseWidth-30) and baseWidth
        }
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [input]);

  // 使用拖拽 hook
  const { isFileDragging, dragHandlers } = useDragUpload({
    supportedExts,
    onFilesAdded,
  });

  const [message, context] = Message.useMessage();

  // 使用共享的输入法合成处理
  const { compositionHandlers, createKeyDownHandler } = useCompositionInput();

  // 使用共享的PasteService集成
  const { onPaste, onFocus } = usePasteService({
    supportedExts,
    onFilesAdded,
    onTextPaste: (text: string) => {
      // 处理清理后的文本粘贴，在当前光标位置插入文本而不是替换整个内容
      const textarea = document.activeElement as HTMLTextAreaElement;
      if (textarea && textarea.tagName === 'TEXTAREA') {
        const cursorPosition = textarea.selectionStart;
        const currentValue = textarea.value;
        const newValue = currentValue.slice(0, cursorPosition) + text + currentValue.slice(cursorPosition);
        setInput(newValue);
        // 设置光标到插入文本后的位置
        setTimeout(() => {
          textarea.setSelectionRange(cursorPosition + text.length, cursorPosition + text.length);
        }, 0);
      } else {
        // 如果无法获取光标位置，回退到追加到末尾的行为
        setInput(text);
      }
    },
  });

  const sendMessageHandler = () => {
    if (loading || isLoading) {
      message.warning(t('messages.conversationInProgress'));
      return;
    }
    if (!input.trim()) {
      return;
    }
    setIsLoading(true);
    onSend(input)
      .then(() => {
        setInput('');
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
      });
  };

  const stopHandler = async () => {
    if (!onStop) return;
    try {
      await onStop();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className={`relative p-16px border-3 b bg-base b-solid rd-20px flex flex-col ${isFileDragging ? 'b-dashed' : ''}`}
        style={{
          ...(isFileDragging
            ? {
                backgroundColor: 'var(--color-primary-light-1)',
                borderColor: 'rgb(var(--primary-3))',
              }
            : {
                boxShadow: '0px 2px 20px rgba(var(--primary-rgb, 77, 60, 234), 0.1)',
              }),
        }}
        {...dragHandlers}
      >
        <div style={{ width: '100%' }}>
          {prefix}
          {context}
        </div>
        <div className={isSingleLine ? 'flex items-center gap-2 w-full' : 'w-full'}>
          {isSingleLine && <span className='flex-shrink-0'>{tools}</span>}
          <Input.TextArea
            autoFocus
            disabled={disabled}
            value={input}
            placeholder={placeholder}
            className='pl-0 pr-0 !b-none focus:shadow-none m-0 !bg-transparent !focus:bg-transparent !hover:bg-transparent lh-[20px] !resize-none text-14px'
            style={{
              width: isSingleLine ? 'auto' : '100%',
              flex: isSingleLine ? 1 : 'none',
              minWidth: isSingleLine ? '200px' : 0,
              maxWidth: '100%',
              marginLeft: 0,
              marginRight: 0,
              marginBottom: isSingleLine ? 0 : '8px',
              height: isSingleLine ? '20px' : 'auto',
              overflowY: isSingleLine ? 'hidden' : 'auto',
              overflowX: 'hidden',
              whiteSpace: isSingleLine ? 'nowrap' : 'pre-wrap',
              textOverflow: isSingleLine ? 'ellipsis' : 'clip',
            }}
            onChange={(v) => {
              setInput(v);
            }}
            onPaste={onPaste}
            onFocus={onFocus}
            {...compositionHandlers}
            autoSize={isSingleLine ? false : { minRows: 1, maxRows: 10 }}
            onKeyDown={createKeyDownHandler(sendMessageHandler)}
          ></Input.TextArea>
          {isSingleLine && (
            <div className='flex items-center gap-2'>
              {isLoading || loading ? (
                <Button shape='circle' type='secondary' className='bg-animate' icon={<div className='mx-auto size-12px bg-6' onClick={stopHandler}></div>}></Button>
              ) : (
                <Button
                  shape='circle'
                  type='primary'
                  icon={<ArrowUp theme='outline' size='14' fill='white' strokeWidth={2} />}
                  onClick={() => {
                    sendMessageHandler();
                  }}
                />
              )}
            </div>
          )}
        </div>
        {!isSingleLine && (
          <div className='flex items-center justify-between gap-2 w-full'>
            <span>{tools}</span>
            <div className='flex items-center gap-2'>
              {isLoading || loading ? (
                <Button shape='circle' type='secondary' className='bg-animate' icon={<div className='mx-auto size-12px bg-6' onClick={stopHandler}></div>}></Button>
              ) : (
                <Button
                  shape='circle'
                  type='primary'
                  icon={<ArrowUp theme='outline' size='14' fill='white' strokeWidth={2} />}
                  onClick={() => {
                    sendMessageHandler();
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SendBox;
