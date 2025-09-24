/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import * as semver from 'semver';
import { VersionInfoSchema, type VersionInfo as IVersionInfo } from '../../../types/updateTypes';

/**
 * Version Information Model
 *
 * Encapsulates version information with business logic for comparison,
 * validation, and force update determination.
 */
export class VersionInfo {
  private readonly data: IVersionInfo;

  constructor(data: IVersionInfo) {
    // Validate input data using Zod schema
    const validationResult = VersionInfoSchema.safeParse(data);
    if (!validationResult.success) {
      throw new Error(`Invalid version info: ${validationResult.error.message}`);
    }

    this.data = validationResult.data;
  }

  // ===== Static Factory Methods =====

  /**
   * Create VersionInfo from current package.json and remote version data
   */
  static create(params: { current: string; latest: string; minimumRequired?: string; releaseDate?: string; releaseNotes?: string }): VersionInfo {
    // Validate version formats first
    if (!semver.valid(params.current)) {
      throw new Error(`Invalid current version format: ${params.current}`);
    }
    if (!semver.valid(params.latest)) {
      throw new Error(`Invalid latest version format: ${params.latest}`);
    }
    if (params.minimumRequired && !semver.valid(params.minimumRequired)) {
      throw new Error(`Invalid minimum required version format: ${params.minimumRequired}`);
    }

    const isUpdateAvailable = semver.gt(params.latest, params.current);
    const isForced = params.minimumRequired ? semver.lt(params.current, params.minimumRequired) : false;

    return new VersionInfo({
      current: params.current,
      latest: params.latest,
      minimumRequired: params.minimumRequired,
      releaseDate: params.releaseDate,
      releaseNotes: params.releaseNotes,
      isUpdateAvailable,
      isForced,
    });
  }

  /**
   * Create VersionInfo for current application version only
   */
  static fromCurrentVersion(currentVersion: string): VersionInfo {
    return new VersionInfo({
      current: currentVersion,
      latest: currentVersion,
      isUpdateAvailable: false,
      isForced: false,
    });
  }

  // ===== Getters =====

  get current(): string {
    return this.data.current;
  }

  get latest(): string {
    return this.data.latest;
  }

  get minimumRequired(): string | undefined {
    return this.data.minimumRequired;
  }

  get releaseDate(): string | undefined {
    return this.data.releaseDate;
  }

  get releaseNotes(): string | undefined {
    return this.data.releaseNotes;
  }

  get isUpdateAvailable(): boolean {
    return this.data.isUpdateAvailable;
  }

  get isForced(): boolean {
    return this.data.isForced;
  }

  // ===== Business Logic Methods =====

  /**
   * Check if the current version satisfies the minimum requirement
   */
  satisfiesMinimumVersion(): boolean {
    if (!this.data.minimumRequired) {
      return true; // No minimum requirement
    }

    return semver.gte(this.data.current, this.data.minimumRequired);
  }

  /**
   * Check if force update is required
   */
  requiresForceUpdate(): boolean {
    return this.data.isForced;
  }

  /**
   * Get the version difference type (major, minor, patch)
   */
  getUpdateType(): 'major' | 'minor' | 'patch' | 'prerelease' | 'none' {
    if (!this.data.isUpdateAvailable) {
      return 'none';
    }

    const current = semver.parse(this.data.current);
    const latest = semver.parse(this.data.latest);

    if (!current || !latest) {
      return 'none';
    }

    if (latest.major > current.major) {
      return 'major';
    } else if (latest.minor > current.minor) {
      return 'minor';
    } else if (latest.patch > current.patch) {
      return 'patch';
    } else {
      return 'prerelease';
    }
  }

  /**
   * Check if the update is a breaking change (major version)
   */
  isBreakingUpdate(): boolean {
    return this.getUpdateType() === 'major';
  }

  /**
   * Get human-readable version comparison
   */
  getVersionGap(): string {
    if (!this.data.isUpdateAvailable) {
      return 'Up to date';
    }

    const updateType = this.getUpdateType();
    const gap = semver.diff(this.data.current, this.data.latest);

    return `${updateType} update available (${this.data.current} → ${this.data.latest})`;
  }

  /**
   * Validate version format using semver
   */
  static isValidVersion(version: string): boolean {
    return semver.valid(version) !== null;
  }

  /**
   * Compare two versions
   */
  static compareVersions(version1: string, version2: string): -1 | 0 | 1 {
    return semver.compare(version1, version2);
  }

  // ===== Serialization =====

  /**
   * Convert to plain object for JSON serialization
   */
  toJSON(): IVersionInfo {
    return { ...this.data };
  }

  /**
   * Create VersionInfo from JSON data
   */
  static fromJSON(json: unknown): VersionInfo {
    return new VersionInfo(json as IVersionInfo);
  }

  // ===== Update Operations =====

  /**
   * Create a new VersionInfo with updated latest version
   */
  withLatestVersion(latest: string, releaseNotes?: string, releaseDate?: string): VersionInfo {
    const isUpdateAvailable = semver.gt(latest, this.data.current);

    return new VersionInfo({
      ...this.data,
      latest,
      releaseNotes: releaseNotes || this.data.releaseNotes,
      releaseDate: releaseDate || this.data.releaseDate,
      isUpdateAvailable,
    });
  }

  /**
   * Create a new VersionInfo with updated minimum required version
   */
  withMinimumRequired(minimumRequired: string): VersionInfo {
    const isForced = semver.lt(this.data.current, minimumRequired);

    return new VersionInfo({
      ...this.data,
      minimumRequired,
      isForced,
    });
  }

  /**
   * Create a new VersionInfo after version upgrade
   */
  afterUpgrade(newVersion: string): VersionInfo {
    return new VersionInfo({
      ...this.data,
      current: newVersion,
      isUpdateAvailable: semver.gt(this.data.latest, newVersion),
      isForced: this.data.minimumRequired ? semver.lt(newVersion, this.data.minimumRequired) : false,
    });
  }

  // ===== Utility Methods =====

  /**
   * Get version info summary for logging
   */
  getSummary(): string {
    return [`Current: ${this.data.current}`, `Latest: ${this.data.latest}`, this.data.minimumRequired ? `Minimum: ${this.data.minimumRequired}` : null, this.data.isUpdateAvailable ? '📥 Update available' : '✅ Up to date', this.data.isForced ? '⚠️  Force update required' : null].filter(Boolean).join(' | ');
  }

  /**
   * Check equality with another VersionInfo
   */
  equals(other: VersionInfo): boolean {
    return this.data.current === other.data.current && this.data.latest === other.data.latest && this.data.minimumRequired === other.data.minimumRequired && this.data.isUpdateAvailable === other.data.isUpdateAvailable && this.data.isForced === other.data.isForced;
  }
}
