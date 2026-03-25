/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { start } from 'weixin-agent-sdk';
import type { Agent, ChatRequest, ChatResponse } from 'weixin-agent-sdk';
import fs from 'fs';
import path from 'path';

import { getPlatformServices } from '@/common/platform';
import type { IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';
import { toUnifiedIncomingMessage, toChatResponse, stripHtml } from './WeixinAdapter';

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

  // AionUi-isolated state dir — separate from ~/.openclaw so the local openclaw
  // gateway process does not auto-discover this account and double-respond.
  private get _weixinStateDir(): string {
    return getPlatformServices().paths.getDataDir();
  }

  // ==================== Lifecycle ====================

  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const { accountId, botToken } = config.credentials ?? {};
    if (!accountId || !botToken) {
      throw new Error('WeChat accountId and botToken are required');
    }
    this.accountId = accountId as string;
    this.botToken = botToken as string;

    // Write credentials into AionUi's own isolated state dir so the local openclaw
    // gateway (a separate OS process that reads ~/.openclaw) cannot pick up this
    // account and start its own weixin monitor in parallel.
    const stateDir = this._weixinStateDir;
    const accountsDir = path.join(stateDir, 'openclaw-weixin', 'accounts');
    fs.mkdirSync(accountsDir, { recursive: true });

    const accountFile = path.join(accountsDir, `${this.accountId}.json`);
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(fs.readFileSync(accountFile, 'utf-8')) as Record<string, unknown>;
    } catch {
      // file may not exist yet
    }
    fs.writeFileSync(
      accountFile,
      JSON.stringify({ ...existing, token: this.botToken, updatedAt: Date.now() }, null, 2),
      'utf-8'
    );

    // Keep the account index up-to-date so the SDK can list registered accounts.
    const indexFile = path.join(stateDir, 'openclaw-weixin', 'accounts.json');
    let ids: string[] = [];
    try {
      ids = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as string[];
    } catch {
      // index may not exist yet
    }
    if (!ids.includes(this.accountId)) {
      ids = [this.accountId, ...ids.filter((id) => id !== this.accountId)];
      fs.writeFileSync(indexFile, JSON.stringify(ids, null, 2), 'utf-8');
    }

    console.log(`[WeixinPlugin] credential file written for accountId=${this.accountId}`);
  }

  protected async onStart(): Promise<void> {
    this._stopping = false;
    this.abortController = new AbortController();

    const agent: Agent = { chat: (req) => this.handleChat(req) };

    // The weixin-agent-sdk resolves credentials and the sync-buf path synchronously
    // at the very start of start() — before its first internal await. By temporarily
    // setting OPENCLAW_STATE_DIR to our isolated dir, the SDK will read from there.
    // After void start() returns (first async suspension), those values are already
    // captured, so restoring the env var is safe.
    const prevStateDir = process.env['OPENCLAW_STATE_DIR'];
    process.env['OPENCLAW_STATE_DIR'] = this._weixinStateDir;

    void start(agent, {
      accountId: this.accountId,
      abortSignal: this.abortController.signal,
    }).catch((error: unknown) => {
      if (!this.abortController?.signal.aborted) {
        this.setStatus('error', error instanceof Error ? error.message : String(error));
      }
    });

    // Restore OPENCLAW_STATE_DIR so other openclaw integrations (e.g. gateway auth)
    // continue to use the user's own state directory.
    if (prevStateDir !== undefined) {
      process.env['OPENCLAW_STATE_DIR'] = prevStateDir;
    } else {
      delete process.env['OPENCLAW_STATE_DIR'];
    }
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

  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    // Store text so it can be returned when the pending promise is auto-resolved
    // (e.g. for pairing codes or error messages that don't go through editMessage)
    const pending = this.pendingResponses.get(chatId);
    // sendMessage is used for single-shot non-streaming messages (e.g. pairing prompts);
    // overwrite rather than append because only the last text is relevant.
    if (pending && message.text) {
      pending.accumulatedText = stripHtml(message.text);
    }
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
      // Use .then() instead of void so we can auto-resolve after processing completes.
      // The weixin SDK expects a synchronous response, so we resolve the pending promise
      // after emitMessage finishes — either via editMessage (for streaming chat) or here
      // (for non-streaming messages like pairing codes and errors).
      this.emitMessage(unified)
        .then(() => {
          const pending = this.pendingResponses.get(conversationId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingResponses.delete(conversationId);
            pending.resolve({
              text: pending.accumulatedText || undefined,
              media: pending.mediaResponse,
            });
          }
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          this.pendingResponses.delete(conversationId);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  // ==================== Static ====================

  static async testConnection(accountId: string, _botToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const stateDir = getPlatformServices().paths.getDataDir();
      const accountFile = path.join(stateDir, 'openclaw-weixin', 'accounts', `${accountId}.json`);
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
