/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { UPDATE_CONFIG } from '../common/update/updateConfig';

// ===== Version Information =====

export const VersionInfoSchema = z.object({
  current: z.string().regex(/^\d+\.\d+\.\d+.*$/, 'Invalid semver format'),
  latest: z.string().regex(/^\d+\.\d+\.\d+.*$/, 'Invalid semver format'),
  minimumRequired: z.string().regex(/^\d+\.\d+\.\d+.*$/, 'Invalid semver format').optional(),
  releaseDate: z.string().datetime().optional(),
  releaseNotes: z.string().optional(),
  publishedAt: z.date().optional(),
  isUpdateAvailable: z.boolean(),
  isForced: z.boolean(),
  isPrerelease: z.boolean().optional(),
});

export type VersionInfo = z.infer<typeof VersionInfoSchema>;

// ===== Update Package =====

export const UpdatePackageSchema = z.object({
  version: z.string(),
  platform: z.enum(UPDATE_CONFIG.PLATFORMS.SUPPORTED),
  arch: z.enum(UPDATE_CONFIG.PLATFORMS.ARCHITECTURES),
  downloadUrl: z.string().url(),
  fileSize: z.number().min(0),
  checksum: z.string().regex(/^[a-fA-F0-9]{64}$/, 'Invalid SHA256 checksum'),
  signature: z.string().optional(),
  isDelta: z.boolean().default(false),
  baseVersion: z.string().optional(),
  filename: z.string().optional(),
  contentType: z.string().optional(),
});

export type UpdatePackage = z.infer<typeof UpdatePackageSchema>;

// ===== Update Session =====

export const UpdateSessionSchema = z.object({
  sessionId: z.string(),
  updateInfo: UpdatePackageSchema,
  status: z.enum(['downloading', 'paused', 'completed', 'failed', 'cancelled']),
  progress: z.number().min(0).max(100),
  bytesDownloaded: z.number().min(0),
  totalBytes: z.number().min(0),
  speed: z.number().min(0).optional(),
  estimatedTimeRemaining: z.number().min(0).optional(),
  error: z.string().optional(),
  startedAt: z.number(),
  completedAt: z.number().optional(),
});

export type UpdateSession = z.infer<typeof UpdateSessionSchema>;


// ===== Update History =====

export const UpdateHistorySchema = z.object({
  id: z.string(),
  fromVersion: z.string(),
  toVersion: z.string(),
  updateTime: z.number(),
  success: z.boolean(),
  error: z.string().optional(),
  duration: z.number().min(0).optional(),
  forced: z.boolean().default(false),
});

export type UpdateHistory = z.infer<typeof UpdateHistorySchema>;

// ===== Update Check Result =====

export const UpdateCheckResultSchema = z.object({
  success: z.boolean(),
  versionInfo: VersionInfoSchema,
  error: z.string().optional(),
  checkTime: z.number(),
});

export type UpdateCheckResult = z.infer<typeof UpdateCheckResultSchema>;

// ===== Download Progress =====

export const DownloadProgressSchema = z.object({
  sessionId: z.string(),
  progress: z.number().min(0).max(100),
  bytesDownloaded: z.number().min(0),
  totalBytes: z.number().min(0),
  speed: z.number().min(0).optional(),
  estimatedTimeRemaining: z.number().min(0).optional(),
  status: z.enum(['downloading', 'paused', 'completed', 'failed', 'cancelled']),
  error: z.string().optional(),
});

export type DownloadProgress = z.infer<typeof DownloadProgressSchema>;

// ===== Download Result =====

export const DownloadResultSchema = z.object({
  success: z.boolean(),
  sessionId: z.string(),
  filePath: z.string().optional(),
  error: z.string().optional(),
  duration: z.number().min(0).optional(),
});

export type DownloadResult = z.infer<typeof DownloadResultSchema>;

// ===== Install Result =====

export const InstallResultSchema = z.object({
  success: z.boolean(),
  newVersion: z.string().optional(),
  error: z.string().optional(),
  needsRestart: z.boolean().default(true),
  backupPath: z.string().optional(),
});

export type InstallResult = z.infer<typeof InstallResultSchema>;

// ===== Rollback Result =====

export const RollbackResultSchema = z.object({
  success: z.boolean(),
  rolledBackVersion: z.string().optional(),
  error: z.string().optional(),
});

export type RollbackResult = z.infer<typeof RollbackResultSchema>;

// ===== Update Configuration =====

export const UpdateConfigurationSchema = z.object({
  enableManualCheck: z.boolean().default(true),
  downloadOptions: z.object({
    maxSpeed: z.number().min(0).optional(),
    retryCount: z.number().min(0).max(10).default(3),
    timeout: z.number().min(1000).default(30000),
    resumable: z.boolean().default(true),
  }).optional(),
  installOptions: z.object({
    silent: z.boolean().default(false),
    restartAfterInstall: z.boolean().default(true),
    backupCurrent: z.boolean().default(true),
    validateSignature: z.boolean().default(true),
  }).optional(),
});

export type UpdateConfiguration = z.infer<typeof UpdateConfigurationSchema>;

// ===== Error Codes =====

export enum UpdateErrorCode {
  UPDATE_CHECK_FAILED = 'UC001',
  DOWNLOAD_FAILED = 'DL001',
  CHECKSUM_MISMATCH = 'DL002',
  SIGNATURE_INVALID = 'DL003',
  INSUFFICIENT_SPACE = 'IN001',
  PERMISSION_DENIED = 'IN002',
  INSTALL_FAILED = 'IN003',
  ROLLBACK_FAILED = 'RB001',
}

// ===== Update Events =====

export interface UpdateEvents {
  'update-check-started': { timestamp: number; forced: boolean };
  'update-check-completed': UpdateCheckResult;
  'download-started': { sessionId: string; updateInfo: UpdatePackage };
  'download-progress': DownloadProgress;
  'download-completed': DownloadResult;
  'install-started': { updatePackage: UpdatePackage };
  'install-completed': InstallResult;
  'rollback-started': { reason: string; targetVersion?: string };
  'rollback-completed': RollbackResult;
}

// ===== Export all schemas for validation =====

export const UpdateSchemas = {
  VersionInfo: VersionInfoSchema,
  UpdatePackage: UpdatePackageSchema,
  UpdateSession: UpdateSessionSchema,
  UpdateHistory: UpdateHistorySchema,
  UpdateCheckResult: UpdateCheckResultSchema,
  DownloadProgress: DownloadProgressSchema,
  DownloadResult: DownloadResultSchema,
  InstallResult: InstallResultSchema,
  RollbackResult: RollbackResultSchema,
  UpdateConfiguration: UpdateConfigurationSchema,
} as const;