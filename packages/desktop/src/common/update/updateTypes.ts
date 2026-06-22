/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GitHubReleaseAsset {
  name: string;
  /** Primary download URL — rewritten to CDN for faster download. */
  url: string;
  /** Original GitHub download URL — used as fallback when CDN fails. */
  fallbackUrl?: string;
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
  /** Optional caller-provided id so renderer can match progress events immediately. */
  downloadId?: string;
  url: string;
  /** Fallback URL tried when the primary URL fails (e.g. CDN down). */
  fallbackUrl?: string;
  file_name?: string;
}

export interface UpdateDownloadResult {
  downloadId: string;
  file_path: string;
}

export interface UpdateDownloadCancelRequest {
  downloadId: string;
}

export type UpdateDownloadStatus = 'starting' | 'downloading' | 'completed' | 'error' | 'cancelled';

export interface UpdateDownloadProgressEvent {
  downloadId: string;
  status: UpdateDownloadStatus;
  receivedBytes: number;
  totalBytes?: number;
  percent?: number;
  bytesPerSecond?: number;
  file_path?: string;
  error?: string;
}

// Auto-updater status types (electron-updater)
export type AutoUpdateStatusType =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'cancelled';

export interface AutoUpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface AutoUpdateStatus {
  status: AutoUpdateStatusType;
  /** New version available for download. */
  version?: string;
  /** Current installed version — reflects the dev debug override when set. */
  currentVersion?: string;
  releaseDate?: string;
  releaseNotes?: string;
  progress?: AutoUpdateProgress;
  error?: string;
}

export interface AutoUpdateReadyResult {
  ready: boolean;
  version?: string;
  currentVersion?: string;
  releaseNotes?: string;
  filePath?: string;
  size?: number;
}
