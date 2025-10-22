/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

interface RateLimitEntry {
  count: number; // 尝试次数
  resetTime: number; // 重置时间戳
}

export class RateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();

  /**
   * 获取指定键的速率限制条目
   * Get rate limit entry for a key
   */
  public get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  /**
   * 设置指定键的速率限制条目
   * Set rate limit entry for a key
   */
  public set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  /**
   * 增加指定键的尝试次数（例如：IP地址或用户名）
   * Increment attempt count for a key (e.g., IP address or username)
   */
  public increment(key: string): void {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry) {
      this.store.set(key, { count: 1, resetTime: now });
    } else {
      entry.count++;
      this.store.set(key, entry);
    }
  }

  /**
   * 获取指定键在时间窗口内的尝试次数
   * Get attempt count for a key within the time window
   */
  public getCount(key: string, _windowMs: number): number {
    const entry = this.store.get(key);
    if (!entry) return 0;

    const now = Date.now();
    if (now > entry.resetTime) {
      // 时间窗口已过期，重置
      // Window expired, reset
      this.store.delete(key);
      return 0;
    }

    return entry.count;
  }

  /**
   * 重置指定键的尝试次数
   * Reset attempts for a key
   */
  public reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * 根据 IP 地址清除速率限制，可选择性地指定操作类型
   * Clear rate limit by IP address, optionally for specific action
   */
  public clearByIp(ip: string, action?: string): void {
    if (action) {
      // 清除该 IP 的特定操作限制
      // Clear specific action for this IP
      const key = `ratelimit:${action}:${ip}`;
      this.store.delete(key);
    } else {
      // 清除该 IP 的所有操作限制
      // Clear all actions for this IP
      for (const key of this.store.keys()) {
        if (key.endsWith(`:${ip}`)) {
          this.store.delete(key);
        }
      }
    }
  }

  /**
   * 清理过期的条目
   * Clean up expired entries
   */
  public cleanup(_windowMs: number): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }
}
