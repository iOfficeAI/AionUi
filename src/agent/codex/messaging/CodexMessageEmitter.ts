/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/ipcBridge';

/**
 * 消息发送回调接口
 * 用于解耦各个处理器对 IResponseMessage 的直接依赖
 */
export interface ICodexMessageEmitter {
  /**
   * 发送消息并持久化
   * @param message 要发送的消息
   * @param persist 是否需要持久化，默认true
   */
  emitAndPersistMessage(message: IResponseMessage, persist?: boolean): void;
}
