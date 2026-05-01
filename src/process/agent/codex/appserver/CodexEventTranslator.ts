/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { uuid } from '@/common/utils';
import type { CodexJsonRpcNotification, CodexTranslatedEvent } from './types';

export class CodexEventTranslator {
  constructor(private readonly conversationId: string) {}

  translate(notification: CodexJsonRpcNotification): CodexTranslatedEvent[] {
    switch (notification.method) {
      case 'turn/started':
        return [this.message('start', notification.params, false)];
      case 'item/agentMessage/delta': {
        const params = notification.params as { itemId?: string; delta?: string } | undefined;
        return [this.message('content', { content: params?.delta || '' }, true, params?.itemId || uuid())];
      }
      case 'turn/completed':
        return [this.message('finish', notification.params, false)];
      case 'warning':
        return [this.message('agent_status', { status: 'error', warning: notification.params }, true)];
      default:
        return [
          this.message(
            'codex_tool_call',
            {
              toolCallId: `native_${uuid()}`,
              status: 'success',
              kind: 'execute',
              subtype: 'native_unknown_event',
              data: { method: notification.method, params: notification.params },
              description: notification.method,
            },
            true
          ),
        ];
    }
  }

  private message(type: string, data: unknown, persist: boolean, msgId = uuid()): CodexTranslatedEvent {
    const message: IResponseMessage = {
      type,
      msg_id: msgId,
      conversation_id: this.conversationId,
      data,
    };
    return { kind: 'message', message, persist };
  }
}
