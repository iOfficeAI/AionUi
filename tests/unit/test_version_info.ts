/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { VersionInfo } from '../../src/common/update/models/VersionInfo';

describe('VersionInfo Model', () => {
  describe('Basic Creation and Validation', () => {
    it('should create valid VersionInfo instance', () => {
      const versionInfo = VersionInfo.create({
        current: '1.0.0',
        latest: '1.1.0',
        minimumRequired: '0.9.0',
        releaseNotes: 'Bug fixes and improvements',
      });

      expect(versionInfo.current).toBe('1.0.0');
      expect(versionInfo.latest).toBe('1.1.0');
      expect(versionInfo.minimumRequired).toBe('0.9.0');
      expect(versionInfo.isUpdateAvailable).toBe(true);
      expect(versionInfo.isForced).toBe(false);
    });

    it('should detect force update when current version is below minimum', () => {
      const versionInfo = VersionInfo.create({
        current: '0.8.0',
        latest: '1.1.0',
        minimumRequired: '1.0.0',
      });

      expect(versionInfo.isForced).toBe(true);
      expect(versionInfo.requiresForceUpdate()).toBe(true);
      expect(versionInfo.satisfiesMinimumVersion()).toBe(false);
    });

    it('should handle no update available scenario', () => {
      const versionInfo = VersionInfo.create({
        current: '1.1.0',
        latest: '1.1.0',
      });

      expect(versionInfo.isUpdateAvailable).toBe(false);
      expect(versionInfo.getUpdateType()).toBe('none');
      expect(versionInfo.getVersionGap()).toBe('Up to date');
    });
  });

  describe('Version Comparison Logic', () => {
    it('should correctly identify update types', () => {
      const scenarios = [
        { current: '1.0.0', latest: '2.0.0', expected: 'major' },
        { current: '1.0.0', latest: '1.1.0', expected: 'minor' },
        { current: '1.0.0', latest: '1.0.1', expected: 'patch' },
        { current: '1.0.0', latest: '1.0.0-alpha.1', expected: 'none' },
      ];

      scenarios.forEach(({ current, latest, expected }) => {
        const versionInfo = VersionInfo.create({ current, latest });
        expect(versionInfo.getUpdateType()).toBe(expected);
      });
    });

    it('should detect breaking updates', () => {
      const majorUpdate = VersionInfo.create({
        current: '1.0.0',
        latest: '2.0.0',
      });

      const minorUpdate = VersionInfo.create({
        current: '1.0.0',
        latest: '1.1.0',
      });

      expect(majorUpdate.isBreakingUpdate()).toBe(true);
      expect(minorUpdate.isBreakingUpdate()).toBe(false);
    });
  });

  describe('Static Utility Methods', () => {
    it('should validate version formats', () => {
      expect(VersionInfo.isValidVersion('1.0.0')).toBe(true);
      expect(VersionInfo.isValidVersion('1.0.0-alpha.1')).toBe(true);
      expect(VersionInfo.isValidVersion('invalid')).toBe(false);
      expect(VersionInfo.isValidVersion('1.0')).toBe(false);
    });

    it('should compare versions correctly', () => {
      expect(VersionInfo.compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(VersionInfo.compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(VersionInfo.compareVersions('1.0.0', '1.0.0')).toBe(0);
    });
  });

  describe('Immutable Updates', () => {
    it('should create new instance when updating latest version', () => {
      const original = VersionInfo.create({
        current: '1.0.0',
        latest: '1.0.0',
      });

      const updated = original.withLatestVersion('1.1.0', 'New features added');

      expect(original.latest).toBe('1.0.0');
      expect(updated.latest).toBe('1.1.0');
      expect(updated.isUpdateAvailable).toBe(true);
      expect(updated.releaseNotes).toBe('New features added');
    });

    it('should handle version upgrade correctly', () => {
      const versionInfo = VersionInfo.create({
        current: '1.0.0',
        latest: '1.2.0',
        minimumRequired: '1.1.0',
      });

      const afterUpgrade = versionInfo.afterUpgrade('1.2.0');

      expect(afterUpgrade.current).toBe('1.2.0');
      expect(afterUpgrade.isUpdateAvailable).toBe(false);
      expect(afterUpgrade.isForced).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should serialize to and from JSON correctly', () => {
      const original = VersionInfo.create({
        current: '1.0.0',
        latest: '1.1.0',
        minimumRequired: '0.9.0',
        releaseNotes: 'Test release',
      });

      const json = original.toJSON();
      const restored = VersionInfo.fromJSON(json);

      expect(restored.equals(original)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid version format', () => {
      expect(() => {
        VersionInfo.create({
          current: 'invalid',
          latest: '1.0.0',
        });
      }).toThrow('Invalid current version format');
    });

    it('should throw error for invalid latest version format', () => {
      expect(() => {
        VersionInfo.create({
          current: '1.0.0',
          latest: 'invalid',
        });
      }).toThrow('Invalid latest version format');
    });

    it('should throw error for invalid minimum required version format', () => {
      expect(() => {
        VersionInfo.create({
          current: '1.0.0',
          latest: '1.1.0',
          minimumRequired: 'invalid',
        });
      }).toThrow('Invalid minimum required version format');
    });
  });
});
