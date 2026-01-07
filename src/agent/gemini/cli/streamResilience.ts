/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stream Resilience Module - OAuth 流式连接弹性处理
 * 解决 OAuth 模式下 Gemini 断流问题
 *
 * 主要功能：
 * 1. SSE 重连机制
 * 2. 心跳检测
 * 3. 超时处理
 * 4. 连接状态监控
 */

import type { ServerGeminiStreamEvent } from '@office-ai/aioncli-core';

// 流式连接配置
export interface StreamResilienceConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始重试延迟 (ms) */
  initialRetryDelayMs: number;
  /** 最大重试延迟 (ms) */
  maxRetryDelayMs: number;
  /** 心跳超时时间 (ms) - 超过此时间无数据则认为连接断开 */
  heartbeatTimeoutMs: number;
  /** 单次请求超时 (ms) */
  requestTimeoutMs: number;
  /** 是否启用自动重连 */
  enableAutoReconnect: boolean;
}

// 默认配置
export const DEFAULT_STREAM_RESILIENCE_CONFIG: StreamResilienceConfig = {
  maxRetries: 3,
  initialRetryDelayMs: 1000,
  maxRetryDelayMs: 10000,
  heartbeatTimeoutMs: 30000, // 30秒无数据则认为断开
  requestTimeoutMs: 120000, // 2分钟请求超时
  enableAutoReconnect: true,
};

// 流状态
export enum StreamConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
}

// 连接事件类型
export type StreamConnectionEvent = { type: 'state_change'; state: StreamConnectionState; reason?: string } | { type: 'heartbeat_timeout'; lastEventTime: number } | { type: 'retry_attempt'; attempt: number; maxRetries: number; delayMs: number } | { type: 'reconnect_success'; attempt: number } | { type: 'reconnect_failed'; error: Error };

// 流监控器
export class StreamMonitor {
  private lastEventTime: number = Date.now();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private state: StreamConnectionState = StreamConnectionState.DISCONNECTED;
  private config: StreamResilienceConfig;
  private onConnectionEvent?: (event: StreamConnectionEvent) => void;

  constructor(config: Partial<StreamResilienceConfig> = {}, onConnectionEvent?: (event: StreamConnectionEvent) => void) {
    this.config = { ...DEFAULT_STREAM_RESILIENCE_CONFIG, ...config };
    this.onConnectionEvent = onConnectionEvent;
  }

  /**
   * 开始监控流连接
   */
  start(): void {
    this.setState(StreamConnectionState.CONNECTING);
    this.lastEventTime = Date.now();
    this.startHeartbeatCheck();
  }

  /**
   * 记录收到事件，更新心跳时间
   */
  recordEvent(): void {
    this.lastEventTime = Date.now();
    if (this.state === StreamConnectionState.CONNECTING || this.state === StreamConnectionState.RECONNECTING) {
      this.setState(StreamConnectionState.CONNECTED);
    }
  }

  /**
   * 停止监控
   */
  stop(): void {
    this.stopHeartbeatCheck();
    this.setState(StreamConnectionState.DISCONNECTED);
  }

  /**
   * 标记连接失败
   */
  markFailed(reason?: string): void {
    this.stopHeartbeatCheck();
    this.setState(StreamConnectionState.FAILED, reason);
  }

  /**
   * 标记正在重连
   */
  markReconnecting(): void {
    this.setState(StreamConnectionState.RECONNECTING);
  }

  /**
   * 获取当前状态
   */
  getState(): StreamConnectionState {
    return this.state;
  }

  /**
   * 获取上次事件时间
   */
  getLastEventTime(): number {
    return this.lastEventTime;
  }

  /**
   * 检查是否心跳超时
   */
  isHeartbeatTimeout(): boolean {
    return Date.now() - this.lastEventTime > this.config.heartbeatTimeoutMs;
  }

  private setState(state: StreamConnectionState, reason?: string): void {
    if (this.state !== state) {
      this.state = state;
      this.onConnectionEvent?.({ type: 'state_change', state, reason });
    }
  }

  private startHeartbeatCheck(): void {
    this.stopHeartbeatCheck();
    this.heartbeatTimer = setInterval(() => {
      if (this.isHeartbeatTimeout()) {
        this.onConnectionEvent?.({
          type: 'heartbeat_timeout',
          lastEventTime: this.lastEventTime,
        });
        // 不自动停止，让上层决定如何处理
      }
    }, 5000); // 每5秒检查一次
  }

  private stopHeartbeatCheck(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

/**
 * 带弹性处理的流包装器
 * 包装原始流，添加心跳检测和超时处理
 */
export async function* wrapStreamWithResilience<T extends ServerGeminiStreamEvent>(stream: AsyncIterable<T>, config: Partial<StreamResilienceConfig> = {}, onConnectionEvent?: (event: StreamConnectionEvent) => void): AsyncGenerator<T, void, unknown> {
  const fullConfig = { ...DEFAULT_STREAM_RESILIENCE_CONFIG, ...config };
  const monitor = new StreamMonitor(fullConfig, onConnectionEvent);

  monitor.start();

  try {
    for await (const event of stream) {
      monitor.recordEvent();
      yield event;
    }
  } catch (error) {
    monitor.markFailed(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    monitor.stop();
  }
}

/**
 * 延迟函数
 */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    });
  });
}

/**
 * 计算指数退避延迟
 */
export function calculateBackoffDelay(attempt: number, config: StreamResilienceConfig): number {
  const baseDelay = config.initialRetryDelayMs * Math.pow(2, attempt);
  const jitter = baseDelay * 0.3 * (Math.random() * 2 - 1);
  return Math.min(config.maxRetryDelayMs, Math.max(0, baseDelay + jitter));
}

/**
 * 检查错误是否可重试
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // 网络相关错误
    if (message.includes('fetch failed') || message.includes('network') || message.includes('timeout') || message.includes('connection') || message.includes('econnreset') || message.includes('socket hang up')) {
      return true;
    }
    // HTTP 状态码相关
    if (message.includes('429') || message.includes('503') || message.includes('502') || message.includes('504')) {
      return true;
    }
  }
  return false;
}

/**
 * 工具调用保护器
 * 防止工具调用在执行过程中被取消
 */
export class ToolCallGuard {
  private protectedCallIds: Set<string> = new Set();
  private completedCallIds: Set<string> = new Set();

  /**
   * 保护一个工具调用，防止被取消
   */
  protect(callId: string): void {
    this.protectedCallIds.add(callId);
  }

  /**
   * 检查工具调用是否受保护
   */
  isProtected(callId: string): boolean {
    return this.protectedCallIds.has(callId);
  }

  /**
   * 标记工具调用完成
   */
  complete(callId: string): void {
    this.protectedCallIds.delete(callId);
    this.completedCallIds.add(callId);
  }

  /**
   * 检查工具调用是否已完成
   */
  isCompleted(callId: string): boolean {
    return this.completedCallIds.has(callId);
  }

  /**
   * 移除保护
   */
  unprotect(callId: string): void {
    this.protectedCallIds.delete(callId);
  }

  /**
   * 清理所有状态
   */
  clear(): void {
    this.protectedCallIds.clear();
    this.completedCallIds.clear();
  }

  /**
   * 获取所有受保护的调用ID
   */
  getProtectedCallIds(): string[] {
    return Array.from(this.protectedCallIds);
  }
}

// 全局工具调用保护器实例
export const globalToolCallGuard = new ToolCallGuard();
