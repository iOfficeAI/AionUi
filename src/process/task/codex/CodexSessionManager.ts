/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/ipcBridge';
import { transformMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import { addMessage } from '../../message';
import { t } from 'i18next';

export type CodexSessionStatus = 'initializing' | 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error' | 'disconnected';

export interface CodexSessionConfig {
  conversation_id: string;
  cliPath?: string;
  workingDir: string;
  timeout?: number;
}

/**
 * CodexSessionManager - 参考 ACP 的会话管理能力
 * 提供统一的连接状态管理、会话生命周期和状态通知
 */
export class CodexSessionManager {
  private status: CodexSessionStatus = 'initializing';
  private statusMessageId: string | null = null;
  private sessionId: string | null = null;
  private isConnected: boolean = false;
  private hasActiveSession: boolean = false;
  private timeout: number;

  constructor(private config: CodexSessionConfig) {
    this.timeout = config.timeout || 30000; // 30秒默认超时
    console.log('🎯 [CodexSessionManager] Initialized for conversation:', config.conversation_id);
  }

  /**
   * 启动会话 - 参考 ACP 的 start() 方法
   */
  async startSession(): Promise<void> {
    console.log('🚀 [CodexSessionManager] Starting session...');

    try {
      await this.performConnectionSequence();
      console.log('✅ [CodexSessionManager] Session started successfully');
    } catch (error) {
      console.error('❌ [CodexSessionManager] Session start failed:', error);
      this.setStatus('error', `Failed to start session: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * 执行连接序列 - 参考 ACP 的连接流程
   */
  private async performConnectionSequence(): Promise<void> {
    // 1. 连接阶段
    this.setStatus('connecting', t('codex.status.connecting'));
    await this.establishConnection();

    // 2. 认证阶段
    this.setStatus('connected', t('codex.status.connected'));
    await this.performAuthentication();

    // 3. 会话创建阶段
    this.setStatus('authenticated', 'Authentication completed');
    await this.createSession();

    // 4. 会话激活
    this.setStatus('session_active', t('codex.status.session_active'));
  }

  /**
   * 建立连接
   */
  private async establishConnection(): Promise<void> {
    console.log('🔌 [CodexSessionManager] Establishing connection...');

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.timeout / 1000} seconds`));
      }, this.timeout);

      // 模拟连接过程
      setTimeout(() => {
        clearTimeout(timeoutId);
        this.isConnected = true;
        console.log('✅ [CodexSessionManager] Connection established');
        resolve();
      }, 1000);
    });
  }

  /**
   * 执行认证 - 参考 ACP 的认证逻辑
   */
  private async performAuthentication(): Promise<void> {
    console.log('🔐 [CodexSessionManager] Performing authentication...');

    // 这里可以添加具体的认证逻辑
    // 目前 Codex 通过 CLI 自身处理认证
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('✅ [CodexSessionManager] Authentication completed');
        resolve();
      }, 500);
    });
  }

  /**
   * 创建会话
   */
  private async createSession(): Promise<void> {
    console.log('📋 [CodexSessionManager] Creating session...');

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Session creation timeout'));
      }, this.timeout);

      setTimeout(() => {
        clearTimeout(timeoutId);
        this.sessionId = this.generateSessionId();
        this.hasActiveSession = true;
        console.log('✅ [CodexSessionManager] Session created:', this.sessionId);
        resolve();
      }, 500);
    });
  }

  /**
   * 停止会话
   */
  async stopSession(): Promise<void> {
    console.log('🛑 [CodexSessionManager] Stopping session...');

    this.isConnected = false;
    this.hasActiveSession = false;
    this.sessionId = null;
    this.setStatus('disconnected', 'Session disconnected');

    console.log('✅ [CodexSessionManager] Session stopped');
  }

  /**
   * 检查会话健康状态
   */
  checkSessionHealth(): boolean {
    const isHealthy = this.isConnected && this.hasActiveSession && this.status === 'session_active';
    console.log('🏥 [CodexSessionManager] Session health check:', {
      isConnected: this.isConnected,
      hasActiveSession: this.hasActiveSession,
      status: this.status,
      healthy: isHealthy,
    });
    return isHealthy;
  }

  /**
   * 重新连接会话
   */
  async reconnectSession(): Promise<void> {
    console.log('🔄 [CodexSessionManager] Reconnecting session...');

    try {
      await this.stopSession();
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 等待1秒
      await this.startSession();
    } catch (error) {
      console.error('❌ [CodexSessionManager] Reconnection failed:', error);
      throw error;
    }
  }

  /**
   * 设置状态并发送通知 - 参考 ACP 的 emitStatusMessage
   */
  private setStatus(status: CodexSessionStatus, message: string): void {
    console.log('📊 [CodexSessionManager] Status changed:', {
      from: this.status,
      to: status,
      message,
      conversation_id: this.config.conversation_id,
    });

    this.status = status;

    // 使用固定ID的状态消息，实现更新而不是重复
    if (!this.statusMessageId) {
      this.statusMessageId = uuid();
    }

    const statusMessage: IResponseMessage = {
      type: 'codex_status',
      conversation_id: this.config.conversation_id,
      msg_id: this.statusMessageId,
      data: {
        status,
        message,
        sessionId: this.sessionId,
        isConnected: this.isConnected,
        hasActiveSession: this.hasActiveSession,
      },
    };

    // 发送到 UI
    addMessage(this.config.conversation_id, transformMessage(statusMessage));
    ipcBridge.codexConversation.responseStream.emit(statusMessage);

    console.log('✅ [CodexSessionManager] Status message emitted');
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `codex-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 发送会话事件
   */
  emitSessionEvent(eventType: string, data: any): void {
    console.log('📡 [CodexSessionManager] Emitting session event:', {
      eventType,
      sessionId: this.sessionId,
      data: typeof data === 'object' ? Object.keys(data) : data,
    });

    const eventMessage: IResponseMessage = {
      type: 'codex_session_event',
      conversation_id: this.config.conversation_id,
      msg_id: uuid(),
      data: {
        eventType,
        sessionId: this.sessionId,
        timestamp: Date.now(),
        payload: data,
      },
    };

    ipcBridge.codexConversation.responseStream.emit(eventMessage);
  }

  /**
   * 获取会话信息
   */
  getSessionInfo(): {
    status: CodexSessionStatus;
    sessionId: string | null;
    isConnected: boolean;
    hasActiveSession: boolean;
    config: CodexSessionConfig;
  } {
    return {
      status: this.status,
      sessionId: this.sessionId,
      isConnected: this.isConnected,
      hasActiveSession: this.hasActiveSession,
      config: this.config,
    };
  }

  /**
   * 等待会话准备就绪 - 类似 ACP 的 bootstrap Promise
   */
  async waitForReady(timeout: number = 30000): Promise<void> {
    console.log('⏳ [CodexSessionManager] Waiting for session ready...');

    return new Promise((resolve, reject) => {
      if (this.status === 'session_active') {
        console.log('✅ [CodexSessionManager] Session already ready');
        resolve();
        return;
      }

      const checkInterval = setInterval(() => {
        if (this.status === 'session_active') {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          console.log('✅ [CodexSessionManager] Session became ready');
          resolve();
        } else if (this.status === 'error') {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          reject(new Error('Session failed to become ready'));
        }
      }, 100);

      const timeoutId = setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Session ready timeout after ${timeout / 1000} seconds`));
      }, timeout);
    });
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    console.log('🧹 [CodexSessionManager] Cleaning up...');
    this.stopSession().catch((err) => {
      console.warn('⚠️ [CodexSessionManager] Error during cleanup:', err);
    });
  }

  // Getters
  get currentStatus(): CodexSessionStatus {
    return this.status;
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get activeSession(): boolean {
    return this.hasActiveSession;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }
}
