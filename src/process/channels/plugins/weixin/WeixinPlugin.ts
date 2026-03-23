/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { start } from 'weixin-agent-sdk';
import type { Agent, ChatRequest, ChatResponse } from 'weixin-agent-sdk';
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';
import { toUnifiedIncomingMessage, toChatResponse } from './WeixinAdapter';

const RESPONSE_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingResponse {
  resolve: (response: ChatResponse) => void;
  reject: (error: Error) => void;
  accumulatedText: string;
  mediaResponse?: ChatResponse['media'];
  timer: ReturnType<typeof setTimeout>;
}

export class WeixinPlugin extends BasePlugin {
  readonly type: PluginType = 'weixin';

  private accountId = '';
  private botToken = '';
  private abortController: AbortController | null = null;
  private _stopping = false;
  private pendingResponses = new Map<string, PendingResponse>();
  private activeUsers = new Set<string>();

  // ==================== Lifecycle ====================

  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const { accountId, botToken } = config.credentials ?? {};
    if (!accountId || !botToken) {
      throw new Error('WeChat accountId and botToken are required');
    }
    this.accountId = accountId as string;
    this.botToken = botToken as string;
  }

  protected async onStart(): Promise<void> {
    this._stopping = false;
    this.abortController = new AbortController();

    const agent: Agent = { chat: (req) => this.handleChat(req) };

    void start(agent, {
      accountId: this.accountId,
      abortSignal: this.abortController.signal,
    }).catch((error: unknown) => {
      if (!this.abortController?.signal.aborted) {
        this.setStatus('error', error instanceof Error ? error.message : String(error));
      }
    });
  }

  protected async onStop(): Promise<void> {
    this._stopping = true;

    for (const [chatId, pending] of this.pendingResponses.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Plugin stopped'));
      this.pendingResponses.delete(chatId);
    }

    this.abortController?.abort();
    this.abortController = null;
    this.activeUsers.clear();
  }

  // ==================== BasePlugin interface ====================

  async sendMessage(chatId: string, _message: IUnifiedOutgoingMessage): Promise<string> {
    return `weixin_pending_${chatId}`;
  }

  async editMessage(chatId: string, _messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    const pending = this.pendingResponses.get(chatId);
    if (!pending) return;

    if (message.text) {
      pending.accumulatedText = message.text;
    }

    if (message.type === 'image' || message.type === 'file') {
      pending.mediaResponse = toChatResponse(message).media;
    }

    if (message.replyMarkup !== undefined) {
      clearTimeout(pending.timer);
      this.pendingResponses.delete(chatId);
      pending.resolve({
        text: pending.accumulatedText || undefined,
        media: pending.mediaResponse,
      });
    }
  }

  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  getBotInfo(): { username?: string; displayName?: string } | null {
    return { displayName: 'Aion Assistant' };
  }

  // ==================== Promise bridge ====================

  private handleChat(request: ChatRequest): Promise<ChatResponse> {
    if (this._stopping) {
      return Promise.reject(new Error('Plugin stopped'));
    }

    const { conversationId } = request;
    this.activeUsers.add(conversationId);

    const existing = this.pendingResponses.get(conversationId);
    if (existing) {
      clearTimeout(existing.timer);
      existing.reject(new Error('superseded'));
      this.pendingResponses.delete(conversationId);
    }

    return new Promise<ChatResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(conversationId);
        reject(new Error('Response timeout'));
      }, RESPONSE_TIMEOUT_MS);

      this.pendingResponses.set(conversationId, {
        resolve,
        reject,
        accumulatedText: '',
        timer,
      });

      const unified = toUnifiedIncomingMessage(request);
      void this.emitMessage(unified).catch((error: unknown) => {
        clearTimeout(timer);
        this.pendingResponses.delete(conversationId);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  // ==================== Static ====================

  static async testConnection(accountId: string, _botToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const accountFile = path.join(os.homedir(), '.openclaw', 'openclaw-weixin', 'accounts', `${accountId}.json`);
      const raw = fs.readFileSync(accountFile, 'utf-8');
      const data = JSON.parse(raw) as { token?: string };
      if (!data.token) {
        return { success: false, error: 'No token in credential file' };
      }
      return { success: true };
    } catch {
      return {
        success: false,
        error: `Credential file not found for accountId: ${accountId}`,
      };
    }
  }
}
