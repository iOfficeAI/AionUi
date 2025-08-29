/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Message } from '@arco-design/web-react';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const constVoid = (): void => undefined;

const SendIcon: React.FC = () => (
  <span className='arco-icon inline-flex items-center justify-center' style={{ width: 20, height: 20, lineHeight: 0 }}>
    <svg width='20' height='20' viewBox='0 0 21 20' fill='none' xmlns='http://www.w3.org/2000/svg' style={{ display: 'block', transform: 'translateY(2px)' }}>
      <path d='M10.5 15.834L10.5 4.16732' stroke='white' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'/>
      <path d='M4.50008 9.83398L10.3334 4.00065L16.1667 9.83398' stroke='white' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'/>
    </svg>
  </span>
);

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
}> = ({ onSend, onStop, prefix, className, loading, tools, disabled, placeholder, value: input = '', onChange: setInput = constVoid }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const [message, context] = Message.useMessage();

  const isComposing = useRef(false);

  const sendMessageHandler = () => {
    if (loading || isLoading) {
      message.warning(t('messages.conversationInProgress'));
      return;
    }
    if (!input.trim()) return;
    setIsLoading(true);
    onSend(input)
      .then(() => {
        setInput('');
      })
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

  const hasPrefix = !!prefix && React.Children.count(prefix) > 0;
  return (
    <div className={`mb-16px  ${className}`}>
      <div className='p-16px b-#E5E6EB b bg-white b-solid rd-20px  focus-within:shadow-[0px_2px_20px_rgba(77,60,234,0.1)] '>
        {hasPrefix && <div className='flex flex-wrap items-center gap-6px mb-8px'>
          {prefix}
        </div>}
        {context}
        <Input.TextArea
          disabled={disabled}
          value={input}
          placeholder={placeholder}
          className='!b-none   focus:shadow-none flex-1 m-0 !bg-transparent !focus:bg-transparent !hover:bg-transparent lh-[20px] !resize-none text-14px'
          onChange={(v) => {
            setInput(v);
          }}
          onCompositionStartCapture={() => {
            isComposing.current = true;
          }}
          autoSize={{ minRows: 1, maxRows: 10 }}
          onCompositionEndCapture={() => {
            isComposing.current = false;
          }}
          onKeyDown={(e) => {
            if (isComposing.current) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessageHandler();
            }
          }}
        ></Input.TextArea>
        <div className='flex items-center justify-between gap-8px mt-8px'>
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
                icon={<SendIcon />}
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
