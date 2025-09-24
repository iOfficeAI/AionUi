/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { UpdatePackage } from '../../src/common/update/models/UpdatePackage';

// Helper function to generate valid test checksums
const generateTestChecksum = (seed: string = 'a'): string => {
  const validChars = '0123456789abcdef';
  const charCode = seed.charCodeAt(0) % validChars.length;
  return validChars[charCode].repeat(64);
};

describe('UpdatePackage Model', () => {
  describe('Basic Creation and Validation', () => {
    it('should create valid full UpdatePackage instance', () => {
      const updatePackage = UpdatePackage.createFull({
        version: '1.1.0',
        downloadUrl: 'https://releases.example.com/app-1.1.0-darwin-x64.dmg',
        platform: 'darwin',
        arch: 'x64',
        fileSize: 50 * 1024 * 1024, // 50MB
        checksum: generateTestChecksum('a'),
        signature: 'signature123',
      });

      expect(updatePackage.version).toBe('1.1.0');
      expect(updatePackage.platform).toBe('darwin');
      expect(updatePackage.arch).toBe('x64');
      expect(updatePackage.isDelta).toBe(false);
      expect(updatePackage.getPackageType()).toBe('full');
      expect(updatePackage.hasValidSignature()).toBe(true);
    });

    it('should create valid delta UpdatePackage instance', () => {
      const deltaPackage = UpdatePackage.createDelta({
        version: '1.1.0',
        baseVersion: '1.0.0',
        downloadUrl: 'https://releases.example.com/delta-1.0.0-to-1.1.0.bin',
        platform: 'win32',
        arch: 'arm64',
        fileSize: 5 * 1024 * 1024, // 5MB
        checksum: generateTestChecksum('b'),
        signature: 'delta_signature456',
      });

      expect(deltaPackage.version).toBe('1.1.0');
      expect(deltaPackage.baseVersion).toBe('1.0.0');
      expect(deltaPackage.isDelta).toBe(true);
      expect(deltaPackage.getPackageType()).toBe('delta');
      expect(deltaPackage.isApplicableDelta('1.0.0')).toBe(true);
      expect(deltaPackage.isApplicableDelta('0.9.0')).toBe(false);
    });

    it('should validate system compatibility', () => {
      const macPackage = UpdatePackage.createFull({
        version: '1.0.0',
        downloadUrl: 'https://example.com/app.dmg',
        platform: 'darwin',
        arch: 'arm64',
        fileSize: 1024,
        checksum: generateTestChecksum('c'),
      });

      expect(macPackage.isCompatibleWithSystem('darwin', 'arm64')).toBe(true);
      expect(macPackage.isCompatibleWithSystem('darwin', 'x64')).toBe(false);
      expect(macPackage.isCompatibleWithSystem('win32', 'arm64')).toBe(false);
    });

    it('should normalize platform and architecture names', () => {
      const package1 = UpdatePackage.createFull({
        version: '1.0.0',
        downloadUrl: 'https://example.com/app',
        platform: 'darwin',
        arch: 'x64',
        fileSize: 1024,
        checksum: generateTestChecksum('d'),
      });

      // Test platform normalization
      expect(package1.isCompatibleWithSystem('macos', 'x86_64')).toBe(true);
      expect(package1.isCompatibleWithSystem('osx', 'amd64')).toBe(true);
    });
  });

  describe('Size Formatting', () => {
    it('should format package sizes correctly', () => {
      const testCases = [
        { fileSize: 0, expected: '0 B' },
        { fileSize: 1024, expected: '1.0 KB' },
        { fileSize: 1024 * 1024, expected: '1.0 MB' },
        { fileSize: 50 * 1024 * 1024, expected: '50.0 MB' },
        { fileSize: 1024 * 1024 * 1024, expected: '1.0 GB' },
        { fileSize: 1536, expected: '1.5 KB' },
      ];

      testCases.forEach(({ fileSize, expected }) => {
        const pkg = UpdatePackage.createFull({
          version: '1.0.0',
          downloadUrl: 'https://example.com/app',
          platform: 'linux',
          arch: 'x64',
          fileSize,
          checksum: generateTestChecksum('e'),
        });

        expect(pkg.getFormattedSize()).toBe(expected);
      });
    });
  });

  describe('Version Comparison', () => {
    it('should compare versions correctly', () => {
      const package1 = UpdatePackage.createFull({
        version: '1.0.0',
        downloadUrl: 'https://example.com/app',
        platform: 'linux',
        arch: 'x64',
        fileSize: 1024,
        checksum: generateTestChecksum('f'),
      });

      const package2 = UpdatePackage.createFull({
        version: '1.1.0',
        downloadUrl: 'https://example.com/app',
        platform: 'linux',
        arch: 'x64',
        fileSize: 1024,
        checksum: generateTestChecksum('f'),
      });

      expect(package1.isNewerThan('0.9.0')).toBe(true);
      expect(package1.isNewerThan('1.0.0')).toBe(false);
      expect(package1.isNewerThan('1.1.0')).toBe(false);

      expect(package1.isSameVersion('1.0.0')).toBe(true);
      expect(package1.isSameVersion('1.1.0')).toBe(false);

      expect(package1.compareVersion(package2)).toBe(-1);
      expect(package2.compareVersion(package1)).toBe(1);
      expect(package1.compareVersion(package1)).toBe(0);
    });
  });

  describe('Expected Filename Generation', () => {
    it('should generate correct filenames for different platforms', () => {
      const testCases = [
        {
          platform: 'darwin' as const,
          arch: 'x64' as const,
          isDelta: false,
          expected: 'update-1.0.0-darwin-x64.dmg',
        },
        {
          platform: 'win32' as const,
          arch: 'arm64' as const,
          isDelta: false,
          expected: 'update-1.0.0-win32-arm64.exe',
        },
        {
          platform: 'linux' as const,
          arch: 'x64' as const,
          isDelta: false,
          expected: 'update-1.0.0-linux-x64.AppImage',
        },
        {
          platform: 'linux' as const,
          arch: 'armv7l' as const,
          isDelta: true,
          expected: 'delta-update-1.0.0-linux-armv7l.AppImage',
        },
      ];

      testCases.forEach(({ platform, arch, isDelta, expected }) => {
        const pkg = isDelta
          ? UpdatePackage.createDelta({
              version: '1.0.0',
              baseVersion: '0.9.0',
              downloadUrl: 'https://example.com/app',
              platform,
              arch,
              fileSize: 1024,
              checksum: generateTestChecksum('g'),
            })
          : UpdatePackage.createFull({
              version: '1.0.0',
              downloadUrl: 'https://example.com/app',
              platform,
              arch,
              fileSize: 1024,
              checksum: generateTestChecksum('g'),
            });

        expect(pkg.getExpectedFilename()).toBe(expected);
      });
    });
  });

  describe('Download Priority', () => {
    it('should calculate download priority correctly', () => {
      const fullPackage = UpdatePackage.createFull({
        version: '1.0.0',
        downloadUrl: 'https://example.com/app',
        platform: 'darwin',
        arch: 'x64',
        fileSize: 50 * 1024 * 1024, // 50MB
        checksum: generateTestChecksum('h'),
      });

      const deltaPackage = UpdatePackage.createDelta({
        version: '1.0.0',
        baseVersion: '0.9.0',
        downloadUrl: 'https://example.com/delta',
        platform: 'darwin',
        arch: 'x64',
        fileSize: 5 * 1024 * 1024, // 5MB
        checksum: generateTestChecksum('i'),
        signature: 'signed',
      });

      const signedFullPackage = UpdatePackage.createFull({
        version: '1.0.0',
        downloadUrl: 'https://example.com/app',
        platform: 'darwin',
        arch: 'x64',
        fileSize: 50 * 1024 * 1024, // 50MB
        checksum: generateTestChecksum('j'),
        signature: 'signed',
      });

      // Delta package should have highest priority (lowest score)
      expect(deltaPackage.getDownloadPriority()).toBeLessThan(fullPackage.getDownloadPriority());
      expect(deltaPackage.getDownloadPriority()).toBeLessThan(signedFullPackage.getDownloadPriority());

      // Signed package should have higher priority than unsigned
      expect(signedFullPackage.getDownloadPriority()).toBeLessThan(fullPackage.getDownloadPriority());
    });
  });

  describe('Immutable Updates', () => {
    it('should create new instance when updating download URL', () => {
      const original = UpdatePackage.createFull({
        version: '1.0.0',
        downloadUrl: 'https://example.com/original',
        platform: 'darwin',
        arch: 'x64',
        fileSize: 1024,
        checksum: generateTestChecksum('k'),
      });

      const updated = original.withDownloadUrl('https://example.com/updated');

      expect(original.downloadUrl).toBe('https://example.com/original');
      expect(updated.downloadUrl).toBe('https://example.com/updated');
      expect(updated.version).toBe(original.version);
    });

    it('should create new instance when updating signature', () => {
      const original = UpdatePackage.createFull({
        version: '1.0.0',
        downloadUrl: 'https://example.com/app',
        platform: 'darwin',
        arch: 'x64',
        fileSize: 1024,
        checksum: generateTestChecksum('l'),
      });

      const signed = original.withSignature('new_signature');

      expect(original.signature).toBeUndefined();
      expect(signed.signature).toBe('new_signature');
      expect(signed.hasValidSignature()).toBe(true);
    });
  });

  describe('Serialization', () => {
    it('should serialize to and from JSON correctly', () => {
      const original = UpdatePackage.createDelta({
        version: '1.1.0',
        baseVersion: '1.0.0',
        downloadUrl: 'https://example.com/delta',
        platform: 'win32',
        arch: 'x64',
        fileSize: 10 * 1024 * 1024,
        checksum: generateTestChecksum('m'),
        signature: 'delta_sig',
      });

      const json = original.toJSON();
      const restored = UpdatePackage.fromJSON(json);

      expect(restored.equals(original)).toBe(true);
      expect(restored.version).toBe(original.version);
      expect(restored.isDelta).toBe(original.isDelta);
      expect(restored.baseVersion).toBe(original.baseVersion);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid version format', () => {
      expect(() => {
        UpdatePackage.createFull({
          version: 'invalid',
          downloadUrl: 'https://example.com/app',
          platform: 'darwin',
          arch: 'x64',
          fileSize: 1024,
          checksum: generateTestChecksum('n'),
        });
      }).toThrow('Invalid package version format');
    });

    it('should throw error for invalid download URL', () => {
      expect(() => {
        UpdatePackage.createFull({
          version: '1.0.0',
          downloadUrl: 'ftp://example.com/app',
          platform: 'darwin',
          arch: 'x64',
          fileSize: 1024,
          checksum: generateTestChecksum('o'),
        });
      }).toThrow('Download URL must use HTTP or HTTPS protocol');
    });

    it('should throw error for invalid checksum format', () => {
      expect(() => {
        UpdatePackage.createFull({
          version: '1.0.0',
          downloadUrl: 'https://example.com/app',
          platform: 'darwin',
          arch: 'x64',
          fileSize: 1024,
          checksum: 'invalid_checksum',
        });
      }).toThrow('Checksum must be a valid SHA256 hash');
    });

    it('should throw error for negative package size', () => {
      expect(() => {
        UpdatePackage.createFull({
          version: '1.0.0',
          downloadUrl: 'https://example.com/app',
          platform: 'darwin',
          arch: 'x64',
          fileSize: -1024,
          checksum: generateTestChecksum('p'),
        });
      }).toThrow('Package size must be a non-negative number');
    });

    it('should throw error for delta package without baseVersion', () => {
      expect(() => {
        UpdatePackage.create({
          version: '1.1.0',
          downloadUrl: 'https://example.com/delta',
          platform: 'darwin',
          arch: 'x64',
          fileSize: 1024,
          checksum: generateTestChecksum('q'),
          isDelta: true,
          // baseVersion is missing
        });
      }).toThrow('Delta packages must specify baseVersion');
    });

    it('should throw error for invalid baseVersion format', () => {
      expect(() => {
        UpdatePackage.createDelta({
          version: '1.1.0',
          baseVersion: 'invalid',
          downloadUrl: 'https://example.com/delta',
          platform: 'darwin',
          arch: 'x64',
          fileSize: 1024,
          checksum: generateTestChecksum('r'),
        });
      }).toThrow('Invalid baseVersion format');
    });

    it('should throw error for unsupported platform', () => {
      const pkg = UpdatePackage.createFull({
        version: '1.0.0',
        downloadUrl: 'https://example.com/app',
        platform: 'darwin',
        arch: 'x64',
        fileSize: 1024,
        checksum: generateTestChecksum('s'),
      });

      expect(() => {
        pkg.isCompatibleWithSystem('unsupported', 'x64');
      }).toThrow('Unsupported platform');
    });

    it('should throw error for unsupported architecture', () => {
      const pkg = UpdatePackage.createFull({
        version: '1.0.0',
        downloadUrl: 'https://example.com/app',
        platform: 'darwin',
        arch: 'x64',
        fileSize: 1024,
        checksum: generateTestChecksum('t'),
      });

      expect(() => {
        pkg.isCompatibleWithSystem('darwin', 'unsupported');
      }).toThrow('Unsupported architecture');
    });
  });

  describe('Summary Generation', () => {
    it('should generate informative summary for full package', () => {
      const pkg = UpdatePackage.createFull({
        version: '1.2.0',
        downloadUrl: 'https://example.com/app',
        platform: 'darwin',
        arch: 'arm64',
        fileSize: 25 * 1024 * 1024, // 25MB
        checksum: generateTestChecksum('u'),
        signature: 'signed_package',
      });

      const summary = pkg.getSummary();
      expect(summary).toContain('📦 Full v1.2.0');
      expect(summary).toContain('darwin-arm64');
      expect(summary).toContain('25.0 MB');
      expect(summary).toContain('🔒 Signed');
    });

    it('should generate informative summary for delta package', () => {
      const pkg = UpdatePackage.createDelta({
        version: '1.2.0',
        baseVersion: '1.1.0',
        downloadUrl: 'https://example.com/delta',
        platform: 'win32',
        arch: 'x64',
        fileSize: 5 * 1024 * 1024, // 5MB
        checksum: generateTestChecksum('v'),
      });

      const summary = pkg.getSummary();
      expect(summary).toContain('📦 Delta v1.2.0 (from 1.1.0)');
      expect(summary).toContain('win32-x64');
      expect(summary).toContain('5.0 MB');
      expect(summary).toContain('⚠️  Unsigned');
    });
  });
});