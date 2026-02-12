/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { NanobotConnection } from './NanobotConnection';
import type { AcpResult } from '@/types/acpTypes';
import { createAcpError, AcpErrorType } from '@/types/acpTypes';

export interface NanobotAgentConfig {
  /** Conversation ID */
  id: string;
  /** Working directory */
  workingDir: string;
  /** Stream event callback (for persisted messages) */
  onStreamEvent: (data: IResponseMessage) => void;
  /** Signal event callback (for lifecycle events like finish) */
  onSignalEvent: (data: IResponseMessage) => void;
}

/**
 * NanobotAgent spawns `nanobot agent -m "<msg>" --session <id> --no-markdown` per message.
 * Output is parsed (box-drawing stripped) and emitted as IResponseMessage events.
 */
export class NanobotAgent {
  private readonly id: string;
  private readonly config: NanobotAgentConfig;
  private connection: NanobotConnection;
  private sessionId: string;

  constructor(config: NanobotAgentConfig) {
    this.id = config.id;
    this.config = config;
    this.connection = new NanobotConnection(config.workingDir);
    // Use conversation ID as nanobot session to maintain context
    this.sessionId = config.id;
  }

  /** No-op: nanobot doesn't need a persistent connection */
  async start(): Promise<void> {
    // Nanobot CLI is stateless per invocation; nothing to start
  }

  /**
   * Send a message to nanobot CLI and emit the response as streaming events.
   */
  async sendMessage(data: { content: string; msg_id?: string }): Promise<AcpResult> {
    const responseMsgId = uuid();

    try {
      const responseText = await this.connection.sendMessage(data.content, this.sessionId);

      // Emit response content
      this.config.onStreamEvent({
        type: 'content',
        conversation_id: this.id,
        msg_id: responseMsgId,
        data: responseText,
      });

      // Emit finish signal
      this.config.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
      return { success: true, data: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Emit error
      this.config.onStreamEvent({
        type: 'error',
        conversation_id: this.id,
        msg_id: uuid(),
        data: errorMsg,
      });

      // Emit finish after error
      this.config.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
      return {
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, errorMsg, false),
      };
    }
  }

  /** Stop/kill any running nanobot process */
  stop(): Promise<void> {
    this.connection.kill();
    return Promise.resolve();
  }

  kill(): void {
    this.connection.kill();
  }
}
