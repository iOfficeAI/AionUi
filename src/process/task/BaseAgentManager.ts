/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ForkTask } from '@/worker/fork/ForkTask';
import path from 'path';
import { ipcBridge } from '../../common';
import type { IConfirmation } from '../../common/chatLib';

type AgentType = 'gemini' | 'acp' | 'codex' | 'openclaw-gateway';

/**
 * @description agent任务基础类
 * */
class BaseAgentManager<Data, ConfirmationOption extends any = any> extends ForkTask<{
  type: AgentType;
  data: Data;
}> {
  type: AgentType;
  protected conversation_id: string;
  protected confirmations: Array<IConfirmation<ConfirmationOption>> = [];
  status: 'pending' | 'running' | 'finished' | undefined;
  constructor(type: AgentType, data: Data) {
    super(path.resolve(__dirname, type + '.js'), {
      type: type,
      data: data,
    });
    this.type = type;
  }
  protected init(): void {
    super.init();
  }
  protected addConfirmation(data: IConfirmation<ConfirmationOption>) {
    const origin = this.confirmations.find((p) => p.id === data.id);
    if (origin) {
      Object.assign(origin, data);
      ipcBridge.conversation.confirmation.update.emit({ ...data, conversation_id: this.conversation_id });
      return;
    }
    this.confirmations.push(data);
    ipcBridge.conversation.confirmation.add.emit({ ...data, conversation_id: this.conversation_id });
  }
  confirm(_msg_id: string, callId: string, _data: ConfirmationOption) {
    // 查找要移除的确认项（根据 callId 匹配）
    // Find the confirmation to remove (match by callId)
    const confirmationToRemove = this.confirmations.find((p) => p.callId === callId);

    // 从缓存中移除
    // Remove from cache
    this.confirmations = this.confirmations.filter((p) => p.callId !== callId);

    // 通知前端移除确认项
    // Notify frontend to remove the confirmation
    if (confirmationToRemove) {
      ipcBridge.conversation.confirmation.remove.emit({
        conversation_id: this.conversation_id,
        id: confirmationToRemove.id,
      });
    }
  }
  getConfirmations() {
    return this.confirmations;
  }
  start(data?: Data) {
    if (data) {
      this.data = {
        ...this.data,
        data,
      };
    }
    return super.start();
  }

  stop() {
    return this.postMessagePromise('stop.stream', {});
  }

  sendMessage(data: any) {
    return this.postMessagePromise('send.message', data);
  }
}

export default BaseAgentManager;
