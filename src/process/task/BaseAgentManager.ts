/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ForkTask } from '@/worker/fork/ForkTask';
import path from 'path';
import { ipcBridge } from '../../common';
import type { IConfirmation } from '../../common/chatLib';

type AgentType = 'gemini' | 'acp' | 'codex';

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
  confirm(msg_id: string, callId: string, data: ConfirmationOption) {
    this.confirmations = this.confirmations.filter((p) => p.id !== msg_id);
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
