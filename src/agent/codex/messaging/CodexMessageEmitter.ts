/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/ipcBridge';
import type { TMessage } from '@/common/chatLib';

/**
 * 消息发送回调接口
 * 用于解耦各个处理器对消息分发和持久化的直接依赖
 */
export interface ICodexMessageEmitter {
  /**
   * 发送消息到前端并根据需要持久化
   * @param message 要发送的消息 (IResponseMessage 格式)
   * @param persist 是否需要持久化，默认true
   */
  emitAndPersistMessage(message: IResponseMessage, persist?: boolean): void;

  /**
   * 直接持久化消息到数据库（不发送到前端）
   * @param message 要持久化的消息 (TMessage 格式)
   */
  persistMessage(message: TMessage): void;
}
