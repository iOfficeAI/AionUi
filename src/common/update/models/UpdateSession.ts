/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { UpdateSessionSchema, type UpdateSession as IUpdateSession } from '../../../types/updateTypes';
import { UpdatePackage } from './UpdatePackage';
import { formatBytes } from '../updateConfig';

/**
 * Update Session Model
 *
 * Tracks the state and progress of an ongoing update download and installation.
 * Provides real-time progress information and state management for update operations.
 */
export class UpdateSession {
  private readonly data: IUpdateSession;

  constructor(data: IUpdateSession) {
    // Validate input data using Zod schema
    const validationResult = UpdateSessionSchema.safeParse(data);
    if (!validationResult.success) {
      throw new Error(`Invalid update session: ${validationResult.error.message}`);
    }

    this.data = validationResult.data;
  }

  // ===== Static Factory Methods =====

  /**
   * Create a new UpdateSession for starting a download
   */
  static create(params: { sessionId: string; updatePackage: UpdatePackage; totalBytes?: number }): UpdateSession {
    if (!params.sessionId || params.sessionId.trim() === '') {
      throw new Error('Session ID cannot be empty');
    }

    const totalBytes = params.totalBytes || params.updatePackage.fileSize;

    return new UpdateSession({
      sessionId: params.sessionId,
      updateInfo: params.updatePackage.toJSON(),
      status: 'downloading',
      progress: 0,
      bytesDownloaded: 0,
      totalBytes,
      speed: 0,
      estimatedTimeRemaining: undefined,
      startedAt: Date.now(),
      completedAt: undefined,
      error: undefined,
    });
  }

  /**
   * Generate a unique session ID
   */
  static generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `update_${timestamp}_${random}`;
  }

  // ===== Getters =====

  get sessionId(): string {
    return this.data.sessionId;
  }

  get updateInfo(): IUpdateSession['updateInfo'] {
    return this.data.updateInfo;
  }

  get status(): IUpdateSession['status'] {
    return this.data.status;
  }

  get progress(): number {
    return this.data.progress;
  }

  get bytesDownloaded(): number {
    return this.data.bytesDownloaded;
  }

  get totalBytes(): number {
    return this.data.totalBytes;
  }

  get speed(): number | undefined {
    return this.data.speed;
  }

  get estimatedTimeRemaining(): number | undefined {
    return this.data.estimatedTimeRemaining;
  }

  get startedAt(): number {
    return this.data.startedAt;
  }

  get completedAt(): number | undefined {
    return this.data.completedAt;
  }

  get error(): string | undefined {
    return this.data.error;
  }

  get downloadPath(): string | undefined {
    return this.data.downloadPath;
  }

  // ===== Computed Properties =====

  /**
   * Get the UpdatePackage instance from session data
   */
  getUpdatePackage(): UpdatePackage {
    return UpdatePackage.fromJSON(this.data.updateInfo);
  }

  /**
   * Check if the session is currently active (downloading or paused)
   */
  isActive(): boolean {
    return this.data.status === 'downloading' || this.data.status === 'paused';
  }

  /**
   * Check if the session has completed successfully
   */
  isCompleted(): boolean {
    return this.data.status === 'completed';
  }

  /**
   * Check if the session has failed
   */
  isFailed(): boolean {
    return this.data.status === 'failed';
  }

  /**
   * Check if the session was cancelled
   */
  isCancelled(): boolean {
    return this.data.status === 'cancelled';
  }

  /**
   * Get remaining bytes to download
   */
  getRemainingBytes(): number {
    return Math.max(0, this.data.totalBytes - this.data.bytesDownloaded);
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsedTime(): number {
    const endTime = this.isActive() ? Date.now() : this.data.completedAt || Date.now();

    return endTime - this.data.startedAt;
  }

  /**
   * Get average download speed in bytes per second
   */
  getAverageSpeed(): number {
    const elapsedSeconds = this.getElapsedTime() / 1000;
    if (elapsedSeconds <= 0) {
      return 0;
    }

    return this.data.bytesDownloaded / elapsedSeconds;
  }

  /**
   * Get formatted progress as percentage string
   */
  getFormattedProgress(): string {
    return `${this.data.progress.toFixed(2)}%`;
  }

  /**
   * Get formatted download speed
   */
  getFormattedSpeed(): string {
    const speed = this.data.speed || this.getAverageSpeed();
    const speedKBps = speed / 1024;

    if (speedKBps < 1024) {
      return `${speedKBps.toFixed(1)} KB/s`;
    } else {
      const speedMBps = speedKBps / 1024;
      return `${speedMBps.toFixed(1)} MB/s`;
    }
  }

  /**
   * Get formatted time remaining
   */
  getFormattedTimeRemaining(): string {
    const timeRemaining = this.data.estimatedTimeRemaining;
    if (!timeRemaining || timeRemaining <= 0) {
      return 'Unknown';
    }

    const seconds = Math.floor(timeRemaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get formatted bytes downloaded
   */
  getFormattedBytesDownloaded(): string {
    return formatBytes(this.data.bytesDownloaded);
  }

  /**
   * Get formatted total bytes
   */
  getFormattedTotalBytes(): string {
    return formatBytes(this.data.totalBytes);
  }

  // ===== State Update Methods =====

  /**
   * Update download progress
   */
  updateProgress(bytesDownloaded: number, speed?: number): UpdateSession {
    if (bytesDownloaded < 0) {
      throw new Error('Bytes downloaded cannot be negative');
    }

    if (bytesDownloaded > this.data.totalBytes) {
      bytesDownloaded = this.data.totalBytes;
    }

    const progress = this.data.totalBytes > 0 ? (bytesDownloaded / this.data.totalBytes) * 100 : 0;

    // Calculate estimated time remaining
    let estimatedTimeRemaining: number | undefined;
    if (speed && speed > 0) {
      const remainingBytes = this.data.totalBytes - bytesDownloaded;
      estimatedTimeRemaining = (remainingBytes / speed) * 1000; // Convert to milliseconds
    }

    return new UpdateSession({
      ...this.data,
      progress,
      bytesDownloaded,
      speed,
      estimatedTimeRemaining,
    });
  }

  /**
   * Pause the download session
   */
  pause(): UpdateSession {
    if (this.data.status !== 'downloading') {
      throw new Error('Can only pause downloading sessions');
    }

    return new UpdateSession({
      ...this.data,
      status: 'paused',
    });
  }

  /**
   * Resume the download session
   */
  resume(): UpdateSession {
    if (this.data.status !== 'paused') {
      throw new Error('Can only resume paused sessions');
    }

    return new UpdateSession({
      ...this.data,
      status: 'downloading',
    });
  }

  /**
   * Mark the session as completed
   */
  complete(): UpdateSession {
    if (!this.isActive()) {
      throw new Error('Can only complete active sessions');
    }

    return new UpdateSession({
      ...this.data,
      status: 'completed',
      progress: 100,
      bytesDownloaded: this.data.totalBytes,
      estimatedTimeRemaining: 0,
      completedAt: Date.now(),
    });
  }

  /**
   * Mark the session as failed with error message
   */
  fail(error: string): UpdateSession {
    if (!error || error.trim() === '') {
      throw new Error('Error message cannot be empty');
    }

    return new UpdateSession({
      ...this.data,
      status: 'failed',
      error: error.trim(),
      completedAt: Date.now(),
    });
  }

  /**
   * Cancel the session
   */
  cancel(): UpdateSession {
    if (this.data.status === 'completed') {
      throw new Error('Cannot cancel completed sessions');
    }

    return new UpdateSession({
      ...this.data,
      status: 'cancelled',
      completedAt: Date.now(),
    });
  }

  // ===== Helper Methods =====

  // formatBytes 函数已移到 updateConfig 中统一管理，直接使用导入的函数

  // ===== Serialization =====

  /**
   * Convert to plain object for JSON serialization
   */
  toJSON(): IUpdateSession {
    return { ...this.data };
  }

  /**
   * Create UpdateSession from JSON data
   */
  static fromJSON(json: unknown): UpdateSession {
    return new UpdateSession(json as IUpdateSession);
  }

  // ===== Utility Methods =====

  /**
   * Get session summary for logging
   */
  getSummary(): string {
    const packageInfo = this.getUpdatePackage().getSummary();
    const statusInfo = this.getStatusInfo();

    return `[${this.data.sessionId}] ${statusInfo} | ${packageInfo}`;
  }

  private getStatusInfo(): string {
    switch (this.data.status) {
      case 'downloading':
        return `⬇️ Downloading ${this.getFormattedProgress()} (${this.getFormattedSpeed()})`;
      case 'paused':
        return `⏸️ Paused ${this.getFormattedProgress()}`;
      case 'completed':
        return `✅ Completed`;
      case 'failed':
        return `❌ Failed: ${this.data.error}`;
      case 'cancelled':
        return `🚫 Cancelled`;
      default:
        return `❓ Unknown status: ${this.data.status}`;
    }
  }

  /**
   * Check equality with another UpdateSession
   */
  equals(other: UpdateSession): boolean {
    return this.data.sessionId === other.data.sessionId && this.data.status === other.data.status && this.data.progress === other.data.progress && this.data.bytesDownloaded === other.data.bytesDownloaded && this.data.totalBytes === other.data.totalBytes;
  }

  /**
   * Get session health status
   */
  getHealthStatus(): 'healthy' | 'slow' | 'stalled' | 'error' {
    if (this.isFailed()) {
      return 'error';
    }

    if (!this.isActive()) {
      return 'healthy';
    }

    const timeSinceLastUpdate = Date.now() - this.data.startedAt;

    // Stalled if no update for more than 30 seconds
    if (timeSinceLastUpdate > 30000) {
      return 'stalled';
    }

    const currentSpeed = this.data.speed || this.getAverageSpeed();

    // Slow if speed is less than 10 KB/s
    if (currentSpeed < 10 * 1024) {
      return 'slow';
    }

    return 'healthy';
  }

  /**
   * Set the download path for completed downloads
   */
  withDownloadPath(downloadPath: string): UpdateSession {
    return new UpdateSession({
      ...this.data,
      downloadPath,
    });
  }
}
