/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export class SocialRateLimiter {
  private dailyCounts: Map<string, number> = new Map(); // key: platform:YYYY-MM-DD
  private maxDailyPosts: number = 10;
  private postQueue: Promise<unknown> = Promise.resolve();

  constructor(options?: { maxDailyPosts?: number }) {
    if (options?.maxDailyPosts) {
      this.maxDailyPosts = options.maxDailyPosts;
    }
  }

  public setMaxDailyPosts(cap: number): void {
    this.maxDailyPosts = cap;
  }

  public getMaxDailyPosts(): number {
    return this.maxDailyPosts;
  }

  private getDateKey(platform: string): string {
    const today = new Date().toISOString().slice(0, 10);
    return `${platform.toLowerCase()}:${today}`;
  }

  public getDailyCount(platform: string): number {
    const key = this.getDateKey(platform);
    return this.dailyCounts.get(key) || 0;
  }

  public checkDailyCap(platform: string): { allowed: boolean; current: number; max: number } {
    const current = this.getDailyCount(platform);
    return {
      allowed: current < this.maxDailyPosts,
      current,
      max: this.maxDailyPosts,
    };
  }

  public recordPost(platform: string): void {
    const key = this.getDateKey(platform);
    const current = this.dailyCounts.get(key) || 0;
    this.dailyCounts.set(key, current + 1);
  }

  public async acquireLock<T>(fn: () => Promise<T>): Promise<T> {
    // Sequential execution to prevent parallel bulk posting
    const next = this.postQueue.then(async () => fn());
    this.postQueue = next.catch(() => {});
    return next;
  }

  public async applyHumanPacing(minMs = 2000, maxMs = 5000): Promise<number> {
    const jitter = Math.floor(minMs + Math.random() * (maxMs - minMs));
    await new Promise((resolve) => setTimeout(resolve, jitter));
    return jitter;
  }
}

let rateLimiterInstance: SocialRateLimiter | null = null;

export function getSocialRateLimiter(): SocialRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new SocialRateLimiter();
  }
  return rateLimiterInstance;
}
