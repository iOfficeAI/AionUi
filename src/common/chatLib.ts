/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from "./ipcBridge";
import { uuid } from "./utils";

/**
 * @description 跟对话相关的消息类型申明 及相关处理
 */

type TMessageType = "text" | "tips" | "tool_call" | "tool_group";

interface IMessage<
  T extends TMessageType,
  Content extends Record<string, any>
> {
  /**
   * 唯一ID
   */
  id: string;
  /**
   * 消息来源ID，
   */
  msg_id?: string;

  //消息会话ID
  conversation_id: string;
  /**
   * 消息类型
   */
  type: T;
  /**
   * 消息内容
   */
  content: Content;
  /**
   * 消息创建时间
   */
  createdAt?: number;
  /**
   * 消息位置
   */
  position?: "left" | "right" | "center" | "pop";
  /**
   * 消息状态
   */
  status?: "finish" | "pending" | "error" | "work";
}

export type IMessageText = IMessage<"text", { content: string }>;

export type IMessageTips = IMessage<
  "tips",
  { content: string; type: "error" | "success" | "warning" }
>;

export type IMessageToolCall = IMessage<
  "tool_call",
  {
    callId: string;
    name: string;
    args: Record<string, any>;
    error?: string;
    status?: "success" | "error";
  }
>;

type IMessageToolGroupConfirmationDetailsBase<
  Type,
  Extra extends Record<string, any>
> = {
  type: Type;
  title: string;
} & Extra;

export type IMessageToolGroup = IMessage<
  "tool_group",
  Array<{
    callId: string;
    description: string;
    name: "GoogleSearch" | "Shell" | "WriteFile" | "ReadFile";
    renderOutputAsMarkdown: boolean;
    resultDisplay?:
      | string
      | {
          fileDiff: string;
          fileName: string;
        };
    status:
      | "Executing"
      | "Success"
      | "Error"
      | "Canceled"
      | "Pending"
      | "Confirming";
    confirmationDetails?:
      | IMessageToolGroupConfirmationDetailsBase<
          "edit",
          {
            fileName: string;
            fileDiff: string;
            isModifying?: boolean;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          "exec",
          {
            rootCommand: string;
            command: string;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          "info",
          {
            urls: string[];
            prompt: string;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          "mcp",
          {
            toolName: string;
            toolDisplayName: string;
            serverName: string;
          }
        >;
  }>
>;

export type TMessage =
  | IMessageText
  | IMessageTips
  | IMessageToolCall
  | IMessageToolGroup;

/**
 * @description 将后端返回的消息转换为前端消息
 * */
export const transformMessage = (message: IResponseMessage): TMessage => {
  switch (message.type) {
    case "error": {
      return {
        id: uuid(),
        type: "tips",
        msg_id: message.msg_id,
        position: "center",
        conversation_id: message.conversation_id,
        content: {
          content: message.data,
          type: "error",
        },
      };
    }
    case "content": {
      return {
        id: uuid(),
        type: "text",
        msg_id: message.msg_id,
        position: "left",
        conversation_id: message.conversation_id,
        content: {
          content: message.data,
        },
      };
    }
    case "tool_call": {
      return {
        id: uuid(),
        type: "tool_call",
        msg_id: message.msg_id,
        conversation_id: message.conversation_id,
        position: "left",
        content: message.data,
      };
    }
    case "tool_group": {
      return {
        type: "tool_group",
        id: uuid(),
        msg_id: message.msg_id,
        conversation_id: message.conversation_id,
        content: message.data,
      };
    }
    case "start":
    case "finish":
    case "thought":
      break;
    default:
      return {
        type: message.type,
        content: message.data,
        position: "left",
        id: uuid(),
      } as any;
      break;
  }
};

/**
 * @description 将消息合并到消息列表中
 * */
export const composeMessage = (
  message: TMessage | undefined,
  list: TMessage[] | undefined
): TMessage[] => {
  if (!message) return list || [];
  if (!list?.length) return [message];
  const last = list[list.length - 1];

  if (message.type === "tool_group") {
    const tools = message.content.slice();
    for (let i = 0, len = list.length; i < len; i++) {
      const message = list[i];
      if (message.type === "tool_group") {
        if (!message.content.length) continue;
        message.content.forEach((tool) => {
          const newToolIndex = tools.findIndex((t) => t.callId === tool.callId);
          if (newToolIndex === -1) return;
          Object.assign(tool, tools[newToolIndex]);
          tools.splice(newToolIndex, 1);
        });
      }
    }
    if (tools.length) {
      message.content = tools;
      list.push(message);
    }
    return list;
  }

  if (last.msg_id !== message.msg_id || last.type !== message.type)
    return list.concat(message);
  if (message.type === "text" && last.type === "text") {
    message.content.content = last.content.content + message.content.content;
  }
  Object.assign(last, message);
  return list;
};
