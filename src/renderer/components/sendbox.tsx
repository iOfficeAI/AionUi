/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Message } from "@arco-design/web-react";
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp } from "@icon-park/react";

const constVoid = (): void => undefined;

const SendBox: React.FC<{
  value?: string;
  onChange?: (value: string) => void;
  onSend: (message: string) => Promise<void>;
  onStop?: () => Promise<void>;
  loading?: boolean;
  className?: string;
  tools?: React.ReactNode;
  prefix?: React.ReactNode;
}> = ({ onSend, onStop, prefix, className, loading, tools, value: input = "", onChange: setInput = constVoid }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const [message, context] = Message.useMessage();

  const isComposing = useRef(false);

  const sendMessageHandler = () => {
    if (loading || isLoading) {
      message.warning(t("messages.conversationInProgress"));
      return;
    }
    if (!input.trim()) return;
    setIsLoading(true);
    onSend(input)
      .then(() => {
        setInput("");
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

  return (
    <div className={`mb-16px  ${className}`}>
      <div className="p-12px b-#E5E6EB b bg-white b-solid rd-20px  focus-within:shadow-[0px_2px_20px_rgba(77,60,234,0.1)] ">
        {prefix}
        {context}
        <Input.TextArea
          value={input}
          className="!b-none   focus:shadow-none flex-1 !pl-0px m-0 !bg-transparent !focus:bg-transparent !hover:bg-transparent lh-[16px] !resize-none"
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
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessageHandler();
            }
          }}
        ></Input.TextArea>
        <div className="flex items-center justify-between gap-2 ">
          <span>{tools}</span>
          <div className="flex items-center gap-2">
            {isLoading || loading ? (
              // <Loading
              //   theme="outline"
              //   className="loading lh-[1] flex"
              //   size={18}
              //   onClick={stopHandler}
              // />
              <Button
                shape="circle"
                type="secondary"
                className="bg-animate"
                icon={
                  <div
                    className="mx-auto size-12px bg-#86909C"
                    onClick={stopHandler}
                  ></div>
                }
              ></Button>
            ) : (
              <Button
                shape="circle"
                type="primary"
                icon={
                  <ArrowUp
                    theme="outline"
                    size="14"
                    fill="white"
                    strokeWidth={2}
                  />
                }
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
