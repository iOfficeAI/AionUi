/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Message } from '@arco-design/web-react';
import { ArrowUp } from '@icon-park/react';
import React, { useState } from 'react';
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
    const messageToSend = input;
    // 立即清空输入框，提供更好的用户体验
    setInput('');
    onSend(messageToSend)
      .catch((error) => {
        // 如果发送失败，恢复输入内容
        console.error('Failed to send message:', error);
        setInput(messageToSend);
      })
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
        className={`relative p-16px border-3 b bg-base b-solid rd-20px focus-within:shadow-[0px_2px_20px_rgba(77,60,234,0.1)] ${isFileDragging ? 'b-dashed' : ''}`}
        style={
          isFileDragging
            ? {
                backgroundColor: 'var(--color-primary-light-1)',
                borderColor: 'rgb(var(--primary-3))',
              }
            : undefined
        }
        {...dragHandlers}
      >
        {prefix}
        {context}
        <Input.TextArea
          disabled={disabled}
          value={input}
          placeholder={placeholder}
          className='!b-none   focus:shadow-none flex-1 m-0 !bg-transparent !focus:bg-transparent !hover:bg-transparent lh-[20px] !resize-none text-14px'
          onChange={(v) => {
            setInput(v);
          }}
          onPaste={onPaste}
          onFocus={onFocus}
          {...compositionHandlers}
          autoSize={{ minRows: 1, maxRows: 10 }}
          onKeyDown={createKeyDownHandler(sendMessageHandler)}
        ></Input.TextArea>
        <div className='flex items-center justify-between gap-2 '>
          <span>{tools}</span>
          <div className='flex items-center gap-2'>
            {isLoading || loading ? (
              // <Loading
              //   theme="outline"
              //   className="loading lh-[1] flex"
              //   size={18}
              //   onClick={stopHandler}
              // />
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
              // <Send
              //   theme="filled"
              //   size={18}
              //   onClick={() => {
              //     sendMessageHandler();
              //   }}
              //   fill={
              //     input
              //       ? theme.Color.BrandColor["brand-6"]
              //       : theme.Color.NeutralColor["grey-8"]
              //   }
              // />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SendBox;
