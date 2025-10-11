/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitData {
  [key: string]: RateLimitEntry;
}

/**
 * 基于文件系统的 Rate Limit 存储 / File-based Rate Limit Store
 * 使用 JSON 文件持久化限流数据，防止重启后丢失，避免攻击者通过重启绕过限制
 * Persist rate limit data in JSON file to prevent loss after restart, avoiding attackers bypassing limits by restarting
 */
export class RateLimitStore {
  private storePath: string;
  private cache: RateLimitData = {};
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_DELAY = 5000; // 延迟 5 秒批量保存，减少频繁磁盘 I/O / Batch save after 5 seconds to reduce frequent disk I/O

  constructor(storagePath?: string) {
    // 解析存储路径 / Resolve storage path
    if (storagePath) {
      this.storePath = storagePath;
    } else {
      try {
        // 优先使用 Electron 的 userData 路径 / Prefer Electron userData path
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require('electron');
        this.storePath = path.join(app.getPath('userData'), 'rate-limits.json');
      } catch (error) {
        // 降级到用户主目录 / Fallback to user home directory
        const homeDir = os.homedir();
        const aionDir = path.join(homeDir, '.aionui');
        if (!fs.existsSync(aionDir)) {
          fs.mkdirSync(aionDir, { recursive: true });
        }
        this.storePath = path.join(aionDir, 'rate-limits.json');
      }
    }

    // 启动时加载现有数据 / Load existing data on startup
    this.load();

    // 定期清理过期条目 / Periodically cleanup expired entries
    setInterval(() => this.cleanup(), 60000); // 每分钟清理一次 / Cleanup every minute
  }

  /**
   * 从磁盘加载数据 / Load data from disk
   */
  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = fs.readFileSync(this.storePath, 'utf8');
        this.cache = JSON.parse(data);
        console.log(`[RateLimitStore] Loaded ${Object.keys(this.cache).length} rate limit entries`);
      }
    } catch (error) {
      console.error('[RateLimitStore] Failed to load rate limits:', error);
      this.cache = {};
    }
  }

  /**
   * 保存数据到文件（延迟批量写入）
   */
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveNow();
    }, this.SAVE_DELAY);
  }

  /**
   * 立即保存到文件
   */
  private saveNow(): void {
    try {
      const data = JSON.stringify(this.cache, null, 2);
      fs.writeFileSync(this.storePath, data, 'utf8');
    } catch (error) {
      console.error('[RateLimitStore] Failed to save rate limits:', error);
    }
  }

  /**
   * 获取限流条目
   */
  public get(key: string): RateLimitEntry | undefined {
    return this.cache[key];
  }

  /**
   * 设置限流条目
   */
  public set(key: string, entry: RateLimitEntry): void {
    this.cache[key] = entry;
    this.scheduleSave();
  }

  /**
   * 删除限流条目
   */
  public delete(key: string): void {
    delete this.cache[key];
    this.scheduleSave();
  }

  /**
   * 清理过期条目
   */
  public cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    Object.keys(this.cache).forEach((key) => {
      if (this.cache[key].resetTime < now) {
        delete this.cache[key];
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      console.log(`[RateLimitStore] Cleaned up ${cleanedCount} expired entries`);
      this.saveNow();
    }
  }

  /**
   * 清除指定 IP 的所有限流记录
   */
  public clearByIp(ip: string, action?: string): void {
    const keysToDelete: string[] = [];

    Object.keys(this.cache).forEach((key) => {
      if (action) {
        // 清除特定操作的限流
        if (key.includes(ip) && key.includes(action)) {
          keysToDelete.push(key);
        }
      } else {
        // 清除该 IP 的所有限流
        if (key.includes(ip)) {
          keysToDelete.push(key);
        }
      }
    });

    keysToDelete.forEach((key) => delete this.cache[key]);

    if (keysToDelete.length > 0) {
      this.scheduleSave();
    }
  }

  /**
   * 获取所有条目数量
   */
  public size(): number {
    return Object.keys(this.cache).length;
  }

  /**
   * 清空所有数据
   */
  public clear(): void {
    this.cache = {};
    this.saveNow();
  }
}
