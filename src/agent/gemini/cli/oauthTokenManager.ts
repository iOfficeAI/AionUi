/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OAuth Token Manager - Preventive Token Refresh Management
 * OAuth Token Manager - 预防性 Token 刷新管理
 *
 * Solves the issue of stream disconnection due to Token expiration in OAuth mode.
 * 解决 OAuth 模式下 Token 过期导致的断流问题
 *
 * Key Features:
 * 主要功能：
 * 1. Token Validity Monitoring / Token 有效期监控
 * 2. Preventive Refresh (refresh before expiration) / 预防性刷新（在过期前主动刷新）
 * 3. Refresh State Tracking / 刷新状态追踪
 * 4. Token Synchronization during concurrent requests / 并发请求时的 Token 同步
 */

import { AuthType } from '@office-ai/aioncli-core';

// Token State / Token 状态
export enum TokenState {
  VALID = 'valid',
  EXPIRING_SOON = 'expiring_soon', // Expiring soon (within pre-refresh window) / 即将过期（在预刷新窗口内）
  EXPIRED = 'expired',
  REFRESHING = 'refreshing',
  REFRESH_FAILED = 'refresh_failed',
  UNKNOWN = 'unknown',
}

// Token Information / Token 信息
export interface TokenInfo {
  accessToken?: string;
  expiryTime?: number; // Unix timestamp in ms
  refreshToken?: string;
  state: TokenState;
  lastRefreshTime?: number;
  lastRefreshError?: string;
}

// Token Management Configuration / Token 管理配置
export interface TokenManagerConfig {
  /**
   * Pre-refresh window (ms) - How long before expiration to start refreshing
   * 预刷新窗口 (ms) - 在 Token 过期前多久开始刷新
   */
  preRefreshWindowMs: number;
  /**
   * Refresh timeout (ms)
   * 刷新超时 (ms)
   */
  refreshTimeoutMs: number;
  /**
   * Maximum refresh retries
   * 最大刷新重试次数
   */
  maxRefreshRetries: number;
  /**
   * Refresh retry interval (ms)
   * 刷新重试间隔 (ms)
   */
  refreshRetryIntervalMs: number;
}

// Default Configuration / 默认配置
export const DEFAULT_TOKEN_MANAGER_CONFIG: TokenManagerConfig = {
  preRefreshWindowMs: 5 * 60 * 1000, // 5 minutes / 5分钟
  refreshTimeoutMs: 30 * 1000, // 30 seconds / 30秒
  maxRefreshRetries: 3,
  refreshRetryIntervalMs: 2000, // 2 seconds / 2秒
};

// Token Events / Token 事件
export type TokenEvent = { type: 'token_expiring_soon'; expiryTime: number; remainingMs: number } | { type: 'token_refresh_started' } | { type: 'token_refresh_success'; newExpiryTime: number } | { type: 'token_refresh_failed'; error: string; retriesRemaining: number } | { type: 'token_expired' };

/**
 * OAuth Token Manager
 * OAuth Token 管理器
 */
export class OAuthTokenManager {
  private config: TokenManagerConfig;
  private tokenInfo: TokenInfo = { state: TokenState.UNKNOWN };
  private refreshPromise: Promise<boolean> | null = null;
  private checkTimer: NodeJS.Timeout | null = null;
  private onTokenEvent?: (event: TokenEvent) => void;
  private refreshCallback?: () => Promise<boolean>;
  private authType: AuthType;

  constructor(authType: AuthType, config: Partial<TokenManagerConfig> = {}, onTokenEvent?: (event: TokenEvent) => void) {
    this.authType = authType;
    this.config = { ...DEFAULT_TOKEN_MANAGER_CONFIG, ...config };
    this.onTokenEvent = onTokenEvent;
  }

  /**
   * Set refresh callback function
   * 设置刷新回调函数
   */
  setRefreshCallback(callback: () => Promise<boolean>): void {
    this.refreshCallback = callback;
  }

  /**
   * Update Token Information
   * 更新 Token 信息
   */
  updateTokenInfo(accessToken?: string, expiryTime?: number, refreshToken?: string): void {
    this.tokenInfo = {
      ...this.tokenInfo,
      accessToken,
      expiryTime,
      refreshToken,
      state: this.calculateTokenState(expiryTime),
    };
  }

  /**
   * Start auto-check
   * 开始自动检查
   */
  startAutoCheck(intervalMs: number = 30000): void {
    this.stopAutoCheck();
    this.checkTimer = setInterval(() => {
      this.checkAndRefreshIfNeeded();
    }, intervalMs);
  }

  /**
   * Stop auto-check
   * 停止自动检查
   */
  stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Get current Token state
   * 获取当前 Token 状态
   */
  getTokenState(): TokenState {
    return this.tokenInfo.state;
  }

  /**
   * Get remaining valid time for Token (ms)
   * 获取 Token 剩余有效时间 (ms)
   */
  getRemainingValidTime(): number {
    if (!this.tokenInfo.expiryTime) {
      return -1;
    }
    return Math.max(0, this.tokenInfo.expiryTime - Date.now());
  }

  /**
   * Check if Token is expiring soon
   * 检查 Token 是否即将过期
   */
  isTokenExpiringSoon(): boolean {
    const remaining = this.getRemainingValidTime();
    return remaining >= 0 && remaining < this.config.preRefreshWindowMs;
  }

  /**
   * Check if Token has expired
   * 检查 Token 是否已过期
   */
  isTokenExpired(): boolean {
    return this.getRemainingValidTime() === 0;
  }

  /**
   * Check and refresh Token if needed
   * Returns true if Token is valid and usable
   * 检查并在需要时刷新 Token
   * 返回 true 表示 Token 有效可用
   */
  async checkAndRefreshIfNeeded(): Promise<boolean> {
    // Only manage Token for OAuth mode / 只对 OAuth 模式进行 Token 管理
    if (this.authType !== AuthType.LOGIN_WITH_GOOGLE) {
      return true;
    }

    const state = this.calculateTokenState(this.tokenInfo.expiryTime);
    this.tokenInfo.state = state;

    switch (state) {
      case TokenState.VALID:
        return true;

      case TokenState.EXPIRING_SOON:
        this.onTokenEvent?.({
          type: 'token_expiring_soon',
          expiryTime: this.tokenInfo.expiryTime!,
          remainingMs: this.getRemainingValidTime(),
        });
        // Preventive refresh, but do not block current operation / 预防性刷新，但不阻塞当前操作
        this.triggerRefresh().catch(() => {});
        return true;

      case TokenState.EXPIRED:
        this.onTokenEvent?.({ type: 'token_expired' });
        // Must refresh successfully to continue / 必须刷新成功才能继续
        return await this.triggerRefresh();

      case TokenState.REFRESHING:
        // Wait for ongoing refresh to complete / 等待正在进行的刷新完成
        if (this.refreshPromise) {
          return await this.refreshPromise;
        }
        return false;

      default:
        return true; // Unknown state, try to continue / 未知状态，尝试继续
    }
  }

  /**
   * Force refresh Token
   * 强制刷新 Token
   */
  async forceRefresh(): Promise<boolean> {
    return await this.triggerRefresh();
  }

  /**
   * Trigger Token refresh
   * 触发 Token 刷新
   */
  private async triggerRefresh(): Promise<boolean> {
    // Return existing Promise if already refreshing / 如果已经在刷新，返回现有的 Promise
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.refreshCallback) {
      console.warn('[OAuthTokenManager] No refresh callback set');
      return false;
    }

    this.tokenInfo.state = TokenState.REFRESHING;
    this.onTokenEvent?.({ type: 'token_refresh_started' });

    this.refreshPromise = this.executeRefresh();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Execute refresh logic (with retries)
   * 执行刷新逻辑（带重试）
   */
  private async executeRefresh(): Promise<boolean> {
    let lastError: string = 'Unknown error';

    for (let attempt = 0; attempt < this.config.maxRefreshRetries; attempt++) {
      try {
        const success = await Promise.race([this.refreshCallback!(), new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Refresh timeout')), this.config.refreshTimeoutMs))]);

        if (success) {
          this.tokenInfo.state = TokenState.VALID;
          this.tokenInfo.lastRefreshTime = Date.now();
          this.tokenInfo.lastRefreshError = undefined;

          this.onTokenEvent?.({
            type: 'token_refresh_success',
            newExpiryTime: this.tokenInfo.expiryTime || Date.now() + 3600000,
          });

          return true;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        const retriesRemaining = this.config.maxRefreshRetries - attempt - 1;

        this.onTokenEvent?.({
          type: 'token_refresh_failed',
          error: lastError,
          retriesRemaining,
        });

        if (retriesRemaining > 0) {
          await this.delay(this.config.refreshRetryIntervalMs);
        }
      }
    }

    this.tokenInfo.state = TokenState.REFRESH_FAILED;
    this.tokenInfo.lastRefreshError = lastError;

    return false;
  }

  /**
   * Calculate Token state
   * 计算 Token 状态
   */
  private calculateTokenState(expiryTime?: number): TokenState {
    if (this.tokenInfo.state === TokenState.REFRESHING) {
      return TokenState.REFRESHING;
    }

    if (!expiryTime) {
      return TokenState.UNKNOWN;
    }

    const remaining = expiryTime - Date.now();

    if (remaining <= 0) {
      return TokenState.EXPIRED;
    }

    if (remaining < this.config.preRefreshWindowMs) {
      return TokenState.EXPIRING_SOON;
    }

    return TokenState.VALID;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Dispose resources
   * 清理资源
   */
  dispose(): void {
    this.stopAutoCheck();
    this.refreshPromise = null;
  }
}

// Global Token Manager Instance (Lazy loaded) / 全局 Token 管理器实例（懒加载）
let globalTokenManager: OAuthTokenManager | null = null;

/**
 * Get Global Token Manager
 * 获取全局 Token 管理器
 */
export function getGlobalTokenManager(authType: AuthType): OAuthTokenManager {
  if (!globalTokenManager || globalTokenManager['authType'] !== authType) {
    globalTokenManager = new OAuthTokenManager(authType);
  }
  return globalTokenManager;
}

/**
 * Reset Global Token Manager
 * 重置全局 Token 管理器
 */
export function resetGlobalTokenManager(): void {
  if (globalTokenManager) {
    globalTokenManager.dispose();
    globalTokenManager = null;
  }
}
