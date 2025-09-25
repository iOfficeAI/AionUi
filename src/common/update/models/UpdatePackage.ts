/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import * as semver from 'semver';
import { UpdatePackageSchema, type UpdatePackage as IUpdatePackage } from '../../../types/updateTypes';
import type { ArchitectureType, PlatformType } from '../updateConfig';
import { formatBytes } from '../updateConfig';

/**
 * Update Package Model
 *
 * Encapsulates update package information with download and installation logic.
 * Supports incremental updates for optimized download sizes.
 */
export class UpdatePackage {
  private readonly data: IUpdatePackage;

  constructor(data: IUpdatePackage) {
    // Validate input data using Zod schema
    const validationResult = UpdatePackageSchema.safeParse(data);
    if (!validationResult.success) {
      throw new Error(`Invalid update package: ${validationResult.error.message}`);
    }

    this.data = validationResult.data;
  }

  // ===== Static Factory Methods =====

  /**
   * Create UpdatePackage from release information
   */
  static create(params: { version: string; downloadUrl: string; platform: PlatformType; arch: ArchitectureType; fileSize: number; checksum: string; isDelta?: boolean; baseVersion?: string; signature?: string }): UpdatePackage {
    // Validate version format
    if (!semver.valid(params.version)) {
      throw new Error(`Invalid package version format: ${params.version}`);
    }

    // Validate delta update requirements
    if (params.isDelta && !params.baseVersion) {
      throw new Error('Delta packages must specify baseVersion');
    }

    if (params.baseVersion && !semver.valid(params.baseVersion)) {
      throw new Error(`Invalid baseVersion format: ${params.baseVersion}`);
    }

    // Validate download URL format
    if (!params.downloadUrl.match(/^https?:\/\//)) {
      throw new Error('Download URL must use HTTP or HTTPS protocol');
    }

    // Validate size is non-negative
    if (params.fileSize < 0) {
      throw new Error('Package size must be a non-negative number');
    }

    // Validate checksum format (SHA256)
    if (!params.checksum.match(/^[a-fA-F0-9]{64}$/)) {
      throw new Error('Checksum must be a valid SHA256 hash');
    }

    return new UpdatePackage({
      version: params.version,
      downloadUrl: params.downloadUrl,
      platform: params.platform,
      arch: params.arch,
      fileSize: params.fileSize,
      checksum: params.checksum,
      isDelta: params.isDelta || false,
      baseVersion: params.baseVersion,
      signature: params.signature,
    });
  }

  /**
   * Create full update package (non-delta)
   */
  static createFull(params: { version: string; downloadUrl: string; platform: PlatformType; arch: ArchitectureType; fileSize: number; checksum: string; signature?: string }): UpdatePackage {
    return this.create({
      ...params,
      isDelta: false,
    });
  }

  /**
   * Create delta update package (incremental)
   */
  static createDelta(params: { version: string; baseVersion: string; downloadUrl: string; platform: PlatformType; arch: ArchitectureType; fileSize: number; checksum: string; signature?: string }): UpdatePackage {
    return this.create({
      ...params,
      isDelta: true,
    });
  }

  // ===== Getters =====

  get version(): string {
    return this.data.version;
  }

  get downloadUrl(): string {
    return this.data.downloadUrl;
  }

  get platform(): PlatformType {
    return this.data.platform;
  }

  get arch(): ArchitectureType {
    return this.data.arch;
  }

  get fileSize(): number {
    return this.data.fileSize;
  }

  get checksum(): string {
    return this.data.checksum;
  }

  get isDelta(): boolean {
    return this.data.isDelta;
  }

  get baseVersion(): string | undefined {
    return this.data.baseVersion;
  }

  get signature(): string | undefined {
    return this.data.signature;
  }

  get filename(): string | undefined {
    return this.data.filename;
  }

  get contentType(): string | undefined {
    return this.data.contentType;
  }

  // ===== Business Logic Methods =====

  /**
   * Check if this package is compatible with current system
   */
  isCompatibleWithSystem(systemPlatform: string, systemArch: string): boolean {
    // Normalize platform names
    const normalizedPlatform = this.normalizePlatform(systemPlatform);
    const normalizedArch = this.normalizeArch(systemArch);

    return this.data.platform === normalizedPlatform && this.data.arch === normalizedArch;
  }

  /**
   * Check if this delta package is applicable to current version
   */
  isApplicableDelta(currentVersion: string): boolean {
    if (!this.data.isDelta || !this.data.baseVersion) {
      return false;
    }

    return semver.eq(currentVersion, this.data.baseVersion);
  }

  /**
   * Get human-readable package size
   */
  getFormattedSize(): string {
    return formatBytes(this.data.fileSize);
  }

  /**
   * Get package type description
   */
  getPackageType(): 'full' | 'delta' {
    return this.data.isDelta ? 'delta' : 'full';
  }

  /**
   * Get expected filename for download
   */
  getExpectedFilename(): string {
    const platformExt = this.getPlatformExtension();
    const archSuffix = this.data.arch;
    const deltaPrefix = this.data.isDelta ? 'delta-' : '';

    return `${deltaPrefix}update-${this.data.version}-${this.data.platform}-${archSuffix}.${platformExt}`;
  }

  /**
   * Validate package integrity using checksum
   */
  async validateChecksum(filePath: string): Promise<boolean> {
    try {
      const crypto = await import('crypto');
      const fs = await import('fs');

      return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => {
          const computedChecksum = hash.digest('hex');
          resolve(computedChecksum.toLowerCase() === this.data.checksum.toLowerCase());
        });
        stream.on('error', reject);
      });
    } catch (error) {
      throw new Error(`Failed to validate checksum: ${error}`);
    }
  }

  /**
   * Check if package signature is valid (when available)
   */
  hasValidSignature(): boolean {
    // For now, just check if signature exists
    // In real implementation, this would verify the cryptographic signature
    return Boolean(this.data.signature);
  }

  // ===== Private Helper Methods =====

  private normalizePlatform(platform: string): PlatformType {
    switch (platform.toLowerCase()) {
      case 'darwin':
      case 'macos':
      case 'osx':
        return 'darwin';
      case 'win32':
      case 'windows':
        return 'win32';
      case 'linux':
        return 'linux';
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private normalizeArch(arch: string): ArchitectureType {
    switch (arch.toLowerCase()) {
      case 'x64':
      case 'x86_64':
      case 'amd64':
        return 'x64';
      case 'arm64':
      case 'aarch64':
        return 'arm64';
      case 'ia32':
      case 'x86':
      case 'i386':
        return 'ia32';
      case 'armv7l':
      case 'arm':
        return 'armv7l';
      default:
        throw new Error(`Unsupported architecture: ${arch}`);
    }
  }

  private getPlatformExtension(): string {
    switch (this.data.platform) {
      case 'darwin':
        return 'dmg';
      case 'win32':
        return 'exe';
      case 'linux':
        return 'AppImage';
      default:
        return 'bin';
    }
  }

  // ===== Comparison Methods =====

  /**
   * Check if this package is newer than given version
   */
  isNewerThan(version: string): boolean {
    return semver.gt(this.data.version, version);
  }

  /**
   * Check if this package is the same version
   */
  isSameVersion(version: string): boolean {
    return semver.eq(this.data.version, version);
  }

  /**
   * Compare with another UpdatePackage
   */
  compareVersion(other: UpdatePackage): -1 | 0 | 1 {
    return semver.compare(this.data.version, other.data.version);
  }

  // ===== Serialization =====

  /**
   * Convert to plain object for JSON serialization
   */
  toJSON(): IUpdatePackage {
    return { ...this.data };
  }

  /**
   * Create UpdatePackage from JSON data
   */
  static fromJSON(json: unknown): UpdatePackage {
    return new UpdatePackage(json as IUpdatePackage);
  }

  // ===== Update Operations =====

  /**
   * Create a new UpdatePackage with updated download URL
   */
  withDownloadUrl(downloadUrl: string): UpdatePackage {
    if (!downloadUrl.match(/^https?:\/\//)) {
      throw new Error('Download URL must use HTTP or HTTPS protocol');
    }

    return new UpdatePackage({
      ...this.data,
      downloadUrl,
    });
  }

  /**
   * Create a new UpdatePackage with updated signature
   */
  withSignature(signature: string): UpdatePackage {
    return new UpdatePackage({
      ...this.data,
      signature,
    });
  }

  // ===== Utility Methods =====

  /**
   * Get package summary for logging
   */
  getSummary(): string {
    const packageType = this.data.isDelta ? '📦 Delta' : '📦 Full';
    const sizeFormatted = this.getFormattedSize();
    const deltaInfo = this.data.isDelta ? ` (from ${this.data.baseVersion})` : '';

    return [`${packageType} v${this.data.version}${deltaInfo}`, `${this.data.platform}-${this.data.arch}`, sizeFormatted, this.data.signature ? '🔒 Signed' : '⚠️  Unsigned'].join(' | ');
  }

  /**
   * Check equality with another UpdatePackage
   */
  equals(other: UpdatePackage): boolean {
    return this.data.version === other.data.version && this.data.downloadUrl === other.data.downloadUrl && this.data.platform === other.data.platform && this.data.arch === other.data.arch && this.data.checksum === other.data.checksum && this.data.isDelta === other.data.isDelta && this.data.baseVersion === other.data.baseVersion;
  }

  /**
   * Get download priority score (lower is better)
   * Delta packages have higher priority (lower score)
   */
  getDownloadPriority(): number {
    let score = 0;

    // Delta packages get priority
    if (this.data.isDelta) {
      score -= 100;
    }

    // Smaller packages get priority
    score += this.data.fileSize / 1024 / 1024; // MB

    // Signed packages get slight priority
    if (this.data.signature) {
      score -= 10;
    }

    return score;
  }
}
