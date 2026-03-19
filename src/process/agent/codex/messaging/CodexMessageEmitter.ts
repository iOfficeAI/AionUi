/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/ipcBridge';
import type { TMessage, IConfirmation } from '@/common/chatLib';

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

  /**
   * 添加确认项到确认列表（通过 BaseAgentManager 管理）
   * @param data 确认项数据
   */
  addConfirmation(data: IConfirmation): void;

  /**
   * 发送消息回 AI agent（用于系统响应反馈）
   * @param content 要发送的消息内容
   */
  sendMessageToAgent?(content: string): Promise<void>;

  // ===== ApprovalStore integration =====

  /**
   * Check if an exec command has been approved for session (from ApprovalStore cache)
   * @returns true if auto-approve should be used, false if user confirmation needed
   */
  checkExecApproval?(command: string | string[], cwd?: string): boolean;

  /**
   * Check if file changes have been approved for session (from ApprovalStore cache)
   * @returns true if auto-approve should be used, false if user confirmation needed
   */
  checkPatchApproval?(files: string[]): boolean;

  /**
   * Check if an exec command has been rejected for session (from ApprovalStore cache)
   * @returns true if auto-reject should be used, false if user confirmation needed
   */
  checkExecRejection?(command: string | string[], cwd?: string): boolean;

  /**
   * Check if file changes have been rejected for session (from ApprovalStore cache)
   * @returns true if auto-reject should be used, false if user confirmation needed
   */
  checkPatchRejection?(files: string[]): boolean;

  /**
   * Auto-confirm a permission request (used when ApprovalStore has cached approval/rejection)
   * @param callId The call ID to auto-confirm
   * @param decision The decision to send ('allow_always' or 'reject_always')
   */
  autoConfirm?(callId: string, decision: string): void;
}
