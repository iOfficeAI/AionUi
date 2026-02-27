/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GitHubReleaseAsset {
  name: string;
  url: string;
  size: number;
  contentType?: string;
}

export interface UpdateReleaseInfo {
  tagName: string;
  version: string;
  name?: string;
  body?: string;
  htmlUrl: string;
  publishedAt?: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubReleaseAsset[];
  recommendedAsset?: GitHubReleaseAsset;
}

export interface UpdateCheckResult {
  currentVersion: string;
  updateAvailable: boolean;
  latest?: UpdateReleaseInfo;
}

export interface UpdateCheckRequest {
  includePrerelease?: boolean;
  /** Defaults to iOfficeAI/AionUi when omitted */
  repo?: string;
}

export interface UpdateDownloadRequest {
  url: string;
  fileName?: string;
}

export interface UpdateDownloadResult {
  downloadId: string;
  filePath: string;
}

export type UpdateDownloadStatus = 'starting' | 'downloading' | 'completed' | 'error' | 'cancelled';

export interface UpdateDownloadProgressEvent {
  downloadId: string;
  status: UpdateDownloadStatus;
  receivedBytes: number;
  totalBytes?: number;
  percent?: number;
  bytesPerSecond?: number;
  filePath?: string;
  error?: string;
}

// Auto-updater status types (electron-updater)
export type AutoUpdateStatusType = 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'cancelled';

export interface AutoUpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface AutoUpdateStatus {
  status: AutoUpdateStatusType;
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  progress?: AutoUpdateProgress;
  error?: string;
}
