/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import semver from 'semver';

export type VersionUpdateType = 'major' | 'minor' | 'patch' | 'none';

export interface VersionInfoJSON {
  current: string;
  latest: string;
  minimumRequired?: string;
  releaseNotes?: string;
}

export class VersionInfo {
  readonly current: string;
  readonly latest: string;
  readonly minimumRequired?: string;
  readonly releaseNotes?: string;

  private constructor(data: VersionInfoJSON) {
    this.current = data.current;
    this.latest = data.latest;
    this.minimumRequired = data.minimumRequired;
    this.releaseNotes = data.releaseNotes;
  }

  static create(input: VersionInfoJSON): VersionInfo {
    const current = VersionInfo.assertValidVersion(input.current, 'current');
    const latest = VersionInfo.assertValidVersion(input.latest, 'latest');

    let minimumRequired: string | undefined;
    if (input.minimumRequired !== undefined) {
      minimumRequired = VersionInfo.assertValidVersion(input.minimumRequired, 'minimum required');
    }

    return new VersionInfo({
      current,
      latest,
      minimumRequired,
      releaseNotes: input.releaseNotes,
    });
  }

  static fromJSON(json: VersionInfoJSON): VersionInfo {
    return VersionInfo.create(json);
  }

  toJSON(): VersionInfoJSON {
    return {
      current: this.current,
      latest: this.latest,
      minimumRequired: this.minimumRequired,
      releaseNotes: this.releaseNotes,
    };
  }

  equals(other: VersionInfo): boolean {
    return this.current === other.current && this.latest === other.latest && this.minimumRequired === other.minimumRequired && this.releaseNotes === other.releaseNotes;
  }

  get isUpdateAvailable(): boolean {
    return semver.gt(this.latest, this.current);
  }

  get isForced(): boolean {
    if (!this.minimumRequired) return false;
    return semver.lt(this.current, this.minimumRequired);
  }

  requiresForceUpdate(): boolean {
    return this.isForced;
  }

  satisfiesMinimumVersion(): boolean {
    if (!this.minimumRequired) return true;
    return semver.gte(this.current, this.minimumRequired);
  }

  getUpdateType(): VersionUpdateType {
    if (!this.isUpdateAvailable) return 'none';

    const diff = semver.diff(this.current, this.latest);
    switch (diff) {
      case 'major':
      case 'premajor':
        return 'major';
      case 'minor':
      case 'preminor':
        return 'minor';
      case 'patch':
      case 'prepatch':
      case 'prerelease':
        return 'patch';
      default:
        return 'none';
    }
  }

  isBreakingUpdate(): boolean {
    return this.isForced || this.getUpdateType() === 'major';
  }

  getVersionGap(): string {
    if (!this.isUpdateAvailable) return 'Up to date';
    return `${this.current} -> ${this.latest}`;
  }

  withLatestVersion(latest: string, releaseNotes?: string): VersionInfo {
    const nextLatest = VersionInfo.assertValidVersion(latest, 'latest');
    return VersionInfo.create({
      current: this.current,
      latest: nextLatest,
      minimumRequired: this.minimumRequired,
      releaseNotes: releaseNotes ?? this.releaseNotes,
    });
  }

  afterUpgrade(current: string): VersionInfo {
    const nextCurrent = VersionInfo.assertValidVersion(current, 'current');
    return VersionInfo.create({
      current: nextCurrent,
      latest: this.latest,
      minimumRequired: this.minimumRequired,
      releaseNotes: this.releaseNotes,
    });
  }

  static isValidVersion(version: string): boolean {
    return Boolean(semver.valid(version));
  }

  static compareVersions(a: string, b: string): number {
    return semver.compare(a, b);
  }

  private static assertValidVersion(version: string, field: 'current' | 'latest' | 'minimum required'): string {
    const valid = semver.valid(version);
    if (!valid) {
      switch (field) {
        case 'current':
          throw new Error('Invalid current version format');
        case 'latest':
          throw new Error('Invalid latest version format');
        case 'minimum required':
          throw new Error('Invalid minimum required version format');
      }
    }
    return valid;
  }
}
