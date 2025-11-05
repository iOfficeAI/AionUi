/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { randomBytes } from 'crypto';

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
// 全局状态管理，确保所有 Codex 会话共享状态
const globalStatusMessageId: string = 'codex_status_global';

export class CodexSessionManager {
  private status: CodexSessionStatus = 'initializing';
  private sessionId: string | null = null;
  private isConnected: boolean = false;
  private hasActiveSession: boolean = false;
  private timeout: number;

  constructor(
    private config: CodexSessionConfig,
    private messageEmitter: ICodexMessageEmitter
  ) {
    this.timeout = config.timeout || 30000; // 30秒默认超时
  }

  /**
   * 启动会话 - 参考 ACP 的 start() 方法
   */
  async startSession(): Promise<void> {
    try {
      await this.performConnectionSequence();
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }

  /**
   * 执行连接序列 - 参考 ACP 的连接流程
   */
  private async performConnectionSequence(): Promise<void> {
    // 1. 连接阶段
    this.setStatus('connecting');
    await this.establishConnection();

    // 2. 认证阶段
    this.setStatus('connected');
    await this.performAuthentication();

    // 3. 会话创建阶段
    this.setStatus('authenticated');
    await this.createSession();

    // 4. 会话激活
    this.setStatus('session_active');
  }

  /**
   * 建立连接
   */
  private establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.timeout / 1000} seconds`));
      }, this.timeout);

      // 模拟连接过程
      setTimeout(() => {
        clearTimeout(timeoutId);
        this.isConnected = true;
        resolve();
      }, 1000);
    });
  }

  /**
   * 执行认证 - 参考 ACP 的认证逻辑
   */
  private performAuthentication(): Promise<void> {
    // 这里可以添加具体的认证逻辑
    // 目前 Codex 通过 CLI 自身处理认证
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 500);
    });
  }

  /**
   * 创建会话
   */
  private createSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Session creation timeout'));
      }, this.timeout);

      setTimeout(() => {
        clearTimeout(timeoutId);
        this.sessionId = this.generateSessionId();
        this.hasActiveSession = true;
        resolve();
      }, 500);
    });
  }

  /**
   * 停止会话
   */
  stopSession(): Promise<void> {
    this.isConnected = false;
    this.hasActiveSession = false;
    this.sessionId = null;
    this.setStatus('disconnected');
    return Promise.resolve();
  }

  /**
   * 检查会话健康状态
   */
  checkSessionHealth(): boolean {
    const isHealthy = this.isConnected && this.hasActiveSession && this.status === 'session_active';
    // Session health check
    return isHealthy;
  }

  /**
   * 重新连接会话
   */
  async reconnectSession(): Promise<void> {
    await this.stopSession();
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 等待1秒
    await this.startSession();
  }

  /**
   * 设置状态并发送通知 - 参考 ACP 的 emitStatusMessage
   */
  private setStatus(status: CodexSessionStatus): void {
    this.status = status;
    // 更新本地状态即可，全局ID已确保唯一性

    this.messageEmitter.emitAndPersistMessage({
      type: 'agent_status',
      conversation_id: this.config.conversation_id,
      msg_id: globalStatusMessageId, // 使用全局状态消息ID
      data: {
        backend: 'codex',
        status,
        sessionId: this.sessionId,
        isConnected: this.isConnected,
        hasActiveSession: this.hasActiveSession,
      },
    });
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `codex-session-${Date.now()}-${this.generateSecureRandomString(9)}`;
  }

  /**
   * 生成加密安全的随机字符串
   */
  private generateSecureRandomString(length: number): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      // 浏览器环境
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      return Array.from(array, (byte) => byte.toString(36).padStart(2, '0'))
        .join('')
        .substring(0, length);
    } else if (typeof require !== 'undefined') {
      // Node.js环境
      try {
        return randomBytes(Math.ceil(length / 2))
          .toString('hex')
          .substring(0, length);
      } catch (e) {
        // 回退方案
        return Math.random()
          .toString(36)
          .substring(2, 2 + length);
      }
    } else {
      // 回退方案
      return Math.random()
        .toString(36)
        .substring(2, 2 + length);
    }
  }

  /**
   * 发送会话事件
   */
  emitSessionEvent(eventType: string, data: unknown): void {
    this.messageEmitter.emitAndPersistMessage({
      type: 'agent_status',
      conversation_id: this.config.conversation_id,
      msg_id: uuid(),
      data: {
        backend: 'codex',
        status: eventType, // Session event type as status
        eventType,
        sessionId: this.sessionId,
        timestamp: Date.now(),
        payload: data,
      },
    });
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
  waitForReady(timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.status === 'session_active') {
        resolve();
        return;
      }

      const checkInterval = setInterval(() => {
        if (this.status === 'session_active') {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
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
    this.stopSession().catch(() => {
      // Error during cleanup, ignore
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
