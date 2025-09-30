/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ForkTask } from '@/worker/fork/ForkTask';
import path from 'path';

type AgentType = 'gemini' | 'acp' | 'codex';

/**
 * @description agent任务基础类
 * */
class BaseAgentManager<Data> extends ForkTask<{
  type: AgentType;
  data: Data;
}> {
  type: AgentType;
  protected conversation_id: string;
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
