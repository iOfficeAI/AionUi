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
      // 处理清理后的文本粘贴，替换整个输入内容
      setInput(text);
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

  const stopHandler = () => {
    if (!onStop) return;
    onStop().then(() => {
      setIsLoading(false);
    });
  };

  return (
    <div className={`mb-16px  ${className}`}>
      <div className={`relative p-16px b-#E5E6EB b bg-white b-solid rd-20px  focus-within:shadow-[0px_2px_20px_rgba(77,60,234,0.1)] ${isFileDragging ? 'bg-blue-50 b-blue-300 b-dashed' : ''}`} {...dragHandlers}>
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
              <Button shape='circle' type='secondary' className='bg-animate' icon={<div className='mx-auto size-12px bg-#86909C' onClick={stopHandler}></div>}></Button>
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
